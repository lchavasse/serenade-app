import { NextApiRequest, NextApiResponse } from 'next';
import redis from '@/lib/redis';
import { waitUntil } from '@vercel/functions';
import { fal } from "@fal-ai/client";
import { JobData } from './create-job';
import { v4 as uuidv4 } from 'uuid';

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
    const { jobId, images, imageData, prompt } = req.body;
    
    // Support two formats:
    // Format 1: Job system format { jobId, images }
    // Format 2: Direct format { imageData, prompt }
    
    let finalJobId: string;
    let finalImageUrl: string;
    
    if (jobId && images) {
      // Job system format
      if (!Array.isArray(images) || images.length === 0) {
        return res.status(400).json({ error: 'images array is required when using jobId format' });
      }

      const firstImage = images[0];
      if (!firstImage || !firstImage.data || !firstImage.mime_type) {
        return res.status(400).json({ error: 'Invalid image data' });
      }

      finalJobId = jobId;
      
      // Convert base64 image to fal.ai storage URL
      try {
        console.log('Uploading image to fal.ai storage...');
        
        const buffer = Buffer.from(firstImage.data, 'base64');
        const blob = new Blob([buffer], { type: firstImage.mime_type || 'image/jpeg' });
        
        finalImageUrl = await fal.storage.upload(blob);
        console.log('Image uploaded to fal.ai:', finalImageUrl);
        
      } catch (uploadError) {
        console.error('Failed to upload image to fal.ai:', uploadError);
        return res.status(500).json({ error: 'Failed to upload image' });
      }

      // Update job with image URL
      await updateJobWithImageUrl(finalJobId, finalImageUrl);
      
    } else if (imageData && prompt) {
      // Direct format for testing
      finalJobId = uuidv4();
      
      try {
        console.log('Processing direct image data...');
        
        // Remove data URL prefix if present
        const base64Data = imageData.includes(',') ? imageData.split(',')[1] : imageData;
        const buffer = Buffer.from(base64Data, 'base64');
        const blob = new Blob([buffer], { type: 'image/jpeg' });
        
        finalImageUrl = await fal.storage.upload(blob);
        console.log('Image uploaded to fal.ai:', finalImageUrl);
        
      } catch (uploadError) {
        console.error('Failed to process image data:', uploadError);
        return res.status(500).json({ error: 'Failed to process image data' });
      }
      
      // Create job record in Redis for direct format
      const now = new Date().toISOString();
      const jobData: JobData = {
        jobId: finalJobId,
        type: 'video',
        status: 'processing',
        imageUrl: finalImageUrl,
        createdAt: now,
        updatedAt: now,
      };
      
      await redis.set(`job:${finalJobId}`, JSON.stringify(jobData), { ex: 86400 });
      console.log('Created job record for direct format:', finalJobId);
      
    } else {
      return res.status(400).json({ 
        error: 'Either (jobId + images) or (imageData + prompt) must be provided' 
      });
    }

    // Respond immediately
    res.status(200).json({ 
      message: 'Video generation started',
      jobId: finalJobId 
    });

    // Use waitUntil to process in background without blocking the response
    waitUntil(
      processDancingVideoInBackground(finalJobId, finalImageUrl).catch((error: Error) => {
        console.error('Background video processing error:', error);
        updateJobWithError(finalJobId, error instanceof Error ? error.message : 'Unknown error');
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