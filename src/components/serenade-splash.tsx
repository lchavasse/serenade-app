"use client"

import type React from "react"
import { useState } from "react"
import { ArrowRight, Plus, Loader, X } from "lucide-react"
import { useStore } from "@/lib/store"
import { useRouter } from "next/navigation"

export default function SerenadeSplash() {
  const [photos, setPhotos] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])
  const [isUploading, setIsUploading] = useState(false)
  
  const { setScreenshot, setJobId, setStatus } = useStore()
  const router = useRouter()

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files)
      const newPreviews = newFiles.map(file => URL.createObjectURL(file))
      
      setPhotos(prev => [...prev, ...newFiles])
      setPhotoPreviews(prev => [...prev, ...newPreviews])
    }
  }

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index))
    setPhotoPreviews(prev => {
      // Clean up the URL object
      URL.revokeObjectURL(prev[index])
      return prev.filter((_, i) => i !== index)
    })
  }

  const convertFileToBlob = (file: File): Promise<Blob> => {
    return new Promise((resolve) => {
      resolve(file)
    })
  }

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => {
        const result = reader.result as string
        // Remove data:image/jpeg;base64, prefix
        const base64Data = result.split(',')[1]
        resolve(base64Data)
      }
      reader.onerror = error => reject(error)
    })
  }

  const handleSubmit = async () => {
    if (photos.length === 0) return

    setIsUploading(true)
    setStatus('pending')

    try {
      // Convert first file to blob and store in state (for backwards compatibility)
      const blob = await convertFileToBlob(photos[0])
      setScreenshot(blob)

      // Convert all photos to base64 for API
      const imagePromises = photos.map(async (photo) => ({
        data: await fileToBase64(photo),
        mime_type: photo.type
      }))
      
      const images = await Promise.all(imagePromises)

      // Submit to API
      const response = await fetch('/api/create-job', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          images: images // Send array of images instead of single image
        })
      })

      if (!response.ok) {
        throw new Error('Failed to create job')
      }

      const { jobId } = await response.json()
      setJobId(jobId)

      // Navigate to result page
      router.push('/result')

    } catch (error) {
      console.error('Upload error:', error)
      setStatus('error')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center relative bg-gradient-to-b from-[#4C0575] to-[#FF1493] p-6">
      {/* Simple but effective grain texture */}
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

      {/* Noise texture layer */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.4'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Dark overlay for depth */}
      <div className="absolute inset-0 bg-black opacity-15" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-md mt-12 space-y-6">
        {/* Dripping Heart Icon */}
        <svg
          width="48"
          height="48"
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="text-white drop-shadow-lg"
        >
          <path
            d="M24 36L12 24C8 20 8 14 12 10C16 6 22 6 26 10L24 12L22 10C18 6 12 6 8 10C4 14 4 20 8 24L20 36C21.3333 37.3333 22.6667 37.3333 24 36Z"
            fill="white"
          />
          <path
            d="M24 36C25.3333 37.3333 26.6667 37.3333 28 36L40 24C44 20 44 14 40 10C36 6 30 6 26 10L24 12L22 10"
            fill="white"
          />
          <path d="M24 36V44" stroke="white" strokeWidth="2" strokeLinecap="round" />
          <path d="M20 40V46" stroke="white" strokeWidth="2" strokeLinecap="round" />
          <path d="M28 42V48" stroke="white" strokeWidth="2" strokeLinecap="round" />
        </svg>

        {/* Serenade Heading */}
        <h1 className="text-white text-[72px] font-script text-center leading-tight tracking-wider drop-shadow-lg">
          Serenade
        </h1>

        {/* Tagline */}
        <p className="text-white/90 text-center text-lg drop-shadow-lg max-w-xs">
          Upload their profile, discover your perfect match
        </p>

        {/* Photo Upload Area */}
        <div className="w-full max-w-xs space-y-4">
          {/* Photo Grid */}
          {photoPreviews.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {photoPreviews.map((preview, index) => (
                <div key={index} className="relative aspect-square">
                  <img
                    src={preview}
                    alt={`Uploaded photo ${index + 1}`}
                    className="w-full h-full object-cover rounded-[12px] border-2 border-white/20"
                  />
                  {!isUploading && (
                    <button
                      onClick={() => removePhoto(index)}
                      className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add Photos Button */}
          <div className="relative">
            <label 
              htmlFor="photo-upload" 
              className="flex items-center justify-center w-full h-[120px] rounded-[16px] border-[3px] border-dashed border-white cursor-pointer backdrop-blur-sm hover:bg-white/10 transition-colors"
            >
              <div className="flex flex-col items-center space-y-2">
                <Plus className="text-white w-8 h-8 drop-shadow-lg" />
                <span className="text-white text-sm drop-shadow-lg">
                  {photoPreviews.length === 0 ? 'Add Photos' : `Add More (${photoPreviews.length})`}
                </span>
              </div>
              <input 
                id="photo-upload" 
                type="file" 
                accept="image/*" 
                multiple
                onChange={handlePhotoChange} 
                className="sr-only" 
                disabled={isUploading}
              />
            </label>
          </div>
        </div>

        {/* Submit Button or Status */}
        {photos.length > 0 && !isUploading && (
          <button
            onClick={handleSubmit}
            className="flex items-center justify-center space-x-2 bg-gradient-to-r from-[#FF1493] to-[#00FFFF] text-white px-8 py-3 rounded-full font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
          >
            <span>Generate Match {photos.length > 1 ? `(${photos.length} photos)` : ''}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}

        {isUploading && (
          <div className="flex items-center space-x-2 text-white">
            <Loader className="w-5 h-5 animate-spin" />
            <span>Analyzing {photos.length} photo{photos.length > 1 ? 's' : ''} and creating your perfect match...</span>
          </div>
        )}

        {/* Caption */}
        {!photos.length && (
          <div className="flex flex-col items-center space-y-4">
            <div className="flex items-center text-white text-sm drop-shadow-lg">
              <span>upload photos to get started</span>
              <ArrowRight className="ml-2 w-4 h-4" />
            </div>
            
          </div>
        )}
      </div>
    </div>
  )
}