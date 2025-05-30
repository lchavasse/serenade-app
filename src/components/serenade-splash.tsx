"use client"

import type React from "react"
import { useState } from "react"
import { ArrowRight, Plus } from "lucide-react"

export default function SerenadeSplash() {
  const [name, setName] = useState("")
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      setPhoto(file)
      setPhotoPreview(URL.createObjectURL(file))
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

        {/* Name Input */}
        <input
          type="text"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full max-w-[90%] bg-white bg-opacity-20 text-white placeholder-white rounded-[12px] px-4 py-3 border border-white border-opacity-30 focus:outline-none focus:ring-2 focus:ring-white focus:ring-opacity-50 backdrop-blur-sm"
        />

        {/* Photo Upload Area */}
        <div className="relative w-[200px] h-[200px] rounded-[16px] border-[3px] border-dashed border-white flex items-center justify-center backdrop-blur-sm">
          {photoPreview ? (
            <img
              src={photoPreview || "/placeholder.svg"}
              alt="Uploaded preview"
              className="w-full h-full object-cover rounded-[14px]"
            />
          ) : (
            <label htmlFor="photo-upload" className="cursor-pointer w-full h-full flex items-center justify-center">
              <Plus className="text-white w-12 h-12 drop-shadow-lg" />
              <input id="photo-upload" type="file" accept="image/*" onChange={handlePhotoChange} className="sr-only" />
            </label>
          )}
        </div>

        {/* Caption */}
        <div className="flex items-center text-white text-sm drop-shadow-lg">
          <span>upload photo to get started</span>
          <ArrowRight className="ml-2 w-4 h-4" />
        </div>
      </div>
    </div>
  )
}