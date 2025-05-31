import { NextApiRequest, NextApiResponse } from 'next';
import { fal } from "@fal-ai/client";
import redis from '@/lib/redis';
import { JobData } from './create-job';

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
    
    // Update Redis with error status using proper schema
    await updateJobWithError(jobId, error instanceof Error ? error.message : 'Unknown error');
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
    await updateJobStatus(jobId, 'processing');

    // Step 2: Submit job to fal.ai veed/lipsync
    console.log('Step 1: Submitting lipsync job to fal.ai...');
    console.log('Video URL:', videoUrl);
    console.log('Audio URL:', audioUrl);
    
    // Construct the callback URL
    const callbackUrl = `${process.env.YOUR_SITE_URL}/api/fal-lipsync-callback`;
    console.log('Using lipsync callback URL:', callbackUrl);
    
    const { request_id } = await fal.queue.submit("veed/lipsync", {
      input: {
        video_url: videoUrl,
        audio_url: audioUrl
      },
      webhookUrl: callbackUrl
    });

    console.log('Lipsync job submitted with request_id:', request_id);
    console.log('Fal.ai will call our lipsync webhook when the video is ready');

    // Update job with fal request ID and set status to processing
    await updateJobWithFalRequestId(jobId, request_id);
    await updateJobStatus(jobId, 'processing');

    console.log(`Lipsync video processing job submitted successfully for job ${jobId}. Waiting for callback...`);

  } catch (error) {
    console.error('Error in lipsync video background processing:', error);
    
    // Update job with error
    await updateJobWithError(jobId, error instanceof Error ? error.message : 'Unknown error');
    
    throw error; // Re-throw to be handled by caller
  }
}

// Helper functions to update job status
async function updateJobStatus(jobId: string, status: 'pending' | 'processing' | 'completed' | 'error') {
  const currentJobData = await redis.get(`job:${jobId}`);
  if (!currentJobData) {
    throw new Error(`Job ${jobId} not found`);
  }
  
  const jobData = currentJobData as JobData & { type: 'lipsync' };
  const updatedJobData: JobData = {
    ...jobData,
    status,
    updatedAt: new Date().toISOString(),
  };
  
  await redis.set(`job:${jobId}`, JSON.stringify(updatedJobData), { ex: 86400 });
}

async function updateJobWithFalRequestId(jobId: string, falRequestId: string) {
  const currentJobData = await redis.get(`job:${jobId}`);
  if (!currentJobData) {
    throw new Error(`Job ${jobId} not found`);
  }
  
  const jobData = currentJobData as JobData & { type: 'lipsync' };
  const updatedJobData: JobData = {
    ...jobData,
    falRequestId,
    updatedAt: new Date().toISOString(),
  };
  
  await redis.set(`job:${jobId}`, JSON.stringify(updatedJobData), { ex: 86400 });
}

async function updateJobWithError(jobId: string, errorMessage: string) {
  try {
    const currentJobData = await redis.get(`job:${jobId}`);
    if (currentJobData) {
      const jobData = currentJobData as JobData & { type: 'lipsync' };
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