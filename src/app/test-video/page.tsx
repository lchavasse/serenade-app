'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';

interface JobStatus {
  status: 'pending' | 'processing' | 'completed' | 'error';
  type?: string;
  step?: string;
  falStatus?: string;
  enhancedPrompt?: string;
  videoUrl?: string;
  error?: string;
  pollingAttempt?: number;
}

export default function TestVideoPage() {
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('dancing energetically at a party with colorful lights');
  const [isGenerating, setIsGenerating] = useState(false);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

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
        addLog('🎉 Video generation completed!');
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
    if (!selectedImage || !prompt.trim()) {
      addLog('❌ Please select an image and enter a prompt');
      return;
    }

    setIsGenerating(true);
    setJobStatus(null);
    setLogs([]);

    try {
      addLog('🚀 Starting video generation...');
      
      // Convert image to base64
      const reader = new FileReader();
      reader.onload = async (e: ProgressEvent<FileReader>) => {
        const base64Data = e.target?.result as string;
        
        try {
          const response = await fetch('/api/generate-dancing-video', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              imageData: base64Data,
              prompt: prompt.trim()
            })
          });

          if (!response.ok) {
            throw new Error(`Request failed: ${response.status} ${response.statusText}`);
          }

          const { jobId: newJobId } = await response.json();
          addLog(`✅ Job submitted! ID: ${newJobId}`);
          
          // Start polling
          setTimeout(() => pollJobStatus(newJobId), 2000);
          
        } catch (error) {
          addLog(`❌ Failed to submit job: ${error instanceof Error ? error.message : 'Unknown error'}`);
          setIsGenerating(false);
        }
      };
      reader.readAsDataURL(selectedImage);
      
    } catch (error) {
      addLog(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsGenerating(false);
    }
  };

  const getProgress = () => {
    if (!jobStatus) return 0;
    
    switch (jobStatus.status) {
      case 'pending': return 10;
      case 'processing':
        switch (jobStatus.step) {
          case 'enhancing-prompt': return 25;
          case 'submitting-video-job': return 40;
          case 'generating-video': 
            // Estimate progress based on polling attempts
            const attempts = jobStatus.pollingAttempt || 0;
            return Math.min(90, 40 + (attempts * 2));
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
              🎬 Dancing Video Generator Test
            </h1>
            <p className="text-cyan-200">
              Upload an image and generate an AI dancing video
            </p>
          </div>
          
          <div className="space-y-6">
            {/* Image Upload */}
            <div className="space-y-4">
              <label className="text-lg font-semibold text-white block">Upload Image</label>
              
              <div 
                className="border-2 border-dashed border-cyan-400/50 rounded-lg p-8 text-center cursor-pointer hover:border-cyan-400 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {imagePreview ? (
                  <div className="space-y-4">
                    <Image 
                      src={imagePreview} 
                      alt="Preview" 
                      width={300}
                      height={256}
                      className="max-w-xs max-h-64 mx-auto rounded-lg shadow-lg object-cover"
                    />
                    <p className="text-cyan-200">Click to change image</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-4xl">📷</div>
                    <p className="text-cyan-200">Click to upload an image</p>
                  </div>
                )}
              </div>
              
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />
            </div>

            {/* Prompt Input */}
            <div className="space-y-2">
              <label className="text-lg font-semibold text-white block">Dancing Prompt</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe how you want the person to dance..."
                className="w-full bg-black/30 border border-cyan-400/30 text-white placeholder-cyan-300/50 rounded-lg p-3"
                rows={3}
              />
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={!selectedImage || !prompt.trim() || isGenerating}
              className="w-full bg-gradient-to-r from-pink-500 to-cyan-500 hover:from-pink-600 hover:to-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 text-lg rounded-lg transition-all"
            >
              {isGenerating ? '🎬 Generating Video...' : '🚀 Generate Dancing Video'}
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
                    {jobStatus.enhancedPrompt && (
                      <div className="text-cyan-200">
                        <span className="font-semibold">Enhanced Prompt:</span>
                        <div className="text-sm bg-black/20 p-2 rounded mt-1">
                          {jobStatus.enhancedPrompt}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Video Result */}
            {jobStatus?.status === 'completed' && jobStatus.videoUrl && (
              <div className="bg-black/30 border border-green-400/30 rounded-lg p-6">
                <h3 className="text-white text-xl font-bold mb-4">🎉 Video Ready!</h3>
                
                <video 
                  src={jobStatus.videoUrl} 
                  controls 
                  className="w-full max-w-md mx-auto rounded-lg shadow-lg"
                  poster={imagePreview || undefined}
                />
                
                {/* Video URL for Lipsync */}
                <div className="mt-4 bg-black/20 border border-cyan-400/20 rounded-lg p-4">
                  <label className="text-cyan-200 font-semibold text-sm block mb-2">
                    Video URL (for lipsync testing):
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={jobStatus.videoUrl}
                      readOnly
                      className="flex-1 bg-black/50 border border-cyan-400/30 text-cyan-100 text-xs rounded p-2 font-mono"
                    />
                    <button
                      onClick={() => {
                        if (jobStatus.videoUrl) {
                          navigator.clipboard.writeText(jobStatus.videoUrl);
                          // You could add a toast here
                          alert('Video URL copied to clipboard!');
                        }
                      }}
                      className="bg-cyan-600 hover:bg-cyan-700 text-white px-3 py-2 rounded text-xs font-semibold transition-colors"
                    >
                      📋 Copy
                    </button>
                  </div>
                  <p className="text-cyan-300/70 text-xs mt-2">
                    Copy this URL to use in the lipsync test page (/test-lipsync)
                  </p>
                </div>
                
                <div className="mt-4">
                  <button
                    onClick={() => window.open(jobStatus.videoUrl, '_blank')}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                  >
                    📥 Download Video
                  </button>
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