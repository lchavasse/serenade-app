import { NextApiRequest, NextApiResponse } from 'next';
import { v4 as uuidv4 } from 'uuid';
import redis from '@/lib/redis';
import { waitUntil } from '@vercel/functions';

// Import the background processing function
import { processImageInBackground } from './generate.background';

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
    const { images } = req.body;
    
    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'At least one image is required' });
    }

    // Validate each image
    for (const image of images) {
      if (!image || !image.data || !image.mime_type) {
        return res.status(400).json({ error: 'Invalid image data' });
      }
    }

    // Generate unique job ID
    const jobId = uuidv4();

    // Set initial status in Redis
    await redis.set(`job:${jobId}`, JSON.stringify({ status: 'pending' }), { ex: 86400 });

    // Respond immediately with job ID
    res.status(202).json({ jobId });

    // Use waitUntil to process in background without blocking the response
    waitUntil(
      processImageInBackground(jobId, images).catch((error: Error) => {
        console.error('Background processing error:', error);
        
        // Update Redis with error status
        redis.set(
          `job:${jobId}`, 
          JSON.stringify({ 
            status: 'error', 
            error: error instanceof Error ? error.message : 'Unknown error'
          }), 
          { ex: 86400 }
        );
      })
    );

  } catch (error) {
    console.error('Error creating job:', error);
    
    // Only send response if it hasn't been sent already
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
} 