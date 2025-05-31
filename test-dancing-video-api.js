/**
 * Test script for the dancing video generation API
 * Run with: node test-dancing-video-api.js
 */

const fs = require('fs');
const path = require('path');

const API_BASE_URL = 'http://localhost:3000'; // Change to your API URL

// Function to convert image file to base64
function imageToBase64(imagePath) {
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
    return `data:${mimeType};base64,${base64Image}`;
  } catch (error) {
    console.error('Error reading image file:', error.message);
    return null;
  }
}

async function testDancingVideoAPI() {
  try {
    console.log('🎬 Testing Dancing Video Generation API...\n');

    // Try to use a local test image (you can replace this path)
    const imagePath = path.join(__dirname, 'public', 'dance-test.jpeg');
    let imageData = null;

    if (fs.existsSync(imagePath)) {
      imageData = imageToBase64(imagePath);
      console.log('📷 Using local test image');
    } else {
      console.log('⚠️  Local test image not found, using Unsplash URL instead');
    }

    // 1. Submit a dancing video generation job
    console.log('1. Submitting dancing video generation job...');
    
    const requestBody = {
      prompt: 'dancing energetically at a party with colorful lights'
    };

    // Use imageData if available, otherwise fall back to imageUrl
    if (imageData) {
      requestBody.imageData = imageData;
    } else {
      requestBody.imageUrl = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&crop=face';
    }
    
    const submitResponse = await fetch(`${API_BASE_URL}/api/generate-dancing-video`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!submitResponse.ok) {
      throw new Error(`Submit failed: ${submitResponse.status} ${submitResponse.statusText}`);
    }

    const { jobId } = await submitResponse.json();
    console.log(`✅ Job submitted successfully! Job ID: ${jobId}\n`);

    // 2. Poll for status
    console.log('2. Polling for job status...');
    
    let isComplete = false;
    let attempts = 0;
    const maxAttempts = 20; // 5 minutes max (20 * 15 seconds)

    while (!isComplete && attempts < maxAttempts) {
      attempts++;
      
      console.log(`📊 Polling attempt ${attempts}/${maxAttempts}...`);
      
      const statusResponse = await fetch(`${API_BASE_URL}/api/job-status?jobId=${jobId}`);
      
      if (!statusResponse.ok) {
        throw new Error(`Status check failed: ${statusResponse.status} ${statusResponse.statusText}`);
      }

      const status = await statusResponse.json();
      
      console.log(`Status: ${status.status}`);
      if (status.step) console.log(`Step: ${status.step}`);
      if (status.falStatus) console.log(`fal.ai Status: ${status.falStatus}`);
      if (status.enhancedPrompt) console.log(`Enhanced Prompt: ${status.enhancedPrompt.substring(0, 100)}...`);
      
      if (status.status === 'completed') {
        console.log('\n🎉 Video generation completed!');
        console.log(`📹 Video URL: ${status.videoUrl}`);
        console.log(`🤖 Enhanced Prompt: ${status.enhancedPrompt}`);
        isComplete = true;
        
      } else if (status.status === 'error') {
        console.error('\n❌ Video generation failed:');
        console.error(status.error);
        break;
        
      } else {
        console.log('⏳ Still processing... waiting 15 seconds\n');
        await new Promise(resolve => setTimeout(resolve, 15000));
      }
    }

    if (!isComplete && attempts >= maxAttempts) {
      console.log('\n⚠️ Polling timeout reached. Job may still be processing.');
      console.log(`Check status manually: ${API_BASE_URL}/api/job-status?jobId=${jobId}`);
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
}

// Helper function to add delay
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the test
testDancingVideoAPI(); 