import { NextApiRequest, NextApiResponse } from 'next';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import redis from '@/lib/redis';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

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
    // Validate required environment variables
    if (!process.env.S3_BUCKET_NAME) {
      throw new Error('S3_BUCKET_NAME environment variable is required');
    }

    const jobId = uuidv4();
    console.log(`Testing video upload for job ${jobId}`);

    // Set initial status in Redis
    await redis.set(`job:${jobId}`, JSON.stringify({ status: 'pending' }), { ex: 86400 });

    // Read the test.mov file from public directory
    const videoPath = path.join(process.cwd(), 'public', 'test.mov');
    
    if (!fs.existsSync(videoPath)) {
      throw new Error('test.mov file not found in public directory');
    }

    console.log('Reading test.mov file...');
    const videoBuffer = fs.readFileSync(videoPath);
    console.log(`Video file size: ${videoBuffer.length} bytes`);

    // Upload test video to S3
    console.log('Uploading test video to S3...');
    const s3Key = `videos/${jobId}.mov`;
    const putCommand = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: s3Key,
      Body: videoBuffer,
      ContentType: 'video/quicktime', // .mov files are QuickTime format
    });

    await s3Client.send(putCommand);
    console.log('S3 upload completed');

    // Generate signed URL for video
    console.log('Generating signed URL...');
    const getCommand = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: s3Key,
    });

    const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 604800 }); // 7 days

    // Update Redis with completion status
    console.log('Updating Redis with completion status...');
    await redis.set(
      `job:${jobId}`, 
      JSON.stringify({ 
        status: 'done', 
        videoUrl: signedUrl,
        type: 'video',
        analysis: `Test video upload successful! Uploaded test.mov (${Math.round(videoBuffer.length / 1024 / 1024 * 100) / 100} MB) to S3 and generated signed URL.`
      }), 
      { ex: 86400 }
    );

    console.log(`Test video upload completed successfully for job ${jobId}`);

    res.status(200).json({ 
      jobId,
      message: 'Test video uploaded successfully',
      videoUrl: signedUrl,
      fileSize: `${Math.round(videoBuffer.length / 1024 / 1024 * 100) / 100} MB`
    });

  } catch (error) {
    console.error('Error in test video upload:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 