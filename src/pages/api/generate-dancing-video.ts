import { NextApiRequest, NextApiResponse } from 'next';
import { v4 as uuidv4 } from 'uuid';
import redis from '@/lib/redis';
import { waitUntil } from '@vercel/functions';
import { fal } from "@fal-ai/client";

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
    const { imageUrl, imageData, prompt } = req.body;
    
    if (!imageUrl && !imageData) {
      return res.status(400).json({ error: 'Either imageUrl or imageData is required' });
    }

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    let finalImageUrl = imageUrl;

    // If imageData is provided (base64), upload it to fal.ai storage first
    if (imageData && !imageUrl) {
      try {
        console.log('Uploading image to fal.ai storage...');
        
        // Convert base64 to blob
        const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const blob = new Blob([buffer], { type: 'image/jpeg' });
        
        // Upload to fal.ai storage
        finalImageUrl = await fal.storage.upload(blob);
        console.log('Image uploaded to fal.ai:', finalImageUrl);
        
      } catch (uploadError) {
        console.error('Failed to upload image to fal.ai:', uploadError);
        return res.status(500).json({ error: 'Failed to upload image' });
      }
    }

    // Generate unique job ID
    const jobId = uuidv4();

    // Set initial status in Redis
    await redis.set(`job:${jobId}`, JSON.stringify({ 
      status: 'pending',
      type: 'dancing-video',
      createdAt: new Date().toISOString()
    }), { ex: 86400 });

    // Respond immediately with job ID
    res.status(202).json({ jobId });

    // Use waitUntil to process in background without blocking the response
    waitUntil(
      processDancingVideoInBackground(jobId, finalImageUrl, prompt).catch((error: Error) => {
        console.error('Background processing error:', error);
        
        // Update Redis with error status
        redis.set(
          `job:${jobId}`, 
          JSON.stringify({ 
            status: 'error', 
            type: 'dancing-video',
            error: error instanceof Error ? error.message : 'Unknown error',
            updatedAt: new Date().toISOString()
          }), 
          { ex: 86400 }
        );
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