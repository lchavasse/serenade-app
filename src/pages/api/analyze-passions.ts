import { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

// Configure API route to allow larger body sizes for image uploads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // Increase from default 1mb to 10mb
    },
  },
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image } = req.body;
    
    if (!image || !image.data || !image.mime_type) {
      return res.status(400).json({ error: 'Image data is required' });
    }

    console.log('Analyzing user photo for passions...');
    
    const analysisResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyze this photo of a person and identify exactly 5 passions, interests, or hobbies that best describe them based on their style, setting, activity, expression, and overall vibe. Return ONLY a comma-separated list of 5 concise phrases (2-3 words each). Examples: 'live music, outdoor adventures, cooking, yoga, photography'. No explanations, just the list."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${image.mime_type};base64,${image.data}`
              }
            }
          ]
        }
      ],
      max_tokens: 100
    });

    const passions = analysisResponse.choices[0].message.content?.trim() || "";
    console.log('Extracted passions:', passions);

    res.status(200).json({ passions });

  } catch (error) {
    console.error('Error analyzing passions:', error);
    res.status(500).json({ 
      error: 'Failed to analyze image',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 