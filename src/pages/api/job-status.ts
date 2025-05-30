import { NextApiRequest, NextApiResponse } from "next";
import redis from "../../lib/redis";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { jobId } = req.query as { jobId: string };
  const raw = await redis.get(`job:${jobId}`) as string | null;
  if (!raw) return res.status(404).json({ error: "Job not found" });
  const { status, shareUrl } = JSON.parse(raw);
  res.status(200).json({ status, shareUrl });
}
