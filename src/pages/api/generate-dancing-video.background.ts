import { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';
import { fal } from "@fal-ai/client";
import redis from '@/lib/redis';

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
    
    // Update Redis with error status
    await redis.set(
      `job:${jobId}`, 
      JSON.stringify({ 
        status: 'error',
        type: 'dancing-video',
        error: error instanceof Error ? error.message : 'Unknown error',
        updatedAt: new Date().toISOString()
      }), 
      { ex: 86400 }
    );
  }
}

export async function processDancingVideoInBackground(jobId: string, imageUrl: string, prompt: string) {
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
    await redis.set(
      `job:${jobId}`, 
      JSON.stringify({ 
        status: 'processing',
        type: 'dancing-video',
        step: 'enhancing-prompt',
        updatedAt: new Date().toISOString()
      }), 
      { ex: 86400 }
    );

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

    // Step 3: Update status to submitting video job
    await redis.set(
      `job:${jobId}`, 
      JSON.stringify({ 
        status: 'processing',
        type: 'dancing-video',
        step: 'submitting-video-job',
        enhancedPrompt: enhancedPrompt,
        updatedAt: new Date().toISOString()
      }), 
      { ex: 86400 }
    );

    // Step 4: Submit job to fal.ai
    console.log('Step 2: Submitting video generation job to fal.ai...');
    
    const { request_id } = await fal.queue.submit("fal-ai/kling-video/v2.1/standard/image-to-video", {
      input: {
        prompt: enhancedPrompt,
        image_url: imageUrl,
        duration: "5", // 5 seconds
        aspect_ratio: "9:16", // Good for mobile/social media
        cfg_scale: 0.5
      }
    });

    console.log('Video generation job submitted with request_id:', request_id);

    // Step 5: Update status to polling
    await redis.set(
      `job:${jobId}`, 
      JSON.stringify({ 
        status: 'processing',
        type: 'dancing-video',
        step: 'generating-video',
        falRequestId: request_id,
        enhancedPrompt: enhancedPrompt,
        updatedAt: new Date().toISOString()
      }), 
      { ex: 86400 }
    );

    // Step 6: Poll for results every 15 seconds
    console.log('Step 3: Polling for video generation results...');
    
    let videoReady = false;
    let attempts = 0;
    const maxAttempts = 240; // 60 minutes max (240 * 15 seconds)
    
    while (!videoReady && attempts < maxAttempts) {
      try {
        attempts++;
        console.log(`Polling attempt ${attempts}/${maxAttempts} for request_id: ${request_id}`);
        
        const status = await fal.queue.status("fal-ai/kling-video/v2.1/standard/image-to-video", {
          requestId: request_id,
          logs: true
        }) as any; // Type assertion to handle fal.ai response types

        console.log('Status response:', status);

        if (status.status === 'COMPLETED') {
          // Get the final result
          const result = await fal.queue.result("fal-ai/kling-video/v2.1/standard/image-to-video", {
            requestId: request_id
          });

          console.log('Video generation completed successfully');
          
          // Update Redis with final result
          await redis.set(
            `job:${jobId}`, 
            JSON.stringify({ 
              status: 'completed',
              type: 'dancing-video',
              videoUrl: result.data.video?.url,
              enhancedPrompt: enhancedPrompt,
              falRequestId: request_id,
              completedAt: new Date().toISOString()
            }), 
            { ex: 86400 }
          );

          videoReady = true;
          
        } else if (status.status === 'IN_PROGRESS' || status.status === 'IN_QUEUE') {
          // Still in progress, wait 15 seconds before next poll
          console.log(`Video generation in progress (${status.status}), waiting 15 seconds...`);
          
          // Update Redis with current status
          await redis.set(
            `job:${jobId}`, 
            JSON.stringify({ 
              status: 'processing',
              type: 'dancing-video',
              step: 'generating-video',
              falStatus: status.status,
              falRequestId: request_id,
              enhancedPrompt: enhancedPrompt,
              pollingAttempt: attempts,
              updatedAt: new Date().toISOString()
            }), 
            { ex: 86400 }
          );
          
          await new Promise(resolve => setTimeout(resolve, 15000)); // Wait 15 seconds
        } else {
          // Handle any other status (like error states)
          throw new Error(`Video generation failed with status: ${status.status}`);
        }
        
      } catch (pollingError) {
        console.error(`Polling attempt ${attempts} failed:`, pollingError);
        
        // If it's a temporary error, continue polling
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 15000)); // Wait 15 seconds before retry
        } else {
          throw pollingError;
        }
      }
    }

    if (!videoReady) {
      throw new Error('Video generation timed out after maximum polling attempts');
    }

    console.log(`Dancing video generation completed successfully for job ${jobId}`);

  } catch (error) {
    console.error('Error in dancing video background processing:', error);
    
    // Update Redis with error status
    await redis.set(
      `job:${jobId}`, 
      JSON.stringify({ 
        status: 'error',
        type: 'dancing-video',
        error: error instanceof Error ? error.message : 'Unknown error',
        updatedAt: new Date().toISOString()
      }), 
      { ex: 86400 }
    );
    
    throw error; // Re-throw to be handled by caller
  }
} 