import { NextApiRequest, NextApiResponse } from 'next';
import redis from '@/lib/redis';
import { JobData } from './create-job';

interface SunoCallbackData {
  code: number;
  msg: string;
  data: {
    callbackType: string;
    task_id: string;
    data: Array<{
      id: string;
      audio_url: string;
      source_audio_url: string;
      stream_audio_url: string;
      source_stream_audio_url: string;
      image_url: string;
      source_image_url: string;
      prompt: string;
      model_name: string;
      title: string;
      tags: string;
      createTime: string;
      duration: number;
    }>;
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Add detailed logging for debugging production issues
  console.log('🎵 SUNO CALLBACK RECEIVED - Start of handler');
  console.log('🌍 Environment:', process.env.NODE_ENV);
  console.log('📨 Request method:', req.method);
  console.log('🔗 Request URL:', req.url);
  console.log('📋 Request headers:', JSON.stringify(req.headers, null, 2));
  console.log('📦 Request body type:', typeof req.body);
  console.log('📦 Request body preview:', JSON.stringify(req.body, null, 2).substring(0, 500));

  // Handle GET requests for testing endpoint accessibility
  if (req.method === 'GET') {
    console.log('🔍 GET request to callback endpoint - testing accessibility');
    return res.status(200).json({ 
      message: 'Suno callback endpoint is accessible',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'unknown'
    });
  }

  if (req.method !== 'POST') {
    console.log('❌ Non-POST method received:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const callbackData: SunoCallbackData = req.body;
    
    // Log the callback for debugging purposes
    console.log(`Suno callback received:`, {
      callbackType: callbackData.data?.callbackType,
      taskId: callbackData.data?.task_id,
      tracksCount: callbackData.data?.data?.length || 0
    });

    // Validate callback data
    if (!callbackData.data?.task_id) {
      console.error('No taskId in Suno callback');
      return res.status(200).json({ message: 'Callback received but no taskId' });
    }

    // Process as soon as we get the first audio track
    if (callbackData.data?.callbackType !== 'first') {
      console.log(`Suno callback with status '${callbackData.data?.callbackType}' - waiting for first...`);
      return res.status(200).json({ message: `Callback received - status: ${callbackData.data?.callbackType}` });
    }

    console.log('Suno generation completed - processing callback...');

    // Find the corresponding job using the taskId
    const jobId = await redis.get(`suno:${callbackData.data.task_id}`);
    
    if (!jobId) {
      console.error(`No job found for Suno taskId: ${callbackData.data.task_id}`);
      return res.status(200).json({ message: 'Callback received but no matching job' });
    }

    console.log(`Found job ${jobId} for Suno taskId ${callbackData.data.task_id}`);

    // Get current job data
    const currentJobData = await redis.get(`job:${jobId}`);
    if (!currentJobData) {
      console.error(`Job ${jobId} not found in Redis`);
      return res.status(200).json({ message: 'Job not found' });
    }

    const jobData = currentJobData as JobData & { type: 'song' };

    // Check if we have audio data
    console.log('Callback data:', callbackData);

    if (!callbackData.data?.data || callbackData.data.data.length === 0) {
      console.error('No audio data in Suno callback');
      
      // Update job with error status
      await updateJobWithError(jobId as string, 'No audio data received from Suno');
      return res.status(200).json({ message: 'Callback received but no audio data' });
    }

    // Get the first audio track (we can enhance this later to handle multiple tracks)
    const audioTrack = callbackData.data.data[0];
    console.log(`Processing audio track: ${audioTrack.title} (${audioTrack.duration}s)`);

    console.log('Lyrics:', jobData.lyrics);

    let trimmerResult;

    if (audioTrack.audio_url) {
    // Send audio URL to trimmer server
    console.log('Sending audio to trimmer server...');
    const trimmerResponse = await fetch(`${process.env.AUDIO_TRIMMER_SERVER_URL}/trim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jobId: jobId,
        audioUrl: audioTrack.audio_url,
        duration: 30,
        lyrics: jobData.lyrics || '',
      }),
    });
  

    if (!trimmerResponse.ok) {
      const errorText = await trimmerResponse.text();
      throw new Error(`Trimmer server error: ${trimmerResponse.status} ${errorText}`);
    }

    const trimmerResult = await trimmerResponse.json();
    console.log('Trimmer server response:', trimmerResult);

    if (!trimmerResult.success || !trimmerResult.signedUrl) {
      throw new Error('Trimmer server did not return a valid signed URL');
    }

  } else {
    console.error('No audio URL in Suno callback');
    await new Promise(resolve => setTimeout(resolve, 1000));
    trimmerResult = { signedUrl: audioTrack.audio_url };
  }

    // Update job to completed status with audio URL from trimmer server
    console.log('Updating job to completed status...');
    
    const updatedJobData: JobData = {
      ...jobData,
      status: 'completed',
      audioUrl: trimmerResult?.signedUrl || audioTrack.audio_url,
      updatedAt: new Date().toISOString(),
    };
    
    await redis.set(`job:${jobId}`, JSON.stringify(updatedJobData), { ex: 86400 });

    // Clean up the taskId mapping
    await redis.del(`suno:${callbackData.data.task_id}`);

    console.log(`Song generation completed successfully for job ${jobId}`);

    return res.status(200).json({ message: 'Song generation completed successfully' });

  } catch (error) {
    console.error('Error handling Suno callback:', error);
    
    // If we have a jobId, update the job with error status
    if (req.body?.data?.task_id) {
      const jobId = await redis.get(`suno:${req.body.data.task_id}`);
      if (jobId) {
        await updateJobWithError(jobId as string, `Error processing callback: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    // Still return 200 to acknowledge receipt even if there's an error
    return res.status(200).json({ message: 'Callback received with error' });
  }
}

// Helper function to update job with error
async function updateJobWithError(jobId: string, errorMessage: string) {
  try {
    const currentJobData = await redis.get(`job:${jobId}`);
    if (currentJobData) {
      const jobData = currentJobData as JobData & { type: 'song' };
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