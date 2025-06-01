import { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';
import { CAPTION_PROMPT } from '../../lib/prompts';

// Configure runtime for API route
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // Allow larger payloads for multiple images
    },
  },
}

// Configure OpenAI SDK to use OpenRouter
const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": process.env.YOUR_SITE_URL || "https://serenade-app.vercel.app",
    "X-Title": "Serenade App",
  },
});

interface ImageInput {
  data: string; // base64 encoded image data
  mime_type: string; // e.g., "image/jpeg", "image/png"
}

interface CaptionResponse {
  captions: string; // Raw JSON string from OpenRouter
  success: boolean;
  error?: string;
}

interface CaptionRequest {
  images: ImageInput[];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<CaptionResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      captions: '',
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    const { images }: CaptionRequest = req.body;

    // Validate input
    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ 
        captions: '',
        success: false,
        error: 'At least one image is required'
      });
    }

    // Validate each image
    for (const image of images) {
      if (!image || !image.data || !image.mime_type) {
        return res.status(400).json({ 
          captions: '',
          success: false,
          error: 'Invalid image data - each image must have data and mime_type'
        });
      }
    }

    // Check for OpenRouter API key
    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(500).json({ 
        captions: '',
        success: false,
        error: 'OpenRouter API key not configured'
      });
    }

    console.log(`Captioning ${images.length} profile images...`);

    // Create the captioning prompt
    const captionPrompt = CAPTION_PROMPT;

    // Prepare content for OpenRouter API
    const content = [
      {
        type: "text" as const,
        text: captionPrompt
      },
      ...images.map((image) => ({
        type: "image_url" as const,
        image_url: {
          url: `data:${image.mime_type};base64,${image.data}`
        }
      }))
    ];

    // Call OpenRouter API
    const response = await openrouter.chat.completions.create({
      model: "anthropic/claude-3.7-sonnet",
      messages: [
        {
          role: "user",
          content: content
        }
      ],
      max_tokens: 2000, // Allow enough tokens for multiple detailed captions
      temperature: 0.3, // Lower temperature for more consistent, structured output
      response_format: { type: "json_object" }
    });

    let generatedContent = response.choices[0].message.content;
    
    if (!generatedContent) {
      throw new Error('No content generated from OpenRouter');
    }

    // Clean up potential markdown formatting
    generatedContent = generatedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');

    console.log(`Successfully generated captions for ${images.length} images`);

    return res.status(200).json({
      captions: generatedContent, // Return raw JSON string
      success: true
    });

  } catch (error) {
    console.error('Error generating captions:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return res.status(500).json({
      captions: '',
      success: false,
      error: errorMessage
    });
  }
}
