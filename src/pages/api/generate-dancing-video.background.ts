import { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';
import { fal } from "@fal-ai/client";
import redis from '@/lib/redis';
import { JobData } from './create-job';

// Configure runtime for background function
export const config = {
  runtime: 'nodejs',
}

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

// Configure fal.ai client
if (process.env.FAL_KEY) {
  fal.config({
    credentials: process.env.FAL_KEY
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { jobId, imageUrl } = req.body;

  if (!jobId || !imageUrl) {
    return res.status(400).json({ error: 'Missing jobId or imageUrl data' });
  }

  // Respond immediately to avoid timeout
  res.status(200).json({ message: 'Background processing started' });

  // Process in background
  try {
    await processDancingVideoInBackground(jobId, imageUrl);
  } catch (error) {
    console.error('Background processing error:', error);
    await updateJobWithError(jobId, error instanceof Error ? error.message : 'Unknown error');
  }
}

export async function processDancingVideoInBackground(
  jobId: string, 
  imageUrl: string
) {
  try {
    console.log(`Starting dancing video generation for job ${jobId}`);

    // Validate required environment variables
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY environment variable is required');
    }
    if (!process.env.FAL_KEY) {
      throw new Error('FAL_KEY environment variable is required');
    }

    // Step 1: Update status to processing
    await updateJobStatus(jobId, 'processing');

    // Step 2: Enhance the prompt with OpenAI GPT-4o using the profile image
    console.log('Step 1: Enhancing prompt with GPT-4o...');

    const systemPrompt = `You are a prompt generator for an image-to-video model like Kling.
Your job is to take an input image of a person in a real scene and generate a highly specific 10-second video generation prompt describing them dancing and lip-syncing in the same setting, with fluid body movement, camera interaction, and vivid personality.

Instructions:
- Use the person's appearance, outfit, and pose from the image.
- Keep the background, lighting, and overall vibe consistent with the image.
- The person should dance and mouth the lyrics to a fun, upbeat song.
- Describe movement, facial expressions, camera interaction, and scene progression in natural, cinematic detail.

Your output should:
-Be written in the second person ("the person begins...")
- Include exact breakdowns of action every 2–3 seconds
- Maintain full background consistency (furniture, lighting, colors)
- Include expressive body movement: hips, arms, footwork, twirls
- Include details of camera angles and effects

The video should end in the same position that it started so it can be looped
`
    const assistantPrompt = `KHere is an example prompt:

"""
Generate a 10-second video of a young South Asian man dancing joyfully in a bright, cozy living room with a retro, creative vibe. He is wearing a vibrant, patterned short-sleeve shirt in purple, yellow, and blue geometric designs, paired with dark joggers. He has a trimmed beard, short dark hair, and is smiling playfully while holding a smartphone loosely in one hand.

The scene begins with him standing casually in the center of the room, natural daylight filling the space, facing the camera with a relaxed and confident posture. At the start of the video (0s–2s), he starts swaying his hips rhythmically left and right, grinning and making playful eye contact with the camera. He raises his right hand, waves it in the air in circular motions while still holding the phone, then lifts his left hand and does the same, moving with the beat.

Between 2s–5s, he mouths the lyrics of a fun, upbeat pop or disco song — and gives a cheeky wink to the camera. He spins once on the spot (a smooth twirl to his left), then points toward the camera as if inviting the viewer to join in.

From 5s–8s, he steps back slightly and begins a loose, fun two-step, bouncing on the balls of his feet while rolling his shoulders and twisting his torso. His arms wave fluidly in a loose "noodle-dance" style, playful and carefree, matching the rhythm.

In the final seconds (8s–10s), he faces the camera directly again, mouth-syncing the final few words of the chorus dramatically, then finishes with a double peace sign gesture and a big smile, slightly leaning forward. The background stays consistent with posters, a green couch, and natural sunlight, preserving the authentic casual indoor setting.

The mood is expressive, confident, lighthearted, and a bit cheeky — full of character and charm.
"""

Output only the final video prompt (no explanation or extras).
`
    
    const promptEnhancementResponse = await openai.chat.completions.create({
      model: "anthropic/claude-3.7-sonnet",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "assistant",
          content: assistantPrompt
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Generate an image to video prompt for this person`
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl
              }
            }
          ]
        }
      ],
      max_tokens: 2000
    });

    const enhancedPrompt = promptEnhancementResponse.choices[0].message.content;
    console.log('Enhanced prompt:', enhancedPrompt);

    if (!enhancedPrompt) {
      throw new Error('Failed to generate enhanced prompt');
    }

    // Validate and clean the enhanced prompt
    let cleanedPrompt = enhancedPrompt.trim();
    
    // Ensure the prompt is not too long (fal.ai might have limits)
    if (cleanedPrompt.length > 2500) {
      cleanedPrompt = cleanedPrompt.substring(0, 2497) + '...';
      console.log('Truncated long prompt to 2500 characters');
    }
    
    // Remove any potentially problematic content patterns
    cleanedPrompt = cleanedPrompt
      .replace(/\b(nude|naked|explicit|nsfw)\b/gi, 'artistic')
      .replace(/\b(violence|violent|blood|gore)\b/gi, 'dynamic');
    
    console.log('Cleaned prompt:', cleanedPrompt);

    // Update job with enhanced prompt
    await updateJobWithEnhancedPrompt(jobId, cleanedPrompt);

    // Step 3: Submit job to fal.ai
    console.log('Step 2: Submitting video generation job to fal.ai...');
    
    // Construct the callback URL
    const callbackUrl = `${process.env.YOUR_SITE_URL}/api/fal-kling-callback`;
    console.log('Using callback URL:', callbackUrl);
    
    const { request_id } = await fal.queue.submit("fal-ai/kling-video/v2.1/standard/image-to-video", {
      input: {
        prompt: cleanedPrompt,
        image_url: imageUrl,
        duration: "5", // String format as in docs
        aspect_ratio: "9:16", // Mobile format
        negative_prompt: "blur, distort, and low quality", // Add default negative prompt
        cfg_scale: 0.5
      },
      webhookUrl: callbackUrl
    });

    console.log('Video generation job submitted with request_id:', request_id);
    console.log('Fal.ai will call our webhook when the video is ready');

    // Update job with fal request ID and set status to processing
    await updateJobWithFalRequestId(jobId, request_id);
    await updateJobStatus(jobId, 'processing');

    console.log(`Dancing video generation job submitted successfully for job ${jobId}. Waiting for callback...`);

  } catch (error) {
    console.error('Error in dancing video background processing:', error);
    
    // Update job with error
    await updateJobWithError(jobId, error instanceof Error ? error.message : 'Unknown error');
    
    throw error; // Re-throw to be handled by caller
  }
} 

// Helper functions to update job status
async function updateJobStatus(jobId: string, status: 'pending' | 'processing' | 'completed' | 'error') {
  const currentJobData = await redis.get(`job:${jobId}`);
  if (!currentJobData) {
    throw new Error(`Job ${jobId} not found`);
  }
  
  const jobData = currentJobData as JobData & { type: 'video' };
  const updatedJobData: JobData = {
    ...jobData,
    status,
    updatedAt: new Date().toISOString(),
  };
  
  await redis.set(`job:${jobId}`, JSON.stringify(updatedJobData), { ex: 86400 });
}

async function updateJobWithEnhancedPrompt(jobId: string, enhancedPrompt: string) {
  const currentJobData = await redis.get(`job:${jobId}`);
  if (!currentJobData) {
    throw new Error(`Job ${jobId} not found`);
  }
  
  const jobData = currentJobData as JobData & { type: 'video' };
  const updatedJobData: JobData = {
    ...jobData,
    enhancedPrompt,
    updatedAt: new Date().toISOString(),
  };
  
  await redis.set(`job:${jobId}`, JSON.stringify(updatedJobData), { ex: 86400 });
}

async function updateJobWithFalRequestId(jobId: string, falRequestId: string) {
  const currentJobData = await redis.get(`job:${jobId}`);
  if (!currentJobData) {
    throw new Error(`Job ${jobId} not found`);
  }
  
  const jobData = currentJobData as JobData & { type: 'video' };
  const updatedJobData: JobData = {
    ...jobData,
    falRequestId,
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