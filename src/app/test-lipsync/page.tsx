'use client';

import { useState } from 'react';

interface JobStatus {
  status: 'pending' | 'processing' | 'completed' | 'error';
  type?: string;
  step?: string;
  falStatus?: string;
  videoUrl?: string;
  originalVideoUrl?: string;
  audioUrl?: string;
  error?: string;
  pollingAttempt?: number;
}

export default function TestLipsyncPage() {
  const [videoUrl, setVideoUrl] = useState('');
  const [useDefaultAudio, setUseDefaultAudio] = useState(true);
  const [customAudioUrl, setCustomAudioUrl] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const pollJobStatus = async (jobId: string) => {
    try {
      const response = await fetch(`/api/job-status?jobId=${jobId}`);
      if (!response.ok) {
        throw new Error(`Status check failed: ${response.status}`);
      }
      
      const status: JobStatus = await response.json();
      setJobStatus(status);
      
      addLog(`Status: ${status.status} ${status.step ? `(${status.step})` : ''}`);
      
      if (status.falStatus) {
        addLog(`fal.ai: ${status.falStatus}`);
      }
      
      if (status.status === 'completed') {
        addLog('🎉 Lipsync video generation completed!');
        setIsGenerating(false);
        return;
      } else if (status.status === 'error') {
        addLog(`❌ Error: ${status.error}`);
        setIsGenerating(false);
        return;
      }
      
      // Continue polling
      setTimeout(() => pollJobStatus(jobId), 5000); // Poll every 5 seconds for UI responsiveness
    } catch (error) {
      addLog(`❌ Polling error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setTimeout(() => pollJobStatus(jobId), 5000); // Retry on error
    }
  };

  const handleGenerate = async () => {
    if (!videoUrl.trim()) {
      addLog('❌ Please enter a video URL');
      return;
    }

    if (!useDefaultAudio && !customAudioUrl.trim()) {
      addLog('❌ Please enter an audio URL or use default audio');
      return;
    }

    setIsGenerating(true);
    setJobStatus(null);
    setLogs([]);

    try {
      addLog('🚀 Starting lipsync video generation...');
      
      const requestBody: Record<string, unknown> = {
        videoUrl: videoUrl.trim(),
      };

      if (useDefaultAudio) {
        requestBody.useDefaultAudio = true;
        addLog('📱 Using default audio file (ella_1_cut.wav)');
      } else {
        requestBody.audioUrl = customAudioUrl.trim();
        addLog('🎵 Using custom audio URL');
      }

      const response = await fetch('/api/generate-lipsync-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`);
      }

      const { jobId: newJobId } = await response.json();
      addLog(`✅ Lipsync job submitted! ID: ${newJobId}`);
      
      // Start polling
      setTimeout(() => pollJobStatus(newJobId), 2000);
      
    } catch (error) {
      addLog(`❌ Failed to submit job: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsGenerating(false);
    }
  };

  const getProgress = () => {
    if (!jobStatus) return 0;
    
    switch (jobStatus.status) {
      case 'pending': return 10;
      case 'processing':
        switch (jobStatus.step) {
          case 'submitting-lipsync-job': return 30;
          case 'generating-lipsync': 
            // Estimate progress based on polling attempts
            const attempts = jobStatus.pollingAttempt || 0;
            return Math.min(90, 30 + (attempts * 3));
          default: return 50;
        }
      case 'completed': return 100;
      case 'error': return 0;
      default: return 0;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-black/20 backdrop-blur-sm border border-cyan-400/30 rounded-lg p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">
              🎤 Lipsync Video Generator Test
            </h1>
            <p className="text-cyan-200">
              Add lip-sync audio to dancing videos using fal.ai veed/lipsync
            </p>
            <div className="mt-3">
              <a 
                href="/test-video" 
                target="_blank"
                className="inline-flex items-center space-x-2 text-cyan-400 hover:text-cyan-300 text-sm transition-colors"
              >
                <span>🎬</span>
                <span>Generate a dancing video first →</span>
              </a>
            </div>
          </div>
          
          <div className="space-y-6">
            {/* Video URL Input */}
            <div className="space-y-2">
              <label className="text-lg font-semibold text-white block">Video URL</label>
              <input
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://v3.fal.media/files/..."
                className="w-full bg-black/30 border border-cyan-400/30 text-white placeholder-cyan-300/50 rounded-lg p-3"
              />
              <div className="bg-yellow-900/30 border border-yellow-400/30 rounded-lg p-3">
                <p className="text-yellow-200 text-sm">
                  💡 <strong>Tip:</strong> Use a video URL generated from the dancing video test page (/test-video). 
                  Generate a dancing video first, then copy the fal.ai video URL and paste it here.
                </p>
                <p className="text-yellow-300/70 text-xs mt-1">
                  fal.ai URLs start with: https://v3.fal.media/files/
                </p>
              </div>
            </div>

            {/* Audio Options */}
            <div className="space-y-4">
              <label className="text-lg font-semibold text-white block">Audio Source</label>
              
              <div className="space-y-3">
                {/* Default Audio Option */}
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name="audioSource"
                    checked={useDefaultAudio}
                    onChange={() => setUseDefaultAudio(true)}
                    className="text-cyan-400"
                  />
                  <span className="text-white">Use default audio (ella_1_cut.wav)</span>
                </label>

                {/* Custom Audio URL Option */}
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name="audioSource"
                    checked={!useDefaultAudio}
                    onChange={() => setUseDefaultAudio(false)}
                    className="text-cyan-400"
                  />
                  <span className="text-white">Use custom audio URL</span>
                </label>

                {/* Custom Audio URL Input */}
                {!useDefaultAudio && (
                  <input
                    type="url"
                    value={customAudioUrl}
                    onChange={(e) => setCustomAudioUrl(e.target.value)}
                    placeholder="https://example.com/audio.mp3"
                    className="w-full bg-black/30 border border-cyan-400/30 text-white placeholder-cyan-300/50 rounded-lg p-3 ml-6"
                  />
                )}
              </div>
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={!videoUrl.trim() || isGenerating || (!useDefaultAudio && !customAudioUrl.trim())}
              className="w-full bg-gradient-to-r from-pink-500 to-cyan-500 hover:from-pink-600 hover:to-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 text-lg rounded-lg transition-all"
            >
              {isGenerating ? '🎤 Generating Lipsync Video...' : '🚀 Generate Lipsync Video'}
            </button>

            {/* Progress Section */}
            {(isGenerating || jobStatus) && (
              <div className="bg-black/30 border border-cyan-400/30 rounded-lg p-6">
                <h3 className="text-white text-xl font-bold mb-4">Generation Progress</h3>
                
                {/* Progress Bar */}
                <div className="w-full bg-gray-700 rounded-full h-2 mb-4">
                  <div 
                    className="bg-gradient-to-r from-pink-500 to-cyan-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${getProgress()}%` }}
                  ></div>
                </div>
                
                {jobStatus && (
                  <div className="space-y-2">
                    <div className="text-cyan-200">
                      <span className="font-semibold">Status:</span> {jobStatus.status}
                    </div>
                    {jobStatus.step && (
                      <div className="text-cyan-200">
                        <span className="font-semibold">Step:</span> {jobStatus.step}
                      </div>
                    )}
                    {jobStatus.falStatus && (
                      <div className="text-cyan-200">
                        <span className="font-semibold">fal.ai Status:</span> {jobStatus.falStatus}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Video Result */}
            {jobStatus?.status === 'completed' && jobStatus.videoUrl && (
              <div className="bg-black/30 border border-green-400/30 rounded-lg p-6">
                <h3 className="text-white text-xl font-bold mb-4">🎉 Lipsync Video Ready!</h3>
                
                <div className="space-y-4">
                  {/* Original Video */}
                  <div>
                    <h4 className="text-cyan-200 font-semibold mb-2">Original Video:</h4>
                    <video 
                      src={jobStatus.originalVideoUrl} 
                      controls 
                      className="w-full max-w-md mx-auto rounded-lg shadow-lg"
                    />
                  </div>

                  {/* Lipsync Video */}
                  <div>
                    <h4 className="text-cyan-200 font-semibold mb-2">Lipsync Video:</h4>
                    <video 
                      src={jobStatus.videoUrl} 
                      controls 
                      className="w-full max-w-md mx-auto rounded-lg shadow-lg"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                      onClick={() => window.open(jobStatus.videoUrl, '_blank')}
                      className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                    >
                      📥 Download Lipsync Video
                    </button>
                    <button
                      onClick={() => window.open(jobStatus.originalVideoUrl, '_blank')}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                    >
                      📥 Download Original Video
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Logs */}
            {logs.length > 0 && (
              <div className="bg-black/30 border border-cyan-400/30 rounded-lg p-6">
                <h3 className="text-white text-xl font-bold mb-4">Generation Logs</h3>
                
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {logs.map((log, index) => (
                    <div key={index} className="text-sm text-cyan-200 font-mono">
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 