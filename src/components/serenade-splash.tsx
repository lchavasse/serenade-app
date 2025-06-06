"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { ArrowRight, Plus, Loader, X, User, Camera, Settings } from "lucide-react"
import { useStore } from "@/lib/store"
import { useRouter } from "next/navigation"
import Image from "next/image"

export default function SerenadeSplash() {
  // Hydration state
  const [mounted, setMounted] = useState(false)
  
  // Get user profile from store
  const { 
    userProfile, 
    profileComplete, 
    setUserProfile, 
    setProfileComplete,
    setScreenshot, 
    setSongJob,
    setVideoJob,
    updateSongStatus,
    updateVideoStatus
  } = useStore()
  
  const [isAnalyzingPassions, setIsAnalyzingPassions] = useState(false)

  // Match photos state (existing functionality)
  const [matchPhotos, setMatchPhotos] = useState<File[]>([])
  const [matchPhotoPreviews, setMatchPhotoPreviews] = useState<string[]>([])
  const [isUploading, setIsUploading] = useState(false)

  // Settings state
  const [ratingLevel, setRatingLevel] = useState(2)
  const [outputType, setOutputType] = useState<'song' | 'video'>('song')
  
  const router = useRouter()

  // Handle hydration
  useEffect(() => {
    setMounted(true)
    
    // Manual rehydration since we use skipHydration: true
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('serenade-app-session')
      if (stored) {
        try {
          const parsedState = JSON.parse(stored)
          const storeState = parsedState?.state
          
          if (storeState) {
            // Rehydrate user profile
            if (storeState.userProfile) {
              setUserProfile(storeState.userProfile)
            }
            if (storeState.profileComplete !== undefined) {
              setProfileComplete(storeState.profileComplete)
            }
          }
        } catch (error) {
          console.error('Failed to rehydrate store:', error)
        }
      }
    }
  }, [setUserProfile, setProfileComplete])

  // Helper function to recreate Blob from preview URL
  const recreateBlobFromPreview = async (previewUrl: string): Promise<Blob> => {
    try {
      const response = await fetch(previewUrl)
      const blob = await response.blob()
      return blob
    } catch (error) {
      console.error('Failed to recreate blob from preview:', error)
      throw new Error('Failed to recreate photo from preview')
    }
  }

  // Check if we need to recreate photoBlob from photoPreview after hydration
  useEffect(() => {
    const recreatePhotoBlob = async () => {
      if (mounted && userProfile.photoPreview && !userProfile.photoBlob) {
        console.log('Recreating photoBlob from photoPreview after session restoration...')
        try {
          const recreatedBlob = await recreateBlobFromPreview(userProfile.photoPreview)
          setUserProfile({
            ...userProfile,
            photoBlob: recreatedBlob
          })
          console.log('Successfully recreated photoBlob from preview URL')
        } catch (error) {
          console.error('Failed to recreate photoBlob:', error)
          // If we can't recreate the blob, clear the preview and ask user to re-upload
          setUserProfile({
            ...userProfile,
            photoPreview: null,
            passions: ""
          })
          // Reset profile completion since photo is no longer valid
          setProfileComplete(false)
        }
      }
    }

    recreatePhotoBlob()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, userProfile.photoPreview, userProfile.photoBlob])

  // Don't render until mounted to avoid hydration mismatch
  if (!mounted) {
    return null
  }

  // Rating labels
  const getRatingLabel = (value: number) => {
    const labels = {
      1: "Charming",
      2: "Sweet", 
      3: "Playful",
      4: "Flirty",
      5: "Romantic",
      6: "Passionate",
      7: "Sultry",
      8: "Steamy",
      9: "Spicy",
      10: "Kinky"
    }
    return labels[value as keyof typeof labels] || "Romantic"
  }

  // User profile handlers
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUserProfile({ ...userProfile, name: e.target.value })
  }

  const handlePassionsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setUserProfile({ ...userProfile, passions: e.target.value })
  }

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => {
        const result = reader.result as string
        const base64Data = result.split(',')[1]
        resolve(base64Data)
      }
      reader.onerror = error => reject(error)
    })
  }

  const compressImage = (file: File, maxWidth = 1024, maxHeight = 1024, quality = 0.8): Promise<File> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(file) // Fallback to original if canvas context is not available
        return
      }
      
      const img = document.createElement('img')
      
      img.onload = () => {
        // Calculate new dimensions while maintaining aspect ratio
        let { width, height } = img
        
        if (width > height) {
          if (width > maxWidth) {
            height = (height * maxWidth) / width
            width = maxWidth
          }
        } else {
          if (height > maxHeight) {
            width = (width * maxHeight) / height
            height = maxHeight
          }
        }
        
        canvas.width = width
        canvas.height = height
        
        // Draw and compress
        ctx.drawImage(img, 0, 0, width, height)
        
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now()
              })
              resolve(compressedFile)
            } else {
              resolve(file) // Fallback to original if compression fails
            }
          },
          'image/jpeg',
          quality
        )
      }
      
      img.onerror = () => resolve(file) // Fallback to original if loading fails
      img.src = URL.createObjectURL(file)
    })
  }

  const handleUserPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      const preview = URL.createObjectURL(file)
      
      setUserProfile({ 
        ...userProfile, 
        photoBlob: file, 
        photoPreview: preview 
      })

      // Auto-analyze passions
      setIsAnalyzingPassions(true)
      try {
        const base64Data = await fileToBase64(file)
        
        const response = await fetch('/api/analyze-passions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            image: {
              data: base64Data,
              mime_type: file.type
            }
          })
        })

        if (response.ok) {
          const { passions } = await response.json()
          setUserProfile({ ...userProfile, photoBlob: file, photoPreview: preview, passions })
        }
      } catch (error) {
        console.error('Error analyzing passions:', error)
      } finally {
        setIsAnalyzingPassions(false)
      }
    }
  }

  const handleRemoveUserPhoto = () => {
    if (userProfile.photoPreview) {
      URL.revokeObjectURL(userProfile.photoPreview)
    }
    setUserProfile({ 
      ...userProfile, 
      photoBlob: null, 
      photoPreview: null, 
      passions: "" 
    })
  }

  const handleCompleteProfile = () => {
    // Allow completion if we have name, passions, and either photoBlob OR photoPreview
    // photoPreview without photoBlob can happen during session restoration
    if (userProfile.name && (userProfile.photoBlob || userProfile.photoPreview) && userProfile.passions) {
      setProfileComplete(true)
    }
  }

  // Match photos handlers (existing functionality)
  const handleMatchPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files)
      const newPreviews = newFiles.map(file => URL.createObjectURL(file))
      
      setMatchPhotos(prev => [...prev, ...newFiles])
      setMatchPhotoPreviews(prev => [...prev, ...newPreviews])
    }
  }

  const removeMatchPhoto = (index: number) => {
    setMatchPhotos(prev => prev.filter((_, i) => i !== index))
    setMatchPhotoPreviews(prev => {
      URL.revokeObjectURL(prev[index])
      return prev.filter((_, i) => i !== index)
    })
  }

  const convertFileToBlob = (file: File): Promise<Blob> => {
    return new Promise((resolve) => {
      resolve(file)
    })
  }

  const handleSubmit = async () => {
    if (matchPhotos.length === 0) return

    setIsUploading(true)

    try {
      // Convert first file to blob and store in state (for backwards compatibility)
      const blob = await convertFileToBlob(matchPhotos[0])
      setScreenshot(blob)

      // Compress and convert match photos to base64 for song analysis
      console.log('Compressing match photos for optimal payload size...')
      const compressedMatchPhotos = await Promise.all(
        matchPhotos.map(photo => compressImage(photo, 1024, 1024, 0.8))
      )
      
      const matchImagePromises = compressedMatchPhotos.map(async (photo) => ({
        data: await fileToBase64(photo),
        mime_type: photo.type
      }))
      const matchImages = await Promise.all(matchImagePromises)

      console.log('Payload size optimization:', {
        originalPhotosCount: matchPhotos.length,
        compressedPhotosCount: compressedMatchPhotos.length,
        estimatedPayloadSizeMB: Math.round(
          matchImages.reduce((total, img) => total + (img.data.length * 0.75 / 1024 / 1024), 0) * 100
        ) / 100
      })

      // Create jobs based on output type selection
      if (outputType === 'song') {
        // Create song job only - use match photos
        updateSongStatus('pending')
        
        const response = await fetch('/api/create-job', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            images: matchImages, // Match photos for song analysis
            user_profile: {
              name: userProfile.name,
              passions: userProfile.passions,
            },
            how_flirt: getRatingLabel(ratingLevel),
            generationType: 'song'
          })
        })
        
        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Failed to create song job: ${response.status} ${errorText}`)
        }

        const result = await response.json()
        
        if (result.songJobId && result.type === 'song') {
          setSongJob(result.songJobId, 'pending')
        } else {
          throw new Error('Invalid song job response')
        }
        
      } else if (outputType === 'video') {
        // Create both song and video jobs
        updateSongStatus('pending')
        updateVideoStatus('pending')
        
        // Convert user profile photo to base64 for video generation
        if (!userProfile.photoBlob) {
          // Check if we have a preview URL but no blob (session restoration case)
          if (userProfile.photoPreview) {
            console.log('Photo blob missing but preview exists - attempting to recreate...')
            try {
              const recreatedBlob = await recreateBlobFromPreview(userProfile.photoPreview)
              setUserProfile({
                ...userProfile,
                photoBlob: recreatedBlob
              })
              // Use the recreated blob for processing
              userProfile.photoBlob = recreatedBlob
            } catch (error) {
              console.error('Failed to recreate blob during video generation:', error)
              throw new Error('Your profile photo needs to be re-uploaded. Please go back and upload your photo again.')
            }
          } else {
            throw new Error('User profile photo is required for video generation')
          }
        }
        
        // Additional validation for mobile compatibility
        const photoFile = userProfile.photoBlob as File
        if (!photoFile || typeof photoFile.type !== 'string') {
          throw new Error('Invalid user profile photo format')
        }
        
        console.log('Converting user photo for video generation...', {
          fileName: photoFile.name || 'unknown',
          fileType: photoFile.type,
          fileSize: photoFile.size
        })
        
        // Compress user photo to reduce payload size
        console.log('Compressing user photo for optimal payload size...')
        const compressedUserPhoto = await compressImage(photoFile, 1024, 1024, 0.8)
        
        let userImageData: string
        try {
          userImageData = await fileToBase64(compressedUserPhoto)
        } catch (error) {
          console.error('Failed to convert user photo to base64:', error)
          throw new Error('Failed to process user profile photo')
        }
        
        const userImage = {
          data: userImageData,
          mime_type: compressedUserPhoto.type
        }
        
        console.log('Making video generation API call...', {
          matchImagesCount: matchImages.length,
          userImageType: userImage.mime_type,
          totalEstimatedPayloadSizeMB: Math.round(
            (matchImages.reduce((total, img) => total + (img.data.length * 0.75 / 1024 / 1024), 0) +
             (userImage.data.length * 0.75 / 1024 / 1024)) * 100
          ) / 100
        })
        
        const response = await fetch('/api/create-job', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            matchImages: matchImages, // Match photos for song analysis
            userImage: userImage,     // User photo for video generation,
            how_flirt: getRatingLabel(ratingLevel), // When doing Video generation, we need to pass the how_flirt and user_profile for the sub-song generation
            user_profile: {
              name: userProfile.name,
              passions: userProfile.passions,
            },
            generationType: 'video'
          })
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error('Video generation API error:', { status: response.status, errorText })
          throw new Error(`Failed to create video jobs: ${response.status} ${errorText}`)
        }

        const result = await response.json()
        console.log('Video generation API response:', result)
        
        if (result.songJobId && result.videoJobId && result.type === 'video') {
          setSongJob(result.songJobId, 'pending')
          setVideoJob(result.videoJobId, 'pending')
          console.log('Video jobs created successfully, navigating to results...')
        } else {
          console.error('Invalid video job response:', result)
          throw new Error('Invalid video job response - missing songJobId or videoJobId')
        }
      }

      // Navigate to result page
      console.log('Navigating to results page...')
      router.push('/result')

    } catch (error) {
      console.error('Upload error:', error)
      console.error('Error details:', {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        outputType,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        userProfilePhotoExists: !!userProfile.photoBlob,
        userProfilePhotoType: userProfile.photoBlob ? userProfile.photoBlob.type : 'none',
        matchPhotosCount: matchPhotos.length
      })
      updateSongStatus('error')
      updateVideoStatus('error')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center relative bg-gradient-to-b from-[#4C0575] to-[#FF1493] p-6">
      {/* Background effects */}
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
      <div className="relative z-10 w-full max-w-4xl">
        {/* Header */}
        <div className="flex flex-col items-center mb-8 mt-8">
          {/* Dripping Heart Icon */}
          <Image
            src="/white-logo.png"
            alt="Serenade Logo"
            width={48}
            height={48}
            className="text-white drop-shadow-lg mb-4"
          />

          <h1 
            className="text-white text-[72px] text-center leading-tight tracking-wider drop-shadow-lg"
            style={{ fontFamily: "Ballet" }}
          >
            Serenade
          </h1>

            <p className="text-white/90 text-center text-lg drop-shadow-lg max-w-xs">
              your love story, in song.
            </p>
        </div>

        {!profileComplete ? (
          /* User Profile Creation Step */
          <div className="flex flex-col items-center space-y-6 max-w-md mx-auto">
            {/* Name Input */}
            <div className="w-full">
              <label className="block text-white text-sm font-medium mb-2 drop-shadow-lg">
                Your Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/60 w-5 h-5" />
                <input
                  type="text"
                  value={userProfile.name}
                  onChange={handleNameChange}
                  className="w-full pl-10 pr-4 py-3 bg-white/10 backdrop-blur-sm border-2 border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:border-white/50 transition-colors"
                  placeholder="Enter your name"
                />
              </div>
            </div>

            {/* Photo Upload */}
            <div className="w-full">
              <label className="block text-white text-sm font-medium mb-2 drop-shadow-lg">
                Your Photo
              </label>
              <p className="text-white/70 text-xs mb-3 drop-shadow-lg italic">
                Choose a photo of you dancing and having fun
              </p>
              
              {userProfile.photoPreview ? (
                <div className="relative w-full aspect-square max-w-[200px] mx-auto">
                  <Image
                    src={userProfile.photoPreview}
                    alt="Your photo"
                    width={200}
                    height={200}
                    className="w-full h-full object-cover rounded-xl border-2 border-white/20"
                  />
                  <button
                    onClick={handleRemoveUserPhoto}
                    className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center w-full h-[160px] rounded-xl border-2 border-dashed border-white cursor-pointer backdrop-blur-sm hover:bg-white/10 transition-colors">
                  <div className="flex flex-col items-center space-y-2">
                    <Camera className="text-white w-8 h-8 drop-shadow-lg" />
                    <span className="text-white text-sm drop-shadow-lg text-center">
                      Upload your photo
                    </span>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleUserPhotoChange}
                    className="sr-only"
                  />
                </label>
              )}
            </div>

            {/* Passions Input */}
            <div className="w-full">
              <label className="block text-white text-sm font-medium mb-2 drop-shadow-lg">
                Your Passions & Interests
              </label>
              <p className="text-white/70 text-xs mb-3 drop-shadow-lg italic">
                To entice your match.
              </p>
              
              <div className="relative">
                {isAnalyzingPassions && (
                  <div className="absolute right-3 top-3 z-10">
                    <Loader className="w-5 h-5 text-white animate-spin" />
                  </div>
                )}
                <textarea
                  value={userProfile.passions}
                  onChange={handlePassionsChange}
                  rows={3}
                  className="w-full px-4 py-3 bg-white/10 backdrop-blur-sm border-2 border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:border-white/50 transition-colors resize-none"
                  placeholder={isAnalyzingPassions ? "Analyzing your photo..." : "e.g. dancing, photography, hiking, cooking, live music"}
                  disabled={isAnalyzingPassions}
                />
              </div>
            </div>

            {/* Complete Profile Button */}
            {userProfile.name && (userProfile.photoBlob || userProfile.photoPreview) && userProfile.passions && !isAnalyzingPassions && (
              <button
                onClick={handleCompleteProfile}
                className="flex items-center justify-center space-x-2 bg-gradient-to-r from-[#FF1493] to-[#00FFFF] text-white px-8 py-3 rounded-full font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
              >
                <span>Continue to Match Upload</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          /* Profile Summary + Match Upload Step */
          <div className="flex flex-col lg:flex-row gap-8 items-start">
            {/* User Profile Summary (Left) */}
            <div className="lg:w-1/3 w-full">
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
                <h3 className="text-white font-semibold text-lg mb-4 drop-shadow-lg">Your Profile</h3>
                
                <div className="flex items-center space-x-4 mb-4">
                  {userProfile.photoPreview && (
                    <Image
                      src={userProfile.photoPreview}
                      alt="Your photo"
                      width={64}
                      height={64}
                      className="w-16 h-16 object-cover rounded-full border-2 border-white/20"
                    />
                  )}
                  <div>
                    <h4 className="text-white font-medium text-lg drop-shadow-lg">{userProfile.name}</h4>
                  </div>
                </div>
                
                <div>
                  <p className="text-white/80 text-sm mb-2 drop-shadow-lg">Passions & Interests:</p>
                  <p className="text-white text-sm drop-shadow-lg">{userProfile.passions}</p>
                </div>

                <button
                  onClick={() => setProfileComplete(false)}
                  className="mt-4 text-white/80 text-sm underline hover:text-white transition-colors"
                >
                  Edit Profile
                </button>
              </div>
            </div>

            {/* Match Photo Upload (Right) */}
            <div className="lg:w-2/3 w-full">
              <div className="space-y-6">
                <div>
                  <h3 className="text-white font-semibold text-xl mb-2 drop-shadow-lg">Upload Their Profile</h3>
                  <p className="text-white/80 text-sm drop-shadow-lg">Add photos of the person you&apos;d like to match with</p>
                </div>

                {/* Photo Grid */}
                {matchPhotoPreviews.length > 0 && (
                  <div className="grid grid-cols-2 gap-3">
                    {matchPhotoPreviews.map((preview, index) => (
                      <div key={index} className="relative aspect-square">
                        <Image
                          src={preview}
                          alt={`Match photo ${index + 1}`}
                          width={200}
                          height={200}
                          className="w-full h-full object-cover rounded-[12px] border-2 border-white/20"
                        />
                        {!isUploading && (
                          <button
                            onClick={() => removeMatchPhoto(index)}
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
                    htmlFor="match-photo-upload" 
                    className="flex items-center justify-center w-full h-[120px] rounded-[16px] border-[3px] border-dashed border-white cursor-pointer backdrop-blur-sm hover:bg-white/10 transition-colors"
                  >
                    <div className="flex flex-col items-center space-y-2">
                      <Plus className="text-white w-8 h-8 drop-shadow-lg" />
                      <span className="text-white text-sm drop-shadow-lg">
                        {matchPhotoPreviews.length === 0 ? 'Add Their Photos' : `Add More (${matchPhotoPreviews.length})`}
                      </span>
                    </div>
                    <input 
                      id="match-photo-upload" 
                      type="file" 
                      accept="image/*" 
                      multiple
                      onChange={handleMatchPhotoChange} 
                      className="sr-only" 
                      disabled={isUploading}
                    />
                  </label>
                </div>

                {/* Settings Section */}
                {matchPhotos.length > 0 && (
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20 space-y-6">
                    <div className="flex items-center space-x-2 mb-4">
                      <Settings className="text-white w-5 h-5" />
                      <h4 className="text-white font-semibold text-lg drop-shadow-lg">Generation Settings</h4>
                    </div>

                    {/* Rating Slider */}
                    <div className="space-y-3">
                      <label className="block text-white text-sm font-medium drop-shadow-lg">
                        Content Rating: {getRatingLabel(ratingLevel)} ({ratingLevel}/10)
                      </label>
                      <div className="px-2">
                        <input
                          type="range"
                          min="1"
                          max="10"
                          value={ratingLevel}
                          onChange={(e) => setRatingLevel(parseInt(e.target.value))}
                          className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
                          style={{
                            background: `linear-gradient(to right, #FF1493 0%, #FF1493 ${(ratingLevel - 1) * 11.11}%, rgba(255,255,255,0.2) ${(ratingLevel - 1) * 11.11}%, rgba(255,255,255,0.2) 100%)`
                          }}
                        />
                        <div className="flex justify-between text-xs text-white/70 mt-1">
                          <span>Charming</span>
                          <span>Kinky</span>
                        </div>
                      </div>
                    </div>

                    {/* Output Type Toggle */}
                    <div className="space-y-3">
                      <label className="block text-white text-sm font-medium drop-shadow-lg">
                        Output Type
                      </label>
                      <div className="flex items-center space-x-4">
                        <button
                          onClick={() => setOutputType('song')}
                          className={`px-4 py-2 rounded-lg font-medium transition-all ${
                            outputType === 'song'
                              ? 'bg-gradient-to-r from-[#FF1493] to-[#00FFFF] text-white'
                              : 'bg-white/20 text-white/80 hover:bg-white/30'
                          }`}
                        >
                          Song Only
                        </button>
                        <button
                          onClick={() => setOutputType('video')}
                          className={`px-4 py-2 rounded-lg font-medium transition-all ${
                            outputType === 'video'
                              ? 'bg-gradient-to-r from-[#FF1493] to-[#00FFFF] text-white'
                              : 'bg-white/20 text-white/80 hover:bg-white/30'
                          }`}
                        >
                          Video
                        </button>
                      </div>
                      {outputType === 'video' && (
                        <p className="text-white/60 text-xs italic">
                          ⚡ Video generation is experimental and may take longer
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Submit Button or Status */}
                {matchPhotos.length > 0 && !isUploading && (
                  <button
                    onClick={handleSubmit}
                    className="flex items-center justify-center space-x-2 bg-gradient-to-r from-[#FF1493] to-[#00FFFF] text-white px-8 py-3 rounded-full font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 w-full"
                  >
                    <span>Generate {outputType === 'video' ? 'Video' : 'Song'} {matchPhotos.length > 1 ? `(${matchPhotos.length} photos)` : ''}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}

                {isUploading && (
                  <div className="flex items-center space-x-2 text-white justify-center">
                    <Loader className="w-5 h-5 animate-spin" />
                    <span>Analyzing {matchPhotos.length} photo{matchPhotos.length > 1 ? 's' : ''} and creating your perfect {outputType}...</span>
                  </div>
                )}

                {/* Caption */}
                {!matchPhotos.length && (
                  <div className="flex flex-col items-center space-y-4">
                    <div className="flex items-center text-white text-sm drop-shadow-lg">
                      <span>upload their photos to get started</span>
                      <ArrowRight className="ml-2 w-4 h-4" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}