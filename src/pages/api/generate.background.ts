import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import redis from "../../lib/redis";
import OpenAI from "openai";

export const config = { runtime: "nodejs", regions: ["iad1"] };

export default async function handler(req: NextRequest) {
  const { jobId, profile, image } = await req.json();
  try {
    // 1. Call your audio-video API...
    // 2. Generate finalMediaBuffer (Buffer of MP4/MP3)
    const finalMediaBuffer = Buffer.from(""); // TODO: Replace with actual generated media
    // 3. Upload to S3
    const s3 = new S3Client({ region: "eu-west-2" });
    await s3.send(new PutObjectCommand({
      Bucket: process.env.BUCKET_NAME!,
      Key: `videos/${jobId}.mp4`,
      Body: finalMediaBuffer,
      ContentType: "video/mp4",
      ACL: "private"
    }));
    // 4. Generate signed CloudFront URL
    const shareUrl = await getSignedUrl(s3,
      new PutObjectCommand({
        Bucket: process.env.BUCKET_NAME!,
        Key: `videos/${jobId}.mp4`
      }), { expiresIn: 60 * 60 * 24 * 7 });
    // 5. Update Redis status
    await redis.set(`job:${jobId}`, JSON.stringify({ status: "done", shareUrl }), { ex: 86400 });
  } catch (err) {
    console.error(err);
    await redis.set(`job:${jobId}`, JSON.stringify({ status: "error", shareUrl: null }), { ex: 3600 });
  }
  return NextResponse.json({ ok: true });
}
