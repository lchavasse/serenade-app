import { NextApiRequest, NextApiResponse } from 'next';
import { fal } from "@fal-ai/client";
import redis from '@/lib/redis';

// Configure runtime for background function
export const config = {
  runtime: 'nodejs',
}

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

  const { jobId, videoUrl, audioUrl } = req.body;

  if (!jobId || !videoUrl || !audioUrl) {
    return res.status(400).json({ error: 'Missing jobId, videoUrl, or audioUrl data' });
  }

  // Respond immediately to avoid timeout
  res.status(200).json({ message: 'Background lipsync processing started' });

  // Process in background
  try {
    await processLipsyncVideoInBackground(jobId, videoUrl, audioUrl);
  } catch (error) {
    console.error('Background lipsync processing error:', error);
    
    // Update Redis with error status
    await redis.set(
      `job:${jobId}`, 
      JSON.stringify({ 
        status: 'error',
        type: 'lipsync-video',
        error: error instanceof Error ? error.message : 'Unknown error',
        updatedAt: new Date().toISOString()
      }), 
      { ex: 86400 }
    );
  }
}

export async function processLipsyncVideoInBackground(jobId: string, videoUrl: string, audioUrl: string) {
  try {
    console.log(`Starting lipsync video processing for job ${jobId}`);

    // Validate required environment variables
    if (!process.env.FAL_KEY) {
      throw new Error('FAL_KEY environment variable is required');
    }

    // Step 1: Update status to processing
    await redis.set(
      `job:${jobId}`, 
      JSON.stringify({ 
        status: 'processing',
        type: 'lipsync-video',
        step: 'submitting-lipsync-job',
        updatedAt: new Date().toISOString()
      }), 
      { ex: 86400 }
    );

    // Step 2: Submit job to fal.ai veed/lipsync
    console.log('Step 1: Submitting lipsync job to fal.ai...');
    console.log('Video URL:', videoUrl);
    console.log('Audio URL:', audioUrl);
    
    const { request_id } = await fal.queue.submit("veed/lipsync", {
      input: {
        video_url: videoUrl,
        audio_url: audioUrl
      }
    });

    console.log('Lipsync job submitted with request_id:', request_id);

    // Step 3: Update status to polling
    await redis.set(
      `job:${jobId}`, 
      JSON.stringify({ 
        status: 'processing',
        type: 'lipsync-video',
        step: 'generating-lipsync',
        falRequestId: request_id,
        updatedAt: new Date().toISOString()
      }), 
      { ex: 86400 }
    );

    // Step 4: Poll for results every 15 seconds
    console.log('Step 2: Polling for lipsync results...');
    
    let lipsyncReady = false;
    let attempts = 0;
    const maxAttempts = 240; // 60 minutes max (240 * 15 seconds)
    
    while (!lipsyncReady && attempts < maxAttempts) {
      try {
        attempts++;
        console.log(`Polling attempt ${attempts}/${maxAttempts} for request_id: ${request_id}`);
        
        const status = await fal.queue.status("veed/lipsync", {
          requestId: request_id,
          logs: true
        }) as { status: string; partial_result?: unknown; response_url?: string }; // Proper typing for fal.ai response

        console.log('Status response:', status);

        if (status.status === 'COMPLETED') {
          console.log('Lipsync job completed, getting result...');
          
          try {
            const result = await fal.queue.result("veed/lipsync", {
              requestId: request_id
            });
            
            console.log('Result data:', result.data);
            console.log('Request ID:', result.requestId);
            
            const videoUrl = result.data.video.url;
            console.log('✅ Video URL:', videoUrl);
            
            // Update Redis with final result
            await redis.set(
              `job:${jobId}`, 
              JSON.stringify({ 
                status: 'completed',
                type: 'lipsync-video',
                videoUrl: videoUrl,
                originalVideoUrl: videoUrl,
                audioUrl: audioUrl,
                falRequestId: request_id,
                completedAt: new Date().toISOString()
              }), 
              { ex: 86400 }
            );

            lipsyncReady = true;
            
          } catch (error) {
            console.error('Error getting result:', error);
            throw error;
          }
        } else if (status.status === 'IN_PROGRESS' || status.status === 'IN_QUEUE') {
          // Still in progress, wait 15 seconds before next poll
          console.log(`Lipsync generation in progress (${status.status}), waiting 15 seconds...`);
          
          // Update Redis with current status
          await redis.set(
            `job:${jobId}`, 
            JSON.stringify({ 
              status: 'processing',
              type: 'lipsync-video',
              step: 'generating-lipsync',
              falStatus: status.status,
              falRequestId: request_id,
              pollingAttempt: attempts,
              updatedAt: new Date().toISOString()
            }), 
            { ex: 86400 }
          );
          
          await new Promise(resolve => setTimeout(resolve, 15000)); // Wait 15 seconds
        } else {
          // Handle any other status (like error states)
          throw new Error(`Lipsync generation failed with status: ${status.status}`);
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

    if (!lipsyncReady) {
      throw new Error('Lipsync generation timed out after maximum polling attempts');
    }

    console.log(`Lipsync video processing completed successfully for job ${jobId}`);

  } catch (error) {
    console.error('Error in lipsync video background processing:', error);
    
    // Update Redis with error status
    await redis.set(
      `job:${jobId}`, 
      JSON.stringify({ 
        status: 'error',
        type: 'lipsync-video',
        error: error instanceof Error ? error.message : 'Unknown error',
        updatedAt: new Date().toISOString()
      }), 
      { ex: 86400 }
    );
    
    throw error; // Re-throw to be handled by caller
  }
} 