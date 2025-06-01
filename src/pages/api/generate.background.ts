import { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';
import redis from '@/lib/redis';
import { JobData } from './create-job';
import { ANALYSIS_PROMPT } from '../prompts';

// Configure runtime for background function
export const config = {
  runtime: 'nodejs',
  // Note: maxDuration is handled by Vercel deployment config, not Next.js API routes
}

// Configure OpenAI client to use OpenRouter
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "https://serenade-app.vercel.app",
    "X-Title": "Serenade App",
  },
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { jobId, images, how_flirt, user_profile } = req.body;

  if (!jobId || !images) {
    return res.status(400).json({ error: 'Missing jobId or images data' });
  }

  // Provide default values if not present (for backward compatibility)
  const flirtLevel = how_flirt || 'Romantic';
  console.log('user_profile', JSON.stringify(user_profile))
  const profile = user_profile || { name: 'Someone Special', passions: 'life and adventure' };

  // Respond immediately to avoid timeout
  res.status(200).json({ message: 'Song generation started' });

  // Process in background
  try {
    await generateSong(jobId, images, flirtLevel, profile);
  } catch (error) {
    console.error('Song generation error:', error);
    await updateJobWithError(jobId, error instanceof Error ? error.message : 'Unknown error');
  }
}

// Main song generation function
export async function generateSong(jobId: string, images: { data: string; mime_type: string }[], how_flirt: string, user_profile: { name: string, passions: string }) {
  try {
    console.log(`Starting song generation for job ${jobId} with ${images.length} images`);

    // Update job status to processing
    await createJobWithPendingStatus(jobId);

    // Step 1: Generate detailed captions for profile images
    console.log('Step 1: Generating profile image captions...');
    
    const captionResponse = await fetch(`${process.env.YOUR_SITE_URL || 'http://localhost:3000'}/api/caption-profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        images: images
      })
    });

    if (!captionResponse.ok) {
      throw new Error(`Caption API request failed: ${captionResponse.status} ${captionResponse.statusText}`);
    }

    const captionData = await captionResponse.json();
    
    if (!captionData.success || !captionData.captions) {
      throw new Error('Failed to generate image captions');
    }

    console.log(`Generated ${captionData.captions.length} image captions`);

    // Step 2: Analyze the dating profile with OpenRouter (for basic profile data)
    console.log('Step 2: Analyzing dating profile for basic information...');
    
    const analysisPrompt = ANALYSIS_PROMPT;

    const content = [
      {
        type: "text" as const,
        text: analysisPrompt
      },
      ...images.map(image => ({
        type: "image_url" as const,
        image_url: {
          url: `data:${image.mime_type};base64,${image.data}`
        }
      }))
    ];

    const analysisResponse = await openai.chat.completions.create({
      model: "anthropic/claude-3.7-sonnet",
      messages: [
        {
          role: "user",
          content: content
        }
      ],
      max_tokens: 500
    });

    const analysis = analysisResponse.choices[0].message.content;
    console.log('Analysis completed');

    // Update job with analysis
    await updateJobWithAnalysis(jobId, analysis || '');

    // Step 3: Generate song lyrics using make-song endpoint with captions
    console.log('Step 3: Generating song lyrics using make-song endpoint...');
    
    // Create a placeholder user profile for the make-song endpoint
    const userProfile = JSON.stringify({
      "basic": {
        "name": user_profile.name,
      },
      "passions": user_profile.passions
    });

    const makeSongResponse = await fetch(`${process.env.YOUR_SITE_URL || 'http://localhost:3000'}/api/make-song`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_profile: userProfile,
        match_profile: analysis || "{}",
        match_captions: captionData.captions,
        how_flirt: how_flirt
      }),
    });

    if (!makeSongResponse.ok) {
      throw new Error(`Make-song API request failed: ${makeSongResponse.status} ${makeSongResponse.statusText}`);
    }

    const lyricsData = await makeSongResponse.json();
    console.log('Lyrics generated successfully');

    // Update job with lyrics and style
    await updateJobWithLyrics(jobId, lyricsData.lyrics || '');
    await updateJobWithStyle(jobId, lyricsData.style_prompt || 'pop ballad');

    // Step 4: Generate song using make-noise endpoint
    console.log('Step 4: Generating song using make-noise endpoint...');
    
    const makeNoiseResponse = await fetch(`${process.env.YOUR_SITE_URL || 'http://localhost:3000'}/api/make-noise`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        lyrics: lyricsData.lyrics || "",
        style: lyricsData.style_prompt || "pop ballad"
      }),
    });

    if (!makeNoiseResponse.ok) {
      throw new Error(`Make-noise API request failed: ${makeNoiseResponse.status} ${makeNoiseResponse.statusText}`);
    }

    const songGenerationData = await makeNoiseResponse.json();
    
    if (!songGenerationData.data?.taskId) {
      throw new Error('No task ID returned from make-noise endpoint');
    }

    console.log(`Suno task created with ID: ${songGenerationData.data.taskId}`);

    // Update job with Suno task ID
    await updateJobWithSunoTask(jobId, songGenerationData.data.taskId);

    // Store the mapping for the callback
    await redis.set(`suno:${songGenerationData.data.taskId}`, jobId, { ex: 86400 });

    console.log(`Song generation process completed for job ${jobId}`);

  } catch (error) {
    console.error('Error in song generation:', error);
    throw error; // Re-throw to be handled by caller
  }
}

async function createJobWithPendingStatus(jobId: string) {
  await redis.set(`job:${jobId}`, JSON.stringify({
    status: 'pending',
    type: 'song',
    createdAt: new Date().toISOString()
  }), { ex: 86400 });
}

// Helper functions to update job status
async function updateJobWithAnalysis(jobId: string, analysis: string) {
  const currentJobData = await redis.get(`job:${jobId}`);
  if (!currentJobData) {
    throw new Error(`Job ${jobId} not found`);
  }
  
  const jobData = currentJobData as JobData & { type: 'song' };
  const updatedJobData: JobData = {
    ...jobData,
    analysis,
    updatedAt: new Date().toISOString(),
  };
  
  await redis.set(`job:${jobId}`, JSON.stringify(updatedJobData), { ex: 86400 });
}

async function updateJobWithLyrics(jobId: string, lyrics: string) {
  const currentJobData = await redis.get(`job:${jobId}`);
  if (!currentJobData) {
    throw new Error(`Job ${jobId} not found`);
  }
  
  const jobData = currentJobData as JobData & { type: 'song' };
  const updatedJobData: JobData = {
    ...jobData,
    lyrics,
    updatedAt: new Date().toISOString(),
  };
  
  await redis.set(`job:${jobId}`, JSON.stringify(updatedJobData), { ex: 86400 });
}

async function updateJobWithStyle(jobId: string, style: string) {
  const currentJobData = await redis.get(`job:${jobId}`);
  if (!currentJobData) {
    throw new Error(`Job ${jobId} not found`);
  }
  
  const jobData = currentJobData as JobData & { type: 'song' };
  const updatedJobData: JobData = {
    ...jobData,
    style,
    updatedAt: new Date().toISOString(),
  };
  
  await redis.set(`job:${jobId}`, JSON.stringify(updatedJobData), { ex: 86400 });
}

async function updateJobWithSunoTask(jobId: string, sunoTaskId: string) {
  const currentJobData = await redis.get(`job:${jobId}`);
  if (!currentJobData) {
    throw new Error(`Job ${jobId} not found`);
  }
  
  const jobData = currentJobData as JobData & { type: 'song' };
  const updatedJobData: JobData = {
    ...jobData,
    sunoTaskId,
    updatedAt: new Date().toISOString(),
  };
  
  await redis.set(`job:${jobId}`, JSON.stringify(updatedJobData), { ex: 86400 });
}

async function updateJobWithError(jobId: string, errorMessage: string) {
  try {
    const currentJobData = await redis.get(`job:${jobId}`);
    if (currentJobData) {
      const jobData = currentJobData as JobData;
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
