import { NextApiRequest, NextApiResponse } from 'next';
import redis from '@/lib/redis';
import { JobData } from './create-job';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Received fal.ai callback:', JSON.stringify(req.body, null, 2));

    const { request_id, status, payload } = req.body;

    if (!request_id) {
      console.error('Missing request_id in callback');
      return res.status(400).json({ error: 'Missing request_id' });
    }

    // Find the job that matches this fal request ID
    const jobId = await findJobByFalRequestId(request_id);
    if (!jobId) {
      console.error(`No job found for fal request_id: ${request_id}`);
      return res.status(404).json({ error: 'Job not found' });
    }

    console.log(`Found job ${jobId} for fal request_id: ${request_id}`);

    if (status === 'OK' && payload?.video?.url) {
      // Video generation completed successfully
      console.log(`Video generation completed for job ${jobId}`);
      console.log(`Video URL: ${payload.video.url}`);
      
      await updateJobWithVideoUrl(jobId, payload.video.url);
      
      return res.status(200).json({ success: true, message: 'Job completed' });
    } else if (status === 'ERROR') {
      // Video generation failed
      const errorMessage = payload?.error || 'Video generation failed';
      console.error(`Video generation failed for job ${jobId}:`, errorMessage);
      
      await updateJobWithError(jobId, errorMessage);
      
      return res.status(200).json({ success: true, message: 'Job marked as failed' });
    } else {
      // Unexpected status or missing video URL
      console.error(`Unexpected callback status for job ${jobId}:`, status, payload);
      return res.status(400).json({ error: 'Unexpected callback status' });
    }

  } catch (error) {
    console.error('Error processing fal.ai callback:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function findJobByFalRequestId(falRequestId: string): Promise<string | null> {
  try {
    // Get all job keys from Redis
    const jobKeys = await redis.keys('job:*');
    
    for (const key of jobKeys) {
      try {
        const jobData = await redis.get(key);
        if (jobData) {
          const job = jobData as JobData & { type: 'video' };
          if (job.falRequestId === falRequestId) {
            // Extract jobId from key (remove 'job:' prefix)
            return key.replace('job:', '');
          }
        }
      } catch (error) {
        console.error(`Error checking job ${key}:`, error);
        continue;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error finding job by fal request ID:', error);
    return null;
  }
}

async function updateJobWithVideoUrl(jobId: string, videoUrl: string) {
  const currentJobData = await redis.get(`job:${jobId}`);
  if (!currentJobData) {
    throw new Error(`Job ${jobId} not found`);
  }
  
  const jobData = currentJobData as JobData & { type: 'video' };
  const updatedJobData: JobData = {
    ...jobData,
    videoUrl,
    status: 'completed',
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
