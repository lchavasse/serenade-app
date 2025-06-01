import { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';
import { songPrompt } from '../../lib/prompts';

// Configure OpenAI SDK to use OpenRouter
const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": process.env.YOUR_SITE_URL || "https://serenade-app.vercel.app",
    "X-Title": "Serenade App",
  },
});

interface SongResponse {
  lyrics: string;
  style_prompt: string;
  reasoning: string;
}

interface SongRequest {
  user_profile: string;
  match_profile: string;
  match_captions?: string; // Raw JSON string from caption-profile
  how_flirt: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<SongResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      lyrics: '',
      style_prompt: '',
      reasoning: ''
    });
  }

  try {
    const { user_profile, match_profile, match_captions, how_flirt }: SongRequest = req.body;

    if (!user_profile || !match_profile) {
      return res.status(400).json({ 
        lyrics: '',
        style_prompt: '',
        reasoning: ''
      });
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(500).json({ 
        lyrics: '',
        style_prompt: '',
        reasoning: ''
      });
    }

    console.log(`Generating songing!"`);

    // Create a detailed prompt for song generation
    const prompt = songPrompt(how_flirt);
    
    const response = await openrouter.chat.completions.create({
      model: "anthropic/claude-3.7-sonnet",
      messages: [
        {
          role: "system",
          content: prompt
        },
        {
          role: "user",
          content: `
          User profile
          ${user_profile}
          `
        },
        {
          role: "user",
          content: `
          Match profile
          ${match_profile}
          `
        },
        {
          role: "user",
          content: `
          Match captions
          ${match_captions}
          `
        }
      ],
      max_tokens: 10000,
      temperature: 0.8, // Higher temperature for more creativity
      response_format: { type: "json_object" }
    });

    let generatedContent = response.choices[0].message.content;
    
    if (!generatedContent) {
      throw new Error('No content generated from OpenRouter');
    }

    generatedContent = generatedContent.replaceAll('```json', '');

    let songData;
    try {
      songData = JSON.parse(generatedContent) as SongResponse;
    } catch {
      console.error('Failed to parse JSON response:', generatedContent);
      throw new Error('Invalid JSON response from AI model');
    }

    // Validate the response structure
    if (!songData.lyrics && !songData.style_prompt) {
      throw new Error('Incomplete song data generated');
    }

    console.log(`Successfully generated song: "${songData.lyrics}"`);

    return res.status(200).json({
      lyrics: songData.lyrics,
      style_prompt: songData.style_prompt,
      reasoning: songData.reasoning
    });

  } catch (error) {
    console.error('Error generating song:', error);
    
    return res.status(500).json({
      lyrics: '',
      style_prompt: '',
      reasoning: ''
    });
  }
}
