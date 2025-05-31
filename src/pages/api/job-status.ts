import { NextApiRequest, NextApiResponse } from 'next';
import redis from '@/lib/redis';
import { JobData as NewJobData } from './create-job';

// Legacy types for backward compatibility (can be removed later)
export type OverallJobStatus = 'pending' | 'processing' | 'completed' | 'partial_complete' | 'error';
export type SongTrackStatus = 'pending' | 'analyzing' | 'generating_lyrics' | 'generating_song' | 'completed' | 'error' | 'skipped';
export type VideoTrackStatus = 'pending' | 'enhancing_prompt' | 'generating_video' | 'completed' | 'error' | 'skipped';

export type SongTrackData = 
  | {
      status: Extract<SongTrackStatus, 'pending'>;
      startedAt?: string;
      completedAt?: string;
      error?: string;
    }
  | {
      status: Extract<SongTrackStatus, 'analyzing'>;
      startedAt: string;
      completedAt?: string;
      error?: string;
    }
  | {
      status: Extract<SongTrackStatus, 'generating_lyrics'>;
      startedAt: string;
      completedAt?: string;
      error?: string;
      analysis: string;
    }
  | {
      status: Extract<SongTrackStatus, 'generating_song'>;
      startedAt: string;
      completedAt?: string;
      error?: string;
      analysis: string;
      lyrics: string;
      style: string;
      sunoTaskId: string;
    }
  | {
      status: Extract<SongTrackStatus, 'completed'>;
      startedAt: string;
      completedAt: string;
      error?: string;
      analysis: string;
      lyrics: string;
      style: string;
      sunoTaskId: string;
      audioUrl: string;
    }
  | {
      status: Extract<SongTrackStatus, 'error'>;
      startedAt?: string;
      completedAt?: string;
      error: string;
      analysis?: string;
      lyrics?: string;
      style?: string;
      sunoTaskId?: string;
      audioUrl?: string;
    }
  | {
      status: Extract<SongTrackStatus, 'skipped'>;
      startedAt?: string;
      completedAt?: string;
      error?: string;
    };

export type VideoTrackData = 
  | {
      status: Extract<VideoTrackStatus, 'pending'>;
      startedAt?: string;
      completedAt?: string;
      error?: string;
    }
  | {
      status: Extract<VideoTrackStatus, 'enhancing_prompt'>;
      startedAt: string;
      completedAt?: string;
      error?: string;
      imageUrl: string;
    }
  | {
      status: Extract<VideoTrackStatus, 'generating_video'>;
      startedAt: string;
      completedAt?: string;
      error?: string;
      imageUrl: string;
      enhancedPrompt: string;
      falRequestId: string;
    }
  | {
      status: Extract<VideoTrackStatus, 'completed'>;
      startedAt: string;
      completedAt: string;
      error?: string;
      imageUrl: string;
      enhancedPrompt: string;
      falRequestId: string;
      videoUrl: string;
    }
  | {
      status: Extract<VideoTrackStatus, 'error'>;
      startedAt?: string;
      completedAt?: string;
      error: string;
      imageUrl?: string;
      enhancedPrompt?: string;
      falRequestId?: string;
      videoUrl?: string;
    }
  | {
      status: Extract<VideoTrackStatus, 'skipped'>;
      startedAt?: string;
      completedAt?: string;
      error?: string;
    };

export interface JobData {
  status: OverallJobStatus;
  jobId: string;
  createdAt?: string;
  updatedAt?: string;
  songTrack: SongTrackData;
  videoTrack: VideoTrackData;
  progress: {
    songComplete: boolean;
    videoComplete: boolean;
    overallPercent: number;
  };
  error?: string;
}

// Legacy helper functions for backward compatibility
export function calculateOverallStatus(songStatus: SongTrackStatus, videoStatus: VideoTrackStatus): OverallJobStatus {
  if (songStatus === 'completed' && videoStatus === 'completed') return 'completed';
  if ((songStatus === 'completed' && ['pending', 'enhancing_prompt', 'generating_video'].includes(videoStatus)) ||
      (videoStatus === 'completed' && ['pending', 'analyzing', 'generating_lyrics', 'generating_song'].includes(songStatus))) {
    return 'partial_complete';
  }
  if (['analyzing', 'generating_lyrics', 'generating_song'].includes(songStatus) ||
      ['enhancing_prompt', 'generating_video'].includes(videoStatus)) {
    return 'processing';
  }
  if ((songStatus === 'error' && videoStatus === 'error') ||
      (songStatus === 'error' && videoStatus === 'skipped') ||
      (songStatus === 'skipped' && videoStatus === 'error')) {
    return 'error';
  }
  return 'pending';
}

