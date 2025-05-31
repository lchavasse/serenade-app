import { Redis } from "@upstash/redis";

// Ensure URL starts with https://
const formatUrl = (url: string | undefined): string => {
  if (!url) {
    throw new Error('UPSTASH_REDIS_REST_URL is required');
  }
  
  if (url.startsWith('https://')) {
    return url;
  }
  
  // If URL doesn't start with https://, add it
  return `https://${url}`;
};

const redis = new Redis({
  url: formatUrl(process.env.UPSTASH_REDIS_REST_URL),
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export default redis;
