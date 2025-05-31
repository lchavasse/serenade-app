import { NextApiRequest, NextApiResponse } from 'next';
import redis from '@/lib/redis';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { jobId } = req.query;
    
    if (!jobId || typeof jobId !== 'string') {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    // Get job status from Redis
    const jobData = await redis.get(`job:${jobId}`);
    
    if (!jobData) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Upstash Redis automatically deserializes JSON, so jobData is already an object
    // No need to JSON.parse() since it's already parsed
    res.status(200).json(jobData);

  } catch (error) {
    console.error('Error fetching job status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
