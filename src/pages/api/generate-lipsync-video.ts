import { NextApiRequest, NextApiResponse } from 'next';
import { v4 as uuidv4 } from 'uuid';
import redis from '@/lib/redis';
import { waitUntil } from '@vercel/functions';
import { fal } from "@fal-ai/client";
import fs from 'fs';
import path from 'path';
import { JobData } from './create-job';

// Import the background processing function
import { processLipsyncVideoInBackground } from './generate-lipsync-video.background';

// Configure fal.ai client
if (process.env.FAL_KEY) {
  fal.config({
    credentials: process.env.FAL_KEY
  });
}

// Configure API route to allow larger body sizes for audio uploads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '25mb', // Larger limit for audio files
    },
  },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { videoUrl, audioUrl, audioData, useDefaultAudio } = req.body;
    
    if (!videoUrl) {
      return res.status(400).json({ error: 'videoUrl is required' });
    }

    let finalAudioUrl = audioUrl;

    // If useDefaultAudio is true, upload the default ella_1_cut.wav file
    if (useDefaultAudio) {
      try {
        console.log('Uploading default audio file (ella_1_cut.wav) to fal.ai storage...');
        
        // Read the default audio file from the public directory or assets
        const audioPath = path.join(process.cwd(), 'public', 'audio', 'ella_1_cut.wav');
        
        if (!fs.existsSync(audioPath)) {
          throw new Error('Default audio file (ella_1_cut.wav) not found in public/audio/');
        }
        
        const audioBuffer = fs.readFileSync(audioPath);
        const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });
        
        // Upload to fal.ai storage
        finalAudioUrl = await fal.storage.upload(audioBlob);
        console.log('Default audio uploaded to fal.ai:', finalAudioUrl);
        
      } catch (uploadError) {
        console.error('Failed to upload default audio to fal.ai:', uploadError);
        return res.status(500).json({ error: 'Failed to upload default audio file' });
      }
    }
    // If audioData is provided (base64), upload it to fal.ai storage
    else if (audioData && !audioUrl) {
      try {
        console.log('Uploading audio data to fal.ai storage...');
        
        // Convert base64 to blob
        const base64Data = audioData.replace(/^data:audio\/[a-z]+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const blob = new Blob([buffer], { type: 'audio/wav' });
        
        // Upload to fal.ai storage
        finalAudioUrl = await fal.storage.upload(blob);
        console.log('Audio uploaded to fal.ai:', finalAudioUrl);
        
      } catch (uploadError) {
        console.error('Failed to upload audio to fal.ai:', uploadError);
        return res.status(500).json({ error: 'Failed to upload audio' });
      }
    }

    if (!finalAudioUrl) {
      return res.status(400).json({ error: 'Either audioUrl, audioData, or useDefaultAudio must be provided' });
    }

    // Generate unique job ID
    const jobId = uuidv4();

    // Create job with proper JobData schema
    const now = new Date().toISOString();
    const jobData: JobData = {
      jobId,
      type: 'lipsync',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      audioUrl: finalAudioUrl
    };

    // Set initial status in Redis
    await redis.set(`job:${jobId}`, JSON.stringify(jobData), { ex: 86400 });

    // Respond immediately with job ID
    res.status(202).json({ jobId });

    // Use waitUntil to process in background without blocking the response
    waitUntil(
      processLipsyncVideoInBackground(jobId, videoUrl, finalAudioUrl).catch((error: Error) => {
        console.error('Background lipsync processing error:', error);
        
        // Update Redis with error status using proper schema
        updateJobWithError(jobId, error instanceof Error ? error.message : 'Unknown error');
      })
    );

  } catch (error) {
    console.error('Error creating lipsync video job:', error);
    
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