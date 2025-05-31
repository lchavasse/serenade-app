"use client"

import { useEffect, useState, useCallback } from "react"
import { useStore } from "@/lib/store"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Download, Share, RefreshCw, Heart, RotateCcw } from "lucide-react"

export default function ResultPage() {
  const { 
    songJobId, 
    songStatus, 
    songResult, 
    videoJobId, 
    videoStatus, 
    videoResult,
    updateSongStatus,
    updateSongResult,
    updateVideoStatus,
    updateVideoResult,
    resetMatch 
  } = useStore()
  
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [songPolling, setSongPolling] = useState(false)
  const [videoPolling, setVideoPolling] = useState(false)
  
  // Lipsync video state
  const [lipsyncJobId, setLipsyncJobId] = useState<string | null>(null)
  const [lipsyncStatus, setLipsyncStatus] = useState<'idle' | 'pending' | 'processing' | 'completed' | 'error'>('idle')
  const [lipsyncResult, setLipsyncResult] = useState<{ videoUrl?: string; originalVideoUrl?: string; audioUrl?: string } | null>(null)
  const [lipsyncPolling, setLipsyncPolling] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const pollSongStatus = useCallback(async () => {
    if (songPolling) return
    
    setSongPolling(true)
    
    const poll = async () => {
      try {
        const response = await fetch(`/api/job-status?jobId=${songJobId}`)
        
        if (!response.ok) {
          throw new Error('Failed to fetch song job status')
        }

        const data = await response.json()
        
        if (data.status === 'completed') {
          updateSongStatus('completed')
          
          // Handle song result - extract relevant fields
          updateSongResult({
            audioUrl: data.audioUrl,
            lyrics: data.lyrics,
            analysis: data.analysis,
            style: data.style,
            sunoTaskId: data.sunoTaskId
          })
          setSongPolling(false)
        } else if (data.status === 'error') {
          updateSongStatus('error')
          setSongPolling(false)
        } else {
          // Still pending, poll again in 2 seconds
          setTimeout(poll, 2000)
        }
      } catch (error) {
        console.error('Song polling error:', error)
        updateSongStatus('error')
        setSongPolling(false)
      }
    }

    poll()
  }, [songJobId, songPolling, updateSongStatus, updateSongResult])

  const pollVideoStatus = useCallback(async () => {
    if (videoPolling) return
    
    setVideoPolling(true)
    
    const poll = async () => {
      try {
        const response = await fetch(`/api/job-status?jobId=${videoJobId}`)
        
        if (!response.ok) {
          throw new Error('Failed to fetch video job status')
        }

        const data = await response.json()
        
        if (data.status === 'completed') {
          updateVideoStatus('completed')
          
          // Handle video result - extract relevant fields
          updateVideoResult({
            videoUrl: data.videoUrl,
            imageUrl: data.imageUrl,
            enhancedPrompt: data.enhancedPrompt,
            falRequestId: data.falRequestId
          })
          setVideoPolling(false)
        } else if (data.status === 'error') {
          updateVideoStatus('error')
          setVideoPolling(false)
        } else {
          // Still pending, poll again in 2 seconds
          setTimeout(poll, 2000)
        }
      } catch (error) {
        console.error('Video polling error:', error)
        updateVideoStatus('error')
        setVideoPolling(false)
      }
    }

    poll()
  }, [videoJobId, videoPolling, updateVideoStatus, updateVideoResult])

  // Function to trigger lipsync generation when both song and video are ready
  const triggerLipsyncGeneration = useCallback(async () => {
    if (!songResult?.audioUrl || !videoResult?.videoUrl || lipsyncJobId) {
      return // Don't trigger if we don't have both URLs or if already triggered
    }

    try {
      console.log('🎬 Triggering lipsync generation...')
      console.log('Audio URL:', songResult.audioUrl)
      console.log('Video URL:', videoResult.videoUrl)
      
      setLipsyncStatus('pending')
      
      const response = await fetch('/api/generate-lipsync-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoUrl: videoResult.videoUrl,
          audioUrl: songResult.audioUrl
        })
      })

      if (!response.ok) {
        throw new Error(`Failed to trigger lipsync: ${response.status}`)
      }

      const { jobId } = await response.json()
      console.log('✅ Lipsync job created:', jobId)
      
      setLipsyncJobId(jobId)
      setLipsyncStatus('processing')
      
    } catch (error) {
      console.error('Error triggering lipsync:', error)
      setLipsyncStatus('error')
    }
  }, [songResult?.audioUrl, videoResult?.videoUrl, lipsyncJobId])

  // Function to poll lipsync job status
  const pollLipsyncStatus = useCallback(async () => {
    if (!lipsyncJobId || lipsyncPolling) return
    
    setLipsyncPolling(true)
    
    const poll = async () => {
      try {
        const response = await fetch(`/api/job-status?jobId=${lipsyncJobId}`)
        
        if (!response.ok) {
          throw new Error('Failed to fetch lipsync job status')
        }

        const data = await response.json()
        
        if (data.status === 'completed') {
          setLipsyncStatus('completed')
          setLipsyncResult({
            videoUrl: data.videoUrl,
            originalVideoUrl: data.originalVideoUrl,
            audioUrl: data.audioUrl
          })
          setLipsyncPolling(false)
        } else if (data.status === 'error') {
          setLipsyncStatus('error')
          setLipsyncPolling(false)
        } else {
          // Still processing, poll again in 5 seconds
          setTimeout(poll, 5000)
        }
      } catch (error) {
        console.error('Lipsync polling error:', error)
        setLipsyncStatus('error')
        setLipsyncPolling(false)
      }
    }

    poll()
  }, [lipsyncJobId, lipsyncPolling])

  useEffect(() => {
    if (!mounted) return
    
    // If we have a song job, poll for song status
    if (songJobId && songStatus === 'pending') {
      pollSongStatus()
    }
  }, [songJobId, songStatus, mounted, pollSongStatus])

  useEffect(() => {
    if (!mounted) return
    
    // If we have a video job, poll for video status
    if (videoJobId && videoStatus === 'pending') {
      pollVideoStatus()
    }
  }, [videoJobId, videoStatus, mounted, pollVideoStatus])

  useEffect(() => {
    if (!mounted) return
    
    // Only redirect if we have NO jobs at all
    if (!songJobId && !videoJobId) {
      router.push('/')
      return
    }
  }, [songJobId, videoJobId, mounted, router])

  // Auto-trigger lipsync when both song and video are completed (for video mode)
  useEffect(() => {
    if (!mounted) return
    
    // If we have both video and song jobs, and both are completed, trigger lipsync
    if (videoJobId && songJobId && 
        songStatus === 'completed' && videoStatus === 'completed' &&
        songResult?.audioUrl && videoResult?.videoUrl && 
        lipsyncStatus === 'idle') {
      console.log('🚀 Both song and video completed, triggering lipsync...')
      triggerLipsyncGeneration()
    }
  }, [mounted, videoJobId, songJobId, songStatus, videoStatus, songResult?.audioUrl, videoResult?.videoUrl, lipsyncStatus, triggerLipsyncGeneration])

  // Poll lipsync status when job is created
  useEffect(() => {
    if (!mounted) return
    
    if (lipsyncJobId && (lipsyncStatus === 'pending' || lipsyncStatus === 'processing')) {
      pollLipsyncStatus()
    }
  }, [lipsyncJobId, lipsyncStatus, mounted, pollLipsyncStatus])

  const handleDownload = async () => {
    // Prioritize final lipsync video, then regular video, then song
    const url = lipsyncResult?.videoUrl || videoResult?.videoUrl || songResult?.audioUrl
    if (!url) return

    try {
      const response = await fetch(url)
      const blob = await response.blob()
      const downloadUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      
      // Determine file extension and name based on what we're downloading
      let extension = 'mp3'
      let prefix = 'serenade-song'
      
      if (lipsyncResult?.videoUrl) {
        extension = 'mp4'
        prefix = 'serenade-lipsync-video'
      } else if (videoResult?.videoUrl) {
        extension = 'mp4'
        prefix = 'serenade-video'
      }
      
      a.download = `${prefix}-${lipsyncJobId || videoJobId || songJobId}.${extension}`
      
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(downloadUrl)
    } catch (error) {
      console.error('Download error:', error)
    }
  }

  const handleShare = async () => {
    // Prioritize final lipsync video, then regular video, then song
    const url = lipsyncResult?.videoUrl || videoResult?.videoUrl || songResult?.audioUrl
    if (!url) return

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'My Perfect Match from Serenade',
          text: 'Check out who Serenade thinks is my perfect match!',
          url: url
        })
      } catch (error) {
        console.error('Share error:', error)
        fallbackShare()
      }
    } else {
      fallbackShare()
    }
  }

  const fallbackShare = () => {
    // Prioritize final lipsync video, then regular video, then song
    const url = lipsyncResult?.videoUrl || videoResult?.videoUrl || songResult?.audioUrl
    if (url) {
      navigator.clipboard.writeText(url)
      // You could add a toast notification here
      alert('Link copied to clipboard!')
    }
  }

  const handleStartOver = () => {
    resetMatch()
    router.push('/')
  }

  if (!mounted) {
    return null // Avoid hydration mismatch
  }

  // Show loading state if we don't have a jobId yet
  if (!songJobId && !videoJobId) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center relative bg-gradient-to-b from-[#4C0575] to-[#FF1493] p-6">
        <div className="text-white text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center relative bg-gradient-to-b from-[#4C0575] to-[#FF1493] p-6">
      {/* Background textures */}
      <div
        className="absolute inset-0 opacity-30 mix-blend-overlay"
        style={{
          backgroundImage: `
            radial-gradient(circle at 25% 25%, rgba(0,0,0,0.3) 2px, transparent 2px),
            radial-gradient(circle at 75% 75%, rgba(255,255,255,0.2) 1px, transparent 1px),
            radial-gradient(circle at 45% 15%, rgba(0,0,0,0.2) 1px, transparent 1px),
            radial-gradient(circle at 15% 85%, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: "50px 50px, 30px 30px, 20px 20px, 40px 40px",
        }}
      />

      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.4'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="absolute inset-0 bg-black opacity-15" />

      {/* Content */}
      <div className="relative z-10 w-full max-w-md mt-8 space-y-6">
        {/* Header */}
        <div className="relative flex items-center justify-center">
          {/* Reset button - positioned absolute top left */}
          <button
            onClick={handleStartOver}
            className="absolute left-0 text-white hover:text-[#00FFFF] transition-colors p-2 rounded-full hover:bg-white/10"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
          
          {!(songStatus === 'pending' || videoStatus === 'pending' || lipsyncStatus === 'pending' || lipsyncStatus === 'processing') && (
          <Image
            src="/white-logo.png"
            alt="Serenade Logo"
            width={48}
            height={48}
            className="text-white drop-shadow-lg"
          />
          )}
        </div>

        {/* Status-based content */}
        {(songStatus === 'pending' || videoStatus === 'pending' || lipsyncStatus === 'pending' || lipsyncStatus === 'processing') && (
          <div className="flex flex-col items-center space-y-6">
            <div className="animate-pulse">
              <Heart className="w-16 h-16 text-[#FF1493] fill-current" />
            </div>
            <div className="text-center">
              <h2 className="text-white text-xl font-semibold mb-2">
                {lipsyncStatus === 'pending' || lipsyncStatus === 'processing' 
                  ? 'Creating Final Video'
                  : 'Creating Your Perfect Match'
                }
              </h2>
              <p className="text-white/80">
                {lipsyncStatus === 'pending' || lipsyncStatus === 'processing'
                  ? 'Combining your song and video into the perfect match...'
                  : 'Our AI is analyzing the profile and generating something special just for you...'
                }
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <RefreshCw className="w-5 h-5 text-white animate-spin" />
              <span className="text-white">
                {lipsyncStatus === 'pending' || lipsyncStatus === 'processing' 
                  ? 'Finalizing...'
                  : 'Processing...'
                }
              </span>
            </div>
            
            {/* Show progress for video mode */}
            {videoJobId && songJobId && (
              <div className="w-full max-w-xs space-y-2">
                <div className="flex justify-between text-white/70 text-sm">
                  <span>Song: {songStatus === 'completed' ? '✅' : '⏳'}</span>
                  <span>Video: {videoStatus === 'completed' ? '✅' : '⏳'}</span>
                  <span>Final: {lipsyncStatus === 'completed' ? '✅' : lipsyncStatus === 'processing' ? '⏳' : '⏸️'}</span>
                </div>
                <div className="w-full bg-white/20 rounded-full h-2">
                  <div 
                    className="bg-gradient-to-r from-[#FF1493] to-[#00FFFF] h-2 rounded-full transition-all duration-500"
                    style={{ 
                      width: `${
                        lipsyncStatus === 'completed' ? 100 :
                        lipsyncStatus === 'processing' ? 80 :
                        (songStatus === 'completed' ? 33 : 0) + (videoStatus === 'completed' ? 33 : 0)
                      }%` 
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Final Lipsync Video Result (when both song and video are combined) */}
        {lipsyncStatus === 'completed' && lipsyncResult?.videoUrl && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-white text-xl font-semibold mb-2">
                Your Perfect Match! 🎵✨🎬
              </h2>
              <p className="text-white/80 text-sm">
                serenade your crush.
              </p>
            </div>

            {/* Final Combined Video Player */}
            <div className="relative rounded-xl overflow-hidden shadow-2xl">
              <video
                src={lipsyncResult.videoUrl}
                controls
                autoPlay
                loop
                className="w-full h-auto"
                style={{ maxHeight: '400px' }}
              >
                Your browser does not support the video tag.
              </video>
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
            </div>

            {/* Action Buttons for Final Video */}
            <div className="flex space-x-3">
              <button
                onClick={handleDownload}
                className="flex-1 flex items-center justify-center space-x-2 bg-white/20 backdrop-blur-sm text-white py-3 rounded-xl border border-white/30 hover:bg-white/30 transition-all"
              >
                <Download className="w-4 h-4" />
                <span>Download Video</span>
              </button>
              
              <button
                onClick={handleShare}
                className="flex-1 flex items-center justify-center space-x-2 bg-gradient-to-r from-[#FF1493] to-[#00FFFF] text-white py-3 rounded-xl hover:shadow-lg transform hover:scale-105 transition-all"
              >
                <Share className="w-4 h-4" />
                <span>Share</span>
              </button>
            </div>

            {/* Show individual components as smaller previews
            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 space-y-3">
              <h3 className="text-white/80 text-sm font-medium">Components:</h3>
              <div className="grid grid-cols-2 gap-3">
                
                {songResult?.audioUrl && (
                  <div className="space-y-2">
                    <p className="text-white/60 text-xs">Generated Song</p>
                    <audio
                      src={songResult.audioUrl}
                      controls
                      className="w-full h-8"
                      style={{ transform: 'scale(0.8)', transformOrigin: 'left' }}
                    />
                  </div>
                )}
                
                
                {videoResult?.videoUrl && (
                  <div className="space-y-2">
                    <p className="text-white/60 text-xs">Original Video</p>
                    <video
                      src={videoResult.videoUrl}
                      muted
                      loop
                      className="w-full h-16 object-cover rounded"
                    />
                  </div>
                )}
              </div>
            </div>
            */}
          </div>
        )}

        {/* Individual Song Results (show only if no lipsync or in song-only mode) */}
        {songStatus === 'completed' && songResult?.audioUrl && !lipsyncResult?.videoUrl && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-white text-xl font-semibold mb-2">
                Your Perfect Song! 🎵
              </h2>
              <p className="text-white/80 text-sm">
                Based on AI analysis of their profile
              </p>
            </div>

            {/* Audio Player */}
            <div className="relative rounded-xl overflow-hidden shadow-2xl bg-white/10 backdrop-blur-sm p-6">
              <audio
                src={songResult.audioUrl}
                controls
                className="w-full"
              >
                Your browser does not support the audio element.
              </audio>
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-3">
              <button
                onClick={handleDownload}
                className="flex-1 flex items-center justify-center space-x-2 bg-white/20 backdrop-blur-sm text-white py-3 rounded-xl border border-white/30 hover:bg-white/30 transition-all"
              >
                <Download className="w-4 h-4" />
                <span>Download Song</span>
              </button>
              
              <button
                onClick={handleShare}
                className="flex-1 flex items-center justify-center space-x-2 bg-gradient-to-r from-[#FF1493] to-[#00FFFF] text-white py-3 rounded-xl hover:shadow-lg transform hover:scale-105 transition-all"
              >
                <Share className="w-4 h-4" />
                <span>Share</span>
              </button>
            </div>
          </div>
        )}

        {/* Video Results */}
        {videoStatus === 'completed' && videoResult?.videoUrl && !lipsyncResult?.videoUrl && (
          <div className="space-y-6 mt-6">
            <div className="text-center">
              <h2 className="text-white text-xl font-semibold mb-2">
                Your Perfect Video! 🎬
              </h2>
              <p className="text-white/80 text-sm">
                AI-generated dancing video
              </p>
            </div>

            {/* Video Player */}
            <div className="relative rounded-xl overflow-hidden shadow-2xl">
              <video
                src={videoResult.videoUrl}
                controls
                autoPlay
                muted
                loop
                className="w-full h-auto"
                style={{ maxHeight: '400px' }}
              >
                Your browser does not support the video tag.
              </video>
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
            </div>
          </div>
        )}

        {(songStatus === 'error' || videoStatus === 'error' || lipsyncStatus === 'error') && (
          <div className="flex flex-col items-center space-y-6 text-center">
            <div className="text-red-400">
              <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h2 className="text-white text-xl font-semibold mb-2">
                Something Went Wrong
              </h2>
              <p className="text-white/80 mb-4">
                We couldn&apos;t generate your content. Please try again.
              </p>
              <button
                onClick={handleStartOver}
                className="bg-gradient-to-r from-[#FF1493] to-[#00FFFF] text-white px-6 py-3 rounded-xl hover:shadow-lg transform hover:scale-105 transition-all"
              >
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
} 