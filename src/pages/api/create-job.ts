import { NextApiRequest, NextApiResponse } from 'next';
import { v4 as uuidv4 } from 'uuid';
import redis from '@/lib/redis';
import { waitUntil } from '@vercel/functions';

// Configure API route to allow larger body sizes for image uploads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // Increase from default 1mb to 10mb
    },
  },
}

// Job types for discriminated union
export type JobType = 'song' | 'video';

// Base job interface
interface BaseJobData {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  createdAt: string;
  updatedAt: string;
  error?: string;
}

// Discriminated union for different job types
export type JobData = 
  | (BaseJobData & {
      type: 'song';
      analysis?: string;
      lyrics?: string;
      style?: string;
      audioUrl?: string;
      sunoTaskId?: string;
    })
  | (BaseJobData & {
      type: 'video';
      imageUrl?: string;
      videoUrl?: string;
      enhancedPrompt?: string;
      falRequestId?: string;
    });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { images, jobType } = req.body;
    
    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'At least one image is required' });
    }

    if (!jobType || !['song', 'video'].includes(jobType)) {
      return res.status(400).json({ error: 'jobType must be either "song" or "video"' });
    }

    // Validate each image
    for (const image of images) {
      if (!image || !image.data || !image.mime_type) {
        return res.status(400).json({ error: 'Invalid image data' });
      }
    }

    const now = new Date().toISOString();
    const jobId = uuidv4();

    // Create job based on discriminated union
    let jobData: JobData;
    
    if (jobType === 'song') {
      // Extract how_flirt and user_profile from the request body
      const {how_flirt, user_profile} = req.body;

    
      jobData = {
        jobId,
        type: 'song',
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      };
      
      // Start song generation in background
      waitUntil(
        processSongInBackground(jobId, images, how_flirt, user_profile).catch((error: Error) => {
          console.error('Song processing error:', error);
          updateJobWithError(jobId, error.message);
        })
      );
      
    } else if (jobType === 'video') {
      jobData = {
        jobId,
        type: 'video', 
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      };
      
      // Start video generation in background
      waitUntil(
        processVideoInBackground(jobId, images).catch((error: Error) => {
          console.error('Video processing error:', error);
          updateJobWithError(jobId, error.message);
        })
      );
      
    } else {
      return res.status(400).json({ error: 'Invalid job type' });
    }

    // Store job in Redis
    await redis.set(`job:${jobId}`, JSON.stringify(jobData), { ex: 86400 });

    // Respond immediately with job ID and type
    res.status(202).json({ 
      jobId,
      type: jobType,
      message: `${jobType} generation started`
    });

  } catch (error) {
    console.error('Error creating job:', error);
    
    // Only send response if it hasn't been sent already
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

// Helper function to update job with error
async function updateJobWithError(jobId: string, errorMessage: string) {
  try {
    const currentJobData = await redis.get(`job:${jobId}`);
    if (currentJobData) {
      const jobData = currentJobData as JobData;
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

// Song processing function
async function processSongInBackground(jobId: string, images: { data: string; mime_type: string }[], how_flirt: string, user_profile: { name: string, passions: string }) {
  // Import here to avoid circular dependencies
  const { generateSong } = await import('./generate.background');
  await generateSong(jobId, images, how_flirt, user_profile);
}

// Video processing function  
async function processVideoInBackground(jobId: string, images: { data: string; mime_type: string }[]) {
  // Call the existing video generation endpoint directly
  const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/generate-dancing-video`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jobId, // Use the video job ID directly
      images,
    }),
  });

  if (!response.ok) {
    throw new Error(`Video generation failed: ${response.statusText}`);
  }
} 