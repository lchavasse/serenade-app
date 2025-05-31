import { NextApiRequest, NextApiResponse } from 'next';

interface NoiseRequest {
  lyrics: string;
  style: string;
}

interface NoiseResponse {
  success: boolean;
  data?: {
    taskId: string;
    message: string;
  };
  error?: string;
}

interface SunoGenerateResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
  };
}

const BASE_URL = 'https://apibox.erweima.ai/api/v1/';

export default async function handler(req: NextApiRequest, res: NextApiResponse<NoiseResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  try {
    const { lyrics, style }: NoiseRequest = req.body;

    if (!lyrics || !style) {
      return res.status(400).json({ 
        success: false, 
        error: 'Both lyrics and style are required' 
      });
    }

    if (!process.env.SUNO_API_KEY) {
      return res.status(500).json({ 
        success: false, 
        error: 'Suno API key not configured' 
      });
    }

    console.log(`Generating music with Suno API...`);

    // Extract title from first line of lyrics or create a default
    const firstLine = lyrics.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || 'Generated Song';
    const title = firstLine.length > 80 ? firstLine.substring(0, 77) + '...' : firstLine;

    // Call Suno API to generate music
    const generateResponse = await fetch(`${BASE_URL}/generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUNO_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customMode: true,
        instrumental: false,
        prompt: lyrics,
        style: style,
        title: title,
        model: 'V4_5',
        callBackUrl: `${process.env.YOUR_SITE_URL || 'https://serenade-app.vercel.app'}/api/suno-callback`
      }),
    });

    if (!generateResponse.ok) {
      throw new Error(`Suno API request failed: ${generateResponse.status} ${generateResponse.statusText}`);
    }

    const generateResult: SunoGenerateResponse = await generateResponse.json();
    
    if (generateResult.code !== 200) {
      throw new Error(`Suno API error: ${generateResult.msg}`);
    }

    const taskId = generateResult.data.taskId;
    console.log(`Music generation started with task ID: ${taskId}`);

    return res.status(200).json({
      success: true,
      data: {
        taskId: taskId,
        message: 'Music generation started. Results will be delivered via callback.'
      }
    });

  } catch (error) {
    console.error('Error generating music:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return res.status(500).json({
      success: false,
      error: `Failed to generate music: ${errorMessage}`
    });
  }
}
