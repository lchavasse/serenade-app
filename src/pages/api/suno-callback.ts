import { NextApiRequest, NextApiResponse } from 'next';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
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

// Configure S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'eu-west-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
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

    // Only process when generation is complete
    if (callbackData.data?.callbackType !== 'complete') {
      console.log(`Suno callback with status '${callbackData.data?.callbackType}' - waiting for completion...`);
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

    // Download the audio file from Suno
    console.log('Downloading audio from Suno...');
    const audioResponse = await fetch(audioTrack.audio_url);
    
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio: ${audioResponse.status} ${audioResponse.statusText}`);
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    console.log(`Downloaded audio file: ${audioBuffer.byteLength} bytes`);

    // Upload to S3
    console.log('Uploading audio to S3...');
    const s3Key = `songs/${jobId}.mp3`;
    const putCommand = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: s3Key,
      Body: Buffer.from(audioBuffer),
      ContentType: 'audio/mpeg',
    });

    await s3Client.send(putCommand);
    console.log('S3 upload completed');

    // Generate signed URL for sharing
    console.log('Generating signed URL...');
    const getCommand = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: s3Key,
    });

    const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 604800 }); // 7 days

    // Update job to completed status with audio URL
    console.log('Updating job to completed status...');
    
    const updatedJobData: JobData = {
      ...jobData,
      status: 'completed',
      audioUrl: signedUrl,
      updatedAt: new Date().toISOString(),
    };
    
    await redis.set(`job:${jobId}`, JSON.stringify(updatedJobData), { ex: 86400 });

    // Clean up the taskId mapping
    await redis.del(`suno:${callbackData.data.task_id}`);

    console.log(`Song generation completed successfully for job ${jobId}`);

    return res.status(200).json({ message: 'Song generation completed successfully' });

  } catch (error) {
    console.error('Error handling Suno callback:', error);
    
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