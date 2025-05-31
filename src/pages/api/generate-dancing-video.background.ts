import { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';
import { fal } from "@fal-ai/client";
import redis from '@/lib/redis';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { JobData } from './create-job';

// Configure runtime for background function
export const config = {
  runtime: 'nodejs',
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configure fal.ai client
if (process.env.FAL_KEY) {
  fal.config({
    credentials: process.env.FAL_KEY
  });
}

// Configure S3 client
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

  const { jobId, imageUrl, prompt } = req.body;

  if (!jobId || !imageUrl || !prompt) {
    return res.status(400).json({ error: 'Missing jobId, imageUrl, or prompt data' });
  }

  // Respond immediately to avoid timeout
  res.status(200).json({ message: 'Background processing started' });

  // Process in background
  try {
    await processDancingVideoInBackground(jobId, imageUrl, prompt);
  } catch (error) {
    console.error('Background processing error:', error);
    await updateJobWithError(jobId, error instanceof Error ? error.message : 'Unknown error');
  }
}

export async function processDancingVideoInBackground(
  jobId: string, 
  imageUrl: string, 
  prompt: string
) {
  try {
    console.log(`Starting dancing video generation for job ${jobId}`);

    // Validate required environment variables
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    if (!process.env.FAL_KEY) {
      throw new Error('FAL_KEY environment variable is required');
    }

    // Step 1: Update status to processing
    await updateJobStatus(jobId, 'processing');

    // Step 2: Enhance the prompt with OpenAI GPT-4o using the profile image
    console.log('Step 1: Enhancing prompt with GPT-4o...');
    
    const promptEnhancementResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are an expert at creating prompts for AI video generation. Looking at this profile image and the user's request: "${prompt}", create an enhanced, detailed prompt for generating a dancing video. The prompt should:

1. Describe the person's appearance based on the image (clothing, style, setting)
2. Incorporate the dancing request with specific, vivid details
3. Include camera movement and cinematic elements
4. Specify the mood, lighting, and atmosphere
5. Be optimized for high-quality video generation

Keep the enhanced prompt under 500 characters and make it engaging and visually rich. Focus on creating a prompt that will result in smooth, natural movement and an aesthetically pleasing video.

Enhanced prompt:`
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl
              }
            }
          ]
        }
      ],
      max_tokens: 200
    });

    const enhancedPrompt = promptEnhancementResponse.choices[0].message.content;
    console.log('Enhanced prompt:', enhancedPrompt);

    if (!enhancedPrompt) {
      throw new Error('Failed to generate enhanced prompt');
    }

    // Validate and clean the enhanced prompt
    let cleanedPrompt = enhancedPrompt.trim();
    
    // Ensure the prompt is not too long (fal.ai might have limits)
    if (cleanedPrompt.length > 500) {
      cleanedPrompt = cleanedPrompt.substring(0, 497) + '...';
      console.log('Truncated long prompt to 500 characters');
    }
    
    // Remove any potentially problematic content patterns
    cleanedPrompt = cleanedPrompt
      .replace(/\b(nude|naked|explicit|nsfw)\b/gi, 'artistic')
      .replace(/\b(violence|violent|blood|gore)\b/gi, 'dynamic');
    
    console.log('Cleaned prompt:', cleanedPrompt);

    // Update job with enhanced prompt
    await updateJobWithEnhancedPrompt(jobId, cleanedPrompt);

    // Step 3: Submit job to fal.ai
    console.log('Step 2: Submitting video generation job to fal.ai...');
    
    const { request_id } = await fal.queue.submit("fal-ai/kling-video/v2.1/standard/image-to-video", {
      input: {
        prompt: cleanedPrompt,
        image_url: imageUrl,
        duration: "5", // String format as in docs
        aspect_ratio: "9:16", // Mobile format
        negative_prompt: "blur, distort, and low quality", // Add default negative prompt
        cfg_scale: 0.5
      }
    });

    console.log('Video generation job submitted with request_id:', request_id);

    // Update job with fal request ID
    await updateJobWithFalRequestId(jobId, request_id);

    // Step 4: Poll for completion
    console.log('Step 3: Polling for video generation completion...');
    
    let videoResult: { data?: { video?: { url: string } } } | undefined = undefined;
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes with 5-second intervals
    
    while (attempts < maxAttempts) {
      try {
        videoResult = await fal.queue.result("fal-ai/kling-video/v2.1/standard/image-to-video", {
          requestId: request_id
        });
        
        if (videoResult) {
          console.log('Video generation completed');
          break;
        }
      } catch (error: unknown) {
        if (error instanceof Error && (error.message.includes('Request is still in queue') || error.message.includes('Request is being processed'))) {
          console.log(`Attempt ${attempts + 1}: Video still generating...`);
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
          attempts++;
          continue;
        } else {
          // Log the full error details for debugging
          console.error('fal.ai video generation error:', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            requestId: request_id,
            attempts: attempts + 1,
            // Try to extract the error body if it's an API error
            errorBody: (error as any)?.body || (error as any)?.response?.data || 'No error body available'
          });
          
          // Check if this is a 400 error that might indicate the job failed
          if (error instanceof Error && error.message.includes('Bad Request')) {
            // Try to get more details about why the request failed
            try {
              const statusResponse = await fal.queue.status("fal-ai/kling-video/v2.1/standard/image-to-video", {
                requestId: request_id,
                logs: true,
              });
              console.error('Job status details:', statusResponse);
            } catch (statusError) {
              console.error('Could not get job status:', statusError);
            }
          }
          
          throw error;
        }
      }
    }

    if (!videoResult) {
      throw new Error('Video generation timed out after 10 minutes');
    }

    if (!videoResult.data?.video?.url) {
      throw new Error('No video URL in result');
    }

    console.log('Video generated successfully:', videoResult.data.video.url);

    // Step 5: Download and upload to S3
    console.log('Step 4: Downloading video and uploading to S3...');
    
    const videoResponse = await fetch(videoResult.data.video.url);
    if (!videoResponse.ok) {
      throw new Error(`Failed to download video: ${videoResponse.statusText}`);
    }

    const videoBuffer = await videoResponse.arrayBuffer();
    console.log('Video downloaded, size:', videoBuffer.byteLength);

    // Upload to S3
    const s3Key = `videos/${jobId}.mp4`;
    const putCommand = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: s3Key,
      Body: Buffer.from(videoBuffer),
      ContentType: 'video/mp4',
    });

    await s3Client.send(putCommand);
    console.log('S3 upload completed');

    // Generate signed URL for sharing
    console.log('Generating signed URL...');
    const getCommand = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: s3Key,
    });

    const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 604800 }); // 7 days

    // Step 6: Update job to completed
    await updateJobWithVideoUrl(jobId, signedUrl);

    console.log(`Dancing video generation completed successfully for job ${jobId}`);

  } catch (error) {
    console.error('Error in dancing video generation:', error);
    throw error; // Re-throw to be handled by caller
  }
}

// Helper functions to update job status
async function updateJobStatus(jobId: string, status: 'pending' | 'processing' | 'completed' | 'error') {
  const currentJobData = await redis.get(`job:${jobId}`);
  if (!currentJobData) {
    throw new Error(`Job ${jobId} not found`);
  }
  
  const jobData = currentJobData as JobData & { type: 'video' };
  const updatedJobData: JobData = {
    ...jobData,
    status,
    updatedAt: new Date().toISOString(),
  };
  
  await redis.set(`job:${jobId}`, JSON.stringify(updatedJobData), { ex: 86400 });
}

async function updateJobWithEnhancedPrompt(jobId: string, enhancedPrompt: string) {
  const currentJobData = await redis.get(`job:${jobId}`);
  if (!currentJobData) {
    throw new Error(`Job ${jobId} not found`);
  }
  
  const jobData = currentJobData as JobData & { type: 'video' };
  const updatedJobData: JobData = {
    ...jobData,
    enhancedPrompt,
    updatedAt: new Date().toISOString(),
  };
  
  await redis.set(`job:${jobId}`, JSON.stringify(updatedJobData), { ex: 86400 });
}

async function updateJobWithFalRequestId(jobId: string, falRequestId: string) {
  const currentJobData = await redis.get(`job:${jobId}`);
  if (!currentJobData) {
    throw new Error(`Job ${jobId} not found`);
  }
  
  const jobData = currentJobData as JobData & { type: 'video' };
  const updatedJobData: JobData = {
    ...jobData,
    falRequestId,
    updatedAt: new Date().toISOString(),
  };
  
  await redis.set(`job:${jobId}`, JSON.stringify(updatedJobData), { ex: 86400 });
}

async function updateJobWithVideoUrl(jobId: string, videoUrl: string) {
  const currentJobData = await redis.get(`job:${jobId}`);
  if (!currentJobData) {
    throw new Error(`Job ${jobId} not found`);
  }
  
  const jobData = currentJobData as JobData & { type: 'video' };
  const updatedJobData: JobData = {
    ...jobData,
    videoUrl,
    status: 'completed',
    updatedAt: new Date().toISOString(),
  };
  
  await redis.set(`job:${jobId}`, JSON.stringify(updatedJobData), { ex: 86400 });
}

async function updateJobWithError(jobId: string, errorMessage: string) {
  try {
    const currentJobData = await redis.get(`job:${jobId}`);
    if (currentJobData) {
      const jobData = currentJobData as JobData & { type: 'video' };
      const errorJobData: JobData = {
        ...jobData,
        status: 'error',
        error: errorMessage,
        updatedAt: new Date().toISOString(),
      };
      await redis.set(`job:${jobId}`, JSON.stringify(errorJobData), { ex: 86400 });
    }
  } catch (error) {
    console.error('Error updating job with error:', error);
  }
} 