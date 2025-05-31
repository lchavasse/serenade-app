import { NextApiRequest, NextApiResponse } from 'next';
import { v4 as uuidv4 } from 'uuid';
import redis from '@/lib/redis';

// Import the background processing function directly
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
    const { image } = req.body;
    
    if (!image || !image.data || !image.mime_type) {
      return res.status(400).json({ error: 'Invalid image data' });
    }

    // Generate unique job ID
    const jobId = uuidv4();

    // Set initial status in Redis
    await redis.set(`job:${jobId}`, JSON.stringify({ status: 'pending' }), { ex: 86400 });

    // Respond immediately with job ID
    res.status(202).json({ jobId });

    // For local development, process directly
    // For production on Vercel, this could be moved to a background function
    if (process.env.NODE_ENV === 'development') {
      console.log('Local development: Processing image directly...');
      
      // Process in the background (don't await to avoid blocking)
      processImageInBackground(jobId, image).catch((error: Error) => {
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
      });
    } else {
      // In production, use Vercel Background Functions
      console.log('Production: Invoking background function...');
      
      const backgroundResponse = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/generate.background`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobId,
          image
        })
      });

      if (!backgroundResponse.ok) {
        throw new Error('Failed to start background processing');
      }
    }

  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
} 