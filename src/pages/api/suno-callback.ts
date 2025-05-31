import { NextApiRequest, NextApiResponse } from 'next';

interface SunoCallbackData {
  code: number;
  msg: string;
  data: {
    callbackType: string;
    task_id: string;
    data: Array<{
      id: string;
      audio_url: string;
      source_audio_url: string;
      stream_audio_url: string;
      source_stream_audio_url: string;
      image_url: string;
      source_image_url: string;
      prompt: string;
      model_name: string;
      title: string;
      tags: string;
      createTime: string;
      duration: number;
    }>;
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const callbackData: SunoCallbackData = req.body;
    
    // Log the callback for debugging purposes
    console.log(`Suno callback received:`, {
      callbackType: callbackData.data?.callbackType,
      taskId: callbackData.data?.task_id,
      tracksCount: callbackData.data?.data?.length || 0
    });

    // No-op: We're using polling instead of callbacks, so we just acknowledge receipt
    return res.status(200).json({ message: 'Callback received' });

  } catch (error) {
    console.error('Error handling Suno callback:', error);
    
    // Still return 200 to acknowledge receipt even if there's an error
    return res.status(200).json({ message: 'Callback received with error' });
  }
} 