export function calculateProgress(songStatus: SongTrackStatus, videoStatus: VideoTrackStatus): number {
  const songProgress = getSongProgress(songStatus);
  const videoProgress = getVideoProgress(videoStatus);
  return Math.round((songProgress + videoProgress) / 2);
}

function getSongProgress(status: SongTrackStatus): number {
  switch (status) {
    case 'pending': return 0;
    case 'analyzing': return 25;
    case 'generating_lyrics': return 50;
    case 'generating_song': return 75;
    case 'completed': return 100;
    case 'error':
    case 'skipped': return 0;
    default: return 0;
  }
}

function getVideoProgress(status: VideoTrackStatus): number {
  switch (status) {
    case 'pending': return 0;
    case 'enhancing_prompt': return 33;
    case 'generating_video': return 66;
    case 'completed': return 100;
    case 'error':
    case 'skipped': return 0;
    default: return 0;
  }
}

// Legacy helper functions (kept for backward compatibility)
export function createInitialSongTrack(): SongTrackData {
  return { status: 'pending' as const };
}

export function createInitialVideoTrack(): VideoTrackData {
  return { status: 'pending' as const };
}

export function createSkippedSongTrack(): SongTrackData {
  return { status: 'skipped' as const };
}

export function createSkippedVideoTrack(): VideoTrackData {
  return { status: 'skipped' as const };
}

export function startSongAnalysis(): Extract<SongTrackData, { status: 'analyzing' }> {
  return { status: 'analyzing' as const, startedAt: new Date().toISOString() };
}

export function completeSongAnalysis(
  prevTrack: Extract<SongTrackData, { status: 'analyzing' }>,
  analysis: string
): Extract<SongTrackData, { status: 'generating_lyrics' }> {
  return {
    status: 'generating_lyrics' as const,
    startedAt: prevTrack.startedAt,
    analysis,
  };
}

export function startSongGeneration(
  prevTrack: Extract<SongTrackData, { status: 'generating_lyrics' }>,
  lyrics: string,
  style: string,
  sunoTaskId: string
): Extract<SongTrackData, { status: 'generating_song' }> {
  return {
    status: 'generating_song' as const,
    startedAt: prevTrack.startedAt,
    analysis: prevTrack.analysis,
    lyrics,
    style,
    sunoTaskId,
  };
}

export function completeSongGeneration(
  prevTrack: Extract<SongTrackData, { status: 'generating_song' }>,
  audioUrl: string
): Extract<SongTrackData, { status: 'completed' }> {
  return {
    status: 'completed' as const,
    startedAt: prevTrack.startedAt,
    completedAt: new Date().toISOString(),
    analysis: prevTrack.analysis,
    lyrics: prevTrack.lyrics,
    style: prevTrack.style,
    sunoTaskId: prevTrack.sunoTaskId,
    audioUrl,
  };
}

export function startVideoProcessing(
  prevTrack: Extract<VideoTrackData, { status: 'pending' }>,
  imageUrl: string
): Extract<VideoTrackData, { status: 'enhancing_prompt' }> {
  return {
    status: 'enhancing_prompt' as const,
    startedAt: new Date().toISOString(),
    imageUrl,
  };
}

export function startVideoGeneration(
  prevTrack: Extract<VideoTrackData, { status: 'enhancing_prompt' }>,
  enhancedPrompt: string,
  falRequestId: string
): Extract<VideoTrackData, { status: 'generating_video' }> {
  return {
    status: 'generating_video' as const,
    startedAt: prevTrack.startedAt,
    imageUrl: prevTrack.imageUrl,
    enhancedPrompt,
    falRequestId,
  };
}

export function completeVideoGeneration(
  prevTrack: Extract<VideoTrackData, { status: 'generating_video' }>,
  videoUrl: string
): Extract<VideoTrackData, { status: 'completed' }> {
  return {
    status: 'completed' as const,
    startedAt: prevTrack.startedAt,
    completedAt: new Date().toISOString(),
    imageUrl: prevTrack.imageUrl,
    enhancedPrompt: prevTrack.enhancedPrompt,
    falRequestId: prevTrack.falRequestId,
    videoUrl,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { jobId } = req.query;

  if (!jobId || typeof jobId !== 'string') {
    return res.status(400).json({ error: 'Job ID is required' });
  }

  try {
    const jobData = await redis.get(`job:${jobId}`);
    
    if (!jobData) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Try to parse as JobData first (new format)
    try {
      const simpleJob = jobData as NewJobData;
      if (simpleJob.type && ['song', 'video'].includes(simpleJob.type)) {
        // This is a simple job, return it directly
        return res.status(200).json(simpleJob);
      }
    } catch {
      // Not a simple job, continue to legacy format
    }

    // Legacy format (parallel job)
    const legacyJob = jobData as JobData;
    return res.status(200).json(legacyJob);

  } catch (error) {
    console.error('Error fetching job status:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
