"use client"

import { useEffect, useState } from "react"
import { useStore } from "@/lib/store"
import { useRouter } from "next/navigation"
import { ArrowLeft, Download, Share, RefreshCw, Heart } from "lucide-react"

export default function ResultPage() {
  const { jobId, status, imageUrl, setStatus, setImageUrl, reset } = useStore()
  const router = useRouter()
  const [polling, setPolling] = useState(false)
  const [analysis, setAnalysis] = useState<string>("")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    
    if (!jobId) {
      router.push('/')
      return
    }

    if (status === 'pending') {
      pollJobStatus()
    }
  }, [jobId, status, mounted, router])

  const pollJobStatus = async () => {
    if (polling) return
    
    setPolling(true)
    
    const poll = async () => {
      try {
        const response = await fetch(`/api/job-status?jobId=${jobId}`)
        
        if (!response.ok) {
          throw new Error('Failed to fetch job status')
        }

        const data = await response.json()
        
        if (data.status === 'done') {
          setStatus('done')
          setImageUrl(data.imageUrl)
          setAnalysis(data.analysis || "")
          setPolling(false)
        } else if (data.status === 'error') {
          setStatus('error')
          setPolling(false)
        } else {
          // Still pending, poll again in 2 seconds
          setTimeout(poll, 2000)
        }
      } catch (error) {
        console.error('Polling error:', error)
        setStatus('error')
        setPolling(false)
      }
    }

    poll()
  }

  const handleDownload = async () => {
    if (!imageUrl) return

    try {
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `serenade-match-${jobId}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Download error:', error)
    }
  }

  const handleShare = async () => {
    if (!imageUrl) return

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'My Perfect Match from Serenade',
          text: 'Check out who Serenade thinks is my perfect match!',
          url: imageUrl
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
    if (imageUrl) {
      navigator.clipboard.writeText(imageUrl)
      // You could add a toast notification here
      alert('Link copied to clipboard!')
    }
  }

  const handleStartOver = () => {
    reset()
    router.push('/')
  }

  const handleBack = () => {
    router.push('/')
  }

  if (!mounted) {
    return null // Avoid hydration mismatch
  }

  // Show loading state if we don't have a jobId yet
  if (!jobId) {
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
        <div className="flex items-center justify-between">
          <button
            onClick={handleBack}
            className="flex items-center space-x-2 text-white hover:text-[#00FFFF] transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back</span>
          </button>
          
          <h1 className="text-white text-2xl font-bold">Your Match</h1>
          
          <button
            onClick={handleStartOver}
            className="text-white hover:text-[#00FFFF] transition-colors text-sm"
          >
            Start Over
          </button>
        </div>

        {/* Status-based content */}
        {status === 'pending' && (
          <div className="flex flex-col items-center space-y-6">
            <div className="animate-pulse">
              <Heart className="w-16 h-16 text-[#FF1493] fill-current" />
            </div>
            <div className="text-center">
              <h2 className="text-white text-xl font-semibold mb-2">
                Creating Your Perfect Match
              </h2>
              <p className="text-white/80">
                Our AI is analyzing the profile and generating someone special just for you...
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <RefreshCw className="w-5 h-5 text-white animate-spin" />
              <span className="text-white">Processing...</span>
            </div>
          </div>
        )}

        {status === 'done' && imageUrl && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-white text-xl font-semibold mb-2">
                Here's Your Perfect Match! 💕
              </h2>
              <p className="text-white/80 text-sm">
                Based on AI analysis of their profile
              </p>
            </div>

            {/* Generated Image */}
            <div className="relative rounded-xl overflow-hidden shadow-2xl">
              <img
                src={imageUrl}
                alt="Your perfect match"
                className="w-full h-auto"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-3">
              <button
                onClick={handleDownload}
                className="flex-1 flex items-center justify-center space-x-2 bg-white/20 backdrop-blur-sm text-white py-3 rounded-xl border border-white/30 hover:bg-white/30 transition-all"
              >
                <Download className="w-4 h-4" />
                <span>Download</span>
              </button>
              
              <button
                onClick={handleShare}
                className="flex-1 flex items-center justify-center space-x-2 bg-gradient-to-r from-[#FF1493] to-[#00FFFF] text-white py-3 rounded-xl hover:shadow-lg transform hover:scale-105 transition-all"
              >
                <Share className="w-4 h-4" />
                <span>Share</span>
              </button>
            </div>

            {/* Analysis */}
            {analysis && (
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                <h3 className="text-white font-semibold mb-2">AI Analysis</h3>
                <p className="text-white/90 text-sm leading-relaxed">
                  {analysis}
                </p>
              </div>
            )}
          </div>
        )}

        {status === 'error' && (
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
                We couldn't generate your match. Please try again.
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