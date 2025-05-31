#!/usr/bin/env node

/**
 * Command-line test script for lipsync video generation API
 * 
 * Usage:
 *   node test-lipsync-cli.js <video_url> [audio_url]
 *   node test-lipsync-cli.js <video_url> --default-audio
 * 
 * Examples:
 *   node test-lipsync-cli.js "https://example.com/dancing.mp4" --default-audio
 *   node test-lipsync-cli.js "https://example.com/dancing.mp4" "https://example.com/song.wav"
 */

const BASE_URL = 'http://localhost:3000';

async function submitLipsyncJob(videoUrl, audioUrl = null, useDefaultAudio = false) {
  try {
    console.log('🚀 Submitting lipsync job...');
    console.log('Video URL:', videoUrl);
    
    const requestBody = { videoUrl };
    
    if (useDefaultAudio) {
      requestBody.useDefaultAudio = true;
      console.log('🎵 Using default audio (ella_1_cut.wav)');
    } else if (audioUrl) {
      requestBody.audioUrl = audioUrl;
      console.log('🎵 Using custom audio:', audioUrl);
    } else {
      throw new Error('Either provide an audio URL or use --default-audio flag');
    }

    const response = await fetch(`${BASE_URL}/api/generate-lipsync-video`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ Job submitted successfully!');
    console.log('Job ID:', result.jobId);
    
    return result.jobId;
    
  } catch (error) {
    console.error('❌ Error submitting job:', error.message);
    process.exit(1);
  }
}

async function pollJobStatus(jobId) {
  let attempts = 0;
  const maxAttempts = 720; // 60 minutes (720 * 5 seconds)
  
  console.log('\n📊 Polling for job completion...');
  
  while (attempts < maxAttempts) {
    try {
      attempts++;
      
      const response = await fetch(`${BASE_URL}/api/job-status?jobId=${jobId}`);
      
      if (!response.ok) {
        throw new Error(`Status check failed: ${response.status}`);
      }
      
      const status = await response.json();
      
      // Log progress
      const stepInfo = status.step ? ` (${status.step})` : '';
      const falInfo = status.falStatus ? ` [${status.falStatus}]` : '';
      console.log(`[${attempts}] Status: ${status.status}${stepInfo}${falInfo}`);
      
      if (status.status === 'completed') {
        console.log('\n🎉 Lipsync video generation completed!');
        console.log('📹 Original Video:', status.originalVideoUrl);
        console.log('🎤 Lipsync Video:', status.videoUrl);
        console.log('🎵 Audio URL:', status.audioUrl);
        
        if (status.falRequestId) {
          console.log('🔗 fal.ai Request ID:', status.falRequestId);
        }
        
        return status;
        
      } else if (status.status === 'error') {
        console.log('\n❌ Generation failed!');
        console.log('Error:', status.error);
        process.exit(1);
        
      } else {
        // Still processing, wait 5 seconds
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
    } catch (error) {
      console.error(`❌ Polling error (attempt ${attempts}):`, error.message);
      
      // Wait and retry on error
      if (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      } else {
        console.log('❌ Max polling attempts reached');
        process.exit(1);
      }
    }
  }
  
  console.log('❌ Job timed out after maximum polling attempts');
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage:');
    console.log('  node test-lipsync-cli.js <video_url> [audio_url]');
    console.log('  node test-lipsync-cli.js <video_url> --default-audio');
    console.log('');
    console.log('Examples:');
    console.log('  node test-lipsync-cli.js "https://example.com/dancing.mp4" --default-audio');
    console.log('  node test-lipsync-cli.js "https://example.com/dancing.mp4" "https://example.com/song.wav"');
    process.exit(1);
  }
  
  const videoUrl = args[0];
  const useDefaultAudio = args.includes('--default-audio');
  const audioUrl = !useDefaultAudio && args.length > 1 ? args[1] : null;
  
  if (!videoUrl) {
    console.error('❌ Video URL is required');
    process.exit(1);
  }
  
  console.log('🎬 Serenade Lipsync Video Generation Test');
  console.log('==========================================');
  
  // Submit the job
  const jobId = await submitLipsyncJob(videoUrl, audioUrl, useDefaultAudio);
  
  // Poll for completion
  const result = await pollJobStatus(jobId);
  
  console.log('\n✅ Test completed successfully!');
}

// Global fetch polyfill for Node.js
if (typeof fetch === 'undefined') {
  global.fetch = require('node-fetch');
}

main().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
}); 