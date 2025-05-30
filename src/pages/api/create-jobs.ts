import { NextApiRequest, NextApiResponse } from "next";
import { v4 as uuid } from "uuid";
import redis from "../../lib/redis";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const jobId = uuid();
  await redis.set(`job:${jobId}`, JSON.stringify({ status: "pending", shareUrl: null }), { ex: 86400 });
  // Fire-and-forget background function
  await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/generate.background`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId, profile: req.body.profile, image: req.body.image })
  });
  res.status(202).json({ jobId });
}
