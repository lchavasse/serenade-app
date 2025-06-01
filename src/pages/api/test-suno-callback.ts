import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the callback URL from environment
    const baseUrl = process.env.YOUR_SITE_URL || 
                   (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    const callbackUrl = `${baseUrl}/api/suno-callback`;

    console.log('🧪 Testing Suno callback with URL:', callbackUrl);

    // Create a mock Suno callback payload
    const mockCallbackData = {
      code: 200,
      msg: "success",
      data: {
        callbackType: "complete",
        task_id: "test-task-id-12345",
        data: [
          {
            id: "test-audio-id",
            audio_url: "https://example.com/test-audio.mp3",
            source_audio_url: "https://example.com/test-source-audio.mp3",
            stream_audio_url: "https://example.com/test-stream-audio.mp3",
            source_stream_audio_url: "https://example.com/test-source-stream-audio.mp3",
            image_url: "https://example.com/test-image.jpg",
            source_image_url: "https://example.com/test-source-image.jpg",
            prompt: "Test song lyrics",
            model_name: "V4_5",
            title: "Test Song",
            tags: "test, song",
            createTime: new Date().toISOString(),
            duration: 180
          }
        ]
      }
    };

    // Send the mock callback to our own endpoint
    const response = await fetch(callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mockCallbackData),
    });

    const responseText = await response.text();
    
    console.log('🧪 Test callback response status:', response.status);
    console.log('🧪 Test callback response text:', responseText);

    return res.status(200).json({
      success: true,
      message: 'Test callback sent',
      callbackUrl,
      responseStatus: response.status,
      responseText,
    });

  } catch (error) {
    console.error('🧪 Test callback error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
} 