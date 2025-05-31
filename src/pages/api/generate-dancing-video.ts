import { NextApiRequest, NextApiResponse } from 'next';
import redis from '@/lib/redis';
import { waitUntil } from '@vercel/functions';
import { fal } from "@fal-ai/client";
import { JobData } from './create-job';

// Import the background processing function
import { processDancingVideoInBackground } from './generate-dancing-video.background';

// Configure fal.ai client
if (process.env.FAL_KEY) {
  fal.config({
    credentials: process.env.FAL_KEY
  });
}

// Configure API route to allow larger body sizes for image uploads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // Increase from default 1mb to 10mb
    },
  },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { jobId, images } = req.body;
    
    // Validate required parameters for new discriminated union format
    if (!jobId || !images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'jobId and images array are required' });
    }

    // Get the first image for video generation
    const firstImage = images[0];
    if (!firstImage || !firstImage.data || !firstImage.mime_type) {
      return res.status(400).json({ error: 'Invalid image data' });
    }

    // Convert base64 image to fal.ai storage URL
    let finalImageUrl: string;
    try {
      console.log('Uploading image to fal.ai storage...');
      
      // Convert base64 to blob
      const base64Data = firstImage.data;
      const buffer = Buffer.from(base64Data, 'base64');
      const blob = new Blob([buffer], { type: firstImage.mime_type || 'image/jpeg' });
      
      // Upload to fal.ai storage
      finalImageUrl = await fal.storage.upload(blob);
      console.log('Image uploaded to fal.ai:', finalImageUrl);
      
    } catch (uploadError) {
      console.error('Failed to upload image to fal.ai:', uploadError);
      return res.status(500).json({ error: 'Failed to upload image' });
    }

    // Update job with image URL
    await updateJobWithImageUrl(jobId, finalImageUrl);

    // Respond immediately
    res.status(200).json({ message: 'Video generation started' });

    // Use waitUntil to process in background without blocking the response
    waitUntil(
      processDancingVideoInBackground(jobId, finalImageUrl, "Create an engaging dancing video with smooth movements and good lighting").catch((error: Error) => {
        console.error('Background video processing error:', error);
        updateJobWithError(jobId, error instanceof Error ? error.message : 'Unknown error');
      })
    );

  } catch (error) {
    console.error('Error creating dancing video job:', error);
    
    // Only send response if it hasn't been sent already
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

// Helper functions to update job status
async function updateJobWithImageUrl(jobId: string, imageUrl: string) {
  const currentJobData = await redis.get(`job:${jobId}`);
  if (!currentJobData) {
    throw new Error(`Job ${jobId} not found`);
  }
  
  const jobData = currentJobData as JobData & { type: 'video' };
  const updatedJobData: JobData = {
    ...jobData,
    imageUrl,
    status: 'processing',
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