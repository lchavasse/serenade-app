import { NextApiRequest, NextApiResponse } from 'next';
import { v4 as uuidv4 } from 'uuid';
import redis from '@/lib/redis';
import { waitUntil } from '@vercel/functions';

// Configure API route to allow larger body sizes for image uploads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '25mb', // Increase from 10mb to 25mb to handle larger mobile images for video generation
    },
  },
}

// Generation types for what type of content to generate
export type GenerationType = 'song' | 'video';

// Job types for discriminated union (individual jobs)
export type JobType = 'song' | 'video' | 'lipsync';

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
    })
  | (BaseJobData & {
      type: 'lipsync';
      videoUrl?: string;
      originalVideoUrl?: string;
      audioUrl?: string;
      falRequestId?: string;
    });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { images, matchImages, userImage, generationType } = req.body;
    
    if (!generationType || !['song', 'video'].includes(generationType)) {
      return res.status(400).json({ error: 'generationType must be either "song" or "video"' });
    }
    
    // For song-only generation, use images (legacy format)
    // For video generation, use matchImages and userImage (new format)
    let songImages: { data: string; mime_type: string }[];
    let videoImages: { data: string; mime_type: string }[] = [];
    
    if (generationType === 'song') {
      if (!images || !Array.isArray(images) || images.length === 0) {
        return res.status(400).json({ error: 'At least one image is required' });
      }
      songImages = images;
    } else { // generationType === 'video'
      if (!matchImages || !Array.isArray(matchImages) || matchImages.length === 0) {
        return res.status(400).json({ error: 'At least one match image is required for video generation' });
      }
      if (!userImage || !userImage.data || !userImage.mime_type) {
        return res.status(400).json({ error: 'User image is required for video generation' });
      }
      songImages = matchImages; // Use match images for song analysis
      videoImages = [userImage]; // Use user image for video generation
    }

    // Validate each image
    const allImages = generationType === 'song' ? songImages : [...songImages, ...videoImages];
    for (const image of allImages) {
      if (!image || !image.data || !image.mime_type) {
        return res.status(400).json({ error: 'Invalid image data' });
      }
    }

    const now = new Date().toISOString();

    if (generationType === 'song') {
      // Create song job only
      const songJobId = uuidv4();

      const {how_flirt, user_profile} = req.body;
      
      const songJobData: JobData = {
        jobId: songJobId,
        type: 'song',
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      };
      
      // Store song job in Redis
      await redis.set(`job:${songJobId}`, JSON.stringify(songJobData), { ex: 86400 });
      
      // Start song generation in background
      waitUntil(
        processSongInBackground(songJobId, songImages, how_flirt, user_profile).catch((error: Error) => {
          console.error('Song processing error:', error);
          updateJobWithError(songJobId, error.message);
        })
      );
      
      // Respond with song job only
      res.status(202).json({ 
        songJobId,
        type: 'song',
        message: 'Song generation started'
      });
      
    } else if (generationType === 'video') {
      // Create both song and video jobs
      const songJobId = uuidv4();
      const videoJobId = uuidv4();

      const {how_flirt, user_profile} = req.body;
      
      const songJobData: JobData = {
        jobId: songJobId,
        type: 'song',
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      };
      
      const videoJobData: JobData = {
        jobId: videoJobId,
        type: 'video', 
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      };
      
      // Store both jobs in Redis
      await redis.set(`job:${songJobId}`, JSON.stringify(songJobData), { ex: 86400 });
      await redis.set(`job:${videoJobId}`, JSON.stringify(videoJobData), { ex: 86400 });
      
      // Start both jobs in background
      waitUntil(
        processSongInBackground(songJobId, songImages, how_flirt, user_profile).catch((error: Error) => {
          console.error('Song processing error:', error);
          updateJobWithError(songJobId, error.message);
        })
      );
      
      waitUntil(
        processVideoInBackground(videoJobId, videoImages).catch((error: Error) => {
          console.error('Video processing error:', error);
          updateJobWithError(videoJobId, error.message);
        })
      );
      
      // Respond with both job IDs
      res.status(202).json({ 
        songJobId,
        videoJobId,
        type: 'video',
        message: 'Song and video generation started'
      });
    }

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
  const response = await fetch(`${process.env.YOUR_SITE_URL || 'http://localhost:3000'}/api/generate-dancing-video`, {
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