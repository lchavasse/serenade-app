import { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import redis from '@/lib/redis';

// Configure runtime for background function
export const config = {
  runtime: 'nodejs',
  // Note: maxDuration is handled by Vercel deployment config, not Next.js API routes
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'eu-west-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { jobId, images } = req.body;

  if (!jobId || !images) {
    return res.status(400).json({ error: 'Missing jobId or images data' });
  }

  // Respond immediately to avoid timeout
  res.status(200).json({ message: 'Background processing started' });

  // Process in background
  try {
    await processImageInBackground(jobId, images);
  } catch (error) {
    console.error('Background processing error:', error);
    
    // Update Redis with error status
    await redis.set(
      `job:${jobId}`, 
      JSON.stringify({ 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error'
      }), 
      { ex: 86400 }
    );
  }
}

export async function processImageInBackground(jobId: string, images: { data: string; mime_type: string }[]) {
  try {
    console.log(`Starting background processing for job ${jobId} with ${images.length} images`);

    // Validate required environment variables
    if (!process.env.S3_BUCKET_NAME) {
      throw new Error('S3_BUCKET_NAME environment variable is required');
    }
    if (!process.env.AWS_ACCESS_KEY_ID) {
      throw new Error('AWS_ACCESS_KEY_ID environment variable is required');
    }
    if (!process.env.AWS_SECRET_ACCESS_KEY) {
      throw new Error('AWS_SECRET_ACCESS_KEY environment variable is required');
    }

    // Step 1: Analyze the dating profile with OpenAI Vision
    console.log('Step 1: Analyzing dating profile...');
    
    // Build content array with text prompt and all images
    const content = [
      {
        type: "text" as const,
        text: `Analyze these ${images.length} dating profile photos. Look at the person's style, interests, activities, settings, and overall vibe shown across all the images. Based on this comprehensive view of their personality and lifestyle, describe what type of person would be their ideal romantic match - their potential interests, lifestyle, personality traits, and what they might look like. Create a detailed description for generating an attractive, compatible partner.`
      },
      ...images.map(image => ({
        type: "image_url" as const,
        image_url: {
          url: `data:${image.mime_type};base64,${image.data}`
        }
      }))
    ];

    const analysisResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: content
        }
      ],
      max_tokens: 500
    });

    const analysis = analysisResponse.choices[0].message.content;
    console.log('Analysis completed:', analysis?.substring(0, 100) + '...');

    // Step 2: Generate image of ideal match using DALL-E
    console.log('Step 2: Generating ideal match image...');
    const dalleResponse = await openai.images.generate({
      model: "dall-e-3",
      prompt: `Create a high-quality, realistic portrait photo of a person who would be the ideal romantic match based on this analysis: ${analysis}. The image should look like a professional dating profile photo - warm, inviting, and attractive. Focus on creating someone who would genuinely complement the person described.`,
      size: "1024x1024",
      quality: "standard",
      n: 1,
    });

    if (!dalleResponse.data || !dalleResponse.data[0]?.url) {
      throw new Error('Failed to generate image with DALL-E');
    }

    const generatedImageUrl = dalleResponse.data[0].url;
    console.log('Image generated successfully');

    // Step 3: Download the generated image
    console.log('Step 3: Downloading generated image...');
    const imageResponse = await fetch(generatedImageUrl);
    const generatedImageBuffer = await imageResponse.arrayBuffer();

    // Step 4: Upload to S3
    console.log('Step 4: Uploading to S3...');
    const s3Key = `images/${jobId}.png`;
    const putCommand = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: s3Key,
      Body: Buffer.from(generatedImageBuffer),
      ContentType: 'image/png',
    });

    await s3Client.send(putCommand);
    console.log('S3 upload completed');

    // Step 5: Generate signed URL for sharing
    console.log('Step 5: Generating signed URL...');
    const getCommand = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: s3Key,
    });

    const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 604800 }); // 7 days

    // Step 6: Update Redis with completion status
    console.log('Step 6: Updating Redis with completion status...');
    await redis.set(
      `job:${jobId}`, 
      JSON.stringify({ 
        status: 'done', 
        imageUrl: signedUrl,
        analysis: analysis 
      }), 
      { ex: 86400 }
    );

    console.log(`Background processing completed successfully for job ${jobId}`);

  } catch (error) {
    console.error('Error in background processing:', error);
    throw error; // Re-throw to be handled by caller
  }
}
