# Description

Serenade is your secret weapon for sparking instant chemistry. Match with someone on Hinge, Tinder, or any app—snap a screenshot of their profile, drop it into Serenade, and we'll generate an image of your ideal match based on their profile. We deliver a shareable image link you can use—no awkward icebreakers required. Just AI-powered matchmaking magic.

# Style Overview

1. Brand Essence
Vibe: A neon-tinged time capsule of the '80s—think laser grids, sunset gradients, and back-lit palm silhouettes—blended with the warmth of old-school romance.

Mood: Electrifyingly passionate yet playfully carefree. Hearts pounding and feet moving.

2. Color Palette
Name	Hex	Usage
Neon Magenta	#FF1493	Primary accents, buttons, highlights
Deep Indigo	#4C0575	Background gradients, overlays
Sunset Orange	#FF7F50	Secondary accents, hover states
Pastel Pink	#FFC0CB	Subtle backgrounds, UI surfaces
Electric Cyan	#00FFFF	Call-to-action outlines, hover glows

Gradient Recipes:

Hero Background: Indigo → Magenta → Orange (diagonal, 45°) with fine noise overlay

Button Fill: Magenta → Cyan (horizontal)

3. Typography
Headline: Retro-serif display (e.g. "Outrun Future" or "ITC Kabel"), oversized, tight tracking, white or pastel pink.

Body & Buttons: Clean sans-serif (e.g. "Roboto" or "Helvetica Neue"), semi-bold for CTAs, regular for copy.

Effects:

Subtle glow: white text with very soft magenta outer shadow (0px 0px 8px)

Animated letter spacing: on hover, +1px tracking for playful pulse

4. Voice & Tone
Warmly flirtatious: "Your chill new way to break the ice"

Playfully daring: "Let's get loud, get silly, get in sync"

Nostalgic optimism: "Old-school romance, reimagined in neon"

Brevity rules: short, evocative lines—no multi-clause sentences

5. Imagery & Iconography
Illustrations:

Flat-style silhouettes of couples dancing / holding hands, rendered in duotone (magenta/cyan).

Vaporwave geometric shapes (grids, triangles) layered behind romantic icons (hearts, vinyl records).

Icons: Line-art with neon glow on hover; rounded corners to feel soft and approachable.

6. UI Components
Buttons:

Pill-shaped, gradient fill, slight 3D inset on press, neon glow on focus.

Inputs & Cards:

Semi-transparent pastel backgrounds with 60% opacity, 2px neon-cyan border, soft inner shadow.

Animations:

On-load: elements slide up + fade in with 300 ms ease-out.

Hover: scale to 1.05 + glow flicker (subtle 0.2s loop).

Transitions: use cubic-bezier(0.25, 0.1, 0.25, 1) for all transforms.

# Architecture Overview

## 1. Client Layer (Next.js + React)

- **Tech Stack**: Next.js (App Router), React, Tailwind CSS, shadcn/ui, Zustand + sessionStorage
- **State Management**: Zustand store with `persist` middleware syncing to `sessionStorage`
- **Key Data**:
  - `screenshot`: blob of user's match screenshot
  - `jobId`: UUID returned by `/api/create-job`
- **Pages & Components**:
  - `src/app/page.tsx` – Screenshot uploader and main interface
  - `src/app/result/page.tsx` – Status polling & shareable image display
  - Shared UI: `<FileUploader>`, `<ProgressBar>`, `<Button>`
- **API Interaction**:
  1. `POST /api/create-job` – Send `{ image: { data, mime_type } }`, receive `{ jobId }`
  2. Poll `GET /api/job-status?jobId=...` – Receive `{ status, imageUrl? }`

---

## 2. Background Processing (Vercel Background Functions)

- **File**: `src/pages/api/generate.background.ts`
- **Responsibilities**:
  1. Receive job data from create-job endpoint
  2. Call OpenRouter API to analyze dating profile screenshot
  3. Call OpenAI DALL-E API to generate ideal match image
  4. Upload generated image to S3
  5. Update Redis status store with `status: "done"` and `imageUrl`
- **Runtime Settings**:
  - Runtime: nodejs18.x
  - Max execution: 15 minutes (900 seconds)
  - Responds immediately to avoid timeout, processes in background
- **AI Integration**:
  - OpenRouter (Claude 3.5 Sonnet): Analyze uploaded dating profile screenshot with vision capabilities
  - OpenAI DALL-E 3: Generate image of ideal match based on analysis

---

## 3. Status & Session Store (Upstash Redis)

- **Service**: Upstash Redis (serverless)
- **Env Vars**:
  - `UPSTASH_REDIS_REST_URL` (must start with https://)
  - `UPSTASH_REDIS_REST_TOKEN`
- **Key Schema**:
  - `job:<jobId>` → JSON `{ status, imageUrl, analysis }` with TTL (e.g. 24h)
- **Usage**:
  - **`/api/create-job`**: `SET job:<jobId> "{ status: 'pending' }" EX 86400`
  - **Background Function**: `SET job:<jobId> "{ status: 'done', imageUrl, analysis }" EX 86400`
  - **`/api/job-status`**: `GET job:<jobId>` → return parsed JSON

---

## 4. Asset Storage & Delivery (AWS S3)

- **S3 Bucket**: `your-s3-bucket-name`
  - Private bucket with proper IAM permissions
  - Folder prefix: `images/{jobId}.png`
- **Upload Logic**:
  ```typescript
  import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
  const s3Client = new S3Client({ region: "us-east-1" });
  await s3Client.send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: `images/${jobId}.png`, 
    Body: imageBuffer,
    ContentType: "image/png"
  }));
  ```

- **Shareable Link**:
  Generate signed URL:
  ```typescript
  import { GetObjectCommand, getSignedUrl } from "@aws-sdk/client-s3";
  const signedUrl = await getSignedUrl(s3Client, 
    new GetObjectCommand({ Bucket, Key }), 
    { expiresIn: 604800 } // 7 days
  );
  ```

---

## 5. API Routes Summary

* **`POST /api/create-job`**:
  1. Generate `jobId`
  2. Initialize Redis status
  3. Invoke background function via HTTP request
  4. Respond `202 Accepted` with `{ jobId }`

* **`POST /api/generate.background`**:
  1. Receive `{ jobId, image }` from create-job
  2. Process with OpenAI Vision → DALL-E → S3 → Redis
  3. Respond immediately, process in background
  4. Update Redis with final status and image URL

* **`POST /api/generate-dancing-video`**:
  1. Generate `jobId` for dancing video generation
  2. Initialize Redis status with type: 'dancing-video'
  3. Invoke background processing
  4. Respond `202 Accepted` with `{ jobId }`

* **`POST /api/generate-dancing-video.background`**:
  1. Receive `{ jobId, imageUrl, prompt }` from generate-dancing-video
  2. Process with OpenAI GPT-4o to enhance prompt → fal.ai Kling video generation
  3. Poll fal.ai every 15 seconds for completion
  4. Update Redis with video URL when complete

* **`GET /api/job-status`**:
  1. Read Redis key `job:<jobId>`
  2. Return `{ status, imageUrl?, analysis?, videoUrl?, type? }` or `404` if missing
  3. Works for both image generation and dancing video jobs

---

## Dancing Video Generation API

The dancing video generation API creates AI-generated dancing videos from profile images.

### Usage Example

```javascript
// 1. Submit video generation job
const response = await fetch('/api/generate-dancing-video', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    imageUrl: 'https://example.com/profile-image.jpg',
    prompt: 'dancing energetically at a party'
  })
});

const { jobId } = await response.json();

// 2. Poll for status every 15 seconds
const pollStatus = async () => {
  const statusResponse = await fetch(`/api/job-status?jobId=${jobId}`);
  const status = await statusResponse.json();
  
  if (status.status === 'completed') {
    console.log('Video ready:', status.videoUrl);
    return status.videoUrl;
  } else if (status.status === 'error') {
    console.error('Error:', status.error);
    return null;
  } else {
    console.log('Processing...', status.step, status.falStatus);
    setTimeout(pollStatus, 15000); // Poll again in 15 seconds
  }
};

pollStatus();
```

### Job Status Types

For dancing video jobs, the status object includes:

- **`type`**: 'dancing-video'
- **`status`**: 'pending' | 'processing' | 'completed' | 'error'
- **`step`**: Current processing step:
  - 'enhancing-prompt': GPT-4o enhancing the user prompt
  - 'submitting-video-job': Submitting to fal.ai
  - 'generating-video': Video generation in progress
- **`falStatus`**: Current fal.ai status ('IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED')
- **`enhancedPrompt`**: The GPT-4o enhanced prompt used for video generation
- **`videoUrl`**: Final video URL (when completed)
- **`falRequestId`**: fal.ai request ID for tracking

---

## Quick Start

### 1. Environment Setup

In your Upstash Console, click "REST API" to get your credentials:
- **UPSTASH_REDIS_REST_URL**: The REST URL (starts with `https://`)
- **UPSTASH_REDIS_REST_TOKEN**: The REST token

Create `.env.local`:
```bash
# OpenRouter Configuration
OPENROUTER_API_KEY=sk-or-your-openrouter-api-key-here

# OpenAI Configuration (for DALL-E image generation)
OPENAI_API_KEY=your_openai_api_key_here

# fal.ai Configuration (for video generation)
FAL_KEY=your_fal_api_key_here

# Upstash Redis Configuration (REST API)
UPSTASH_REDIS_REST_URL=https://your-redis-id.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_rest_token_here

# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your_aws_access_key_here
AWS_SECRET_ACCESS_KEY=your_aws_secret_key_here
AWS_REGION=us-east-1
S3_BUCKET_NAME=your_s3_bucket_name_here

# Optional: Your site URL for OpenRouter headers
YOUR_SITE_URL=https://your-site.com
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Run Development Server
```bash
npm run dev
```

### 4. Test the Flow
1. Open http://localhost:3000
2. Upload a screenshot of a dating profile
3. Click "Generate Match"
4. Wait for the AI to analyze and generate the ideal match image
5. Download or share the result!

### 5. Key Features Implemented
- ✅ Image upload with preview
- ✅ OpenRouter API integration for profile analysis with vision capabilities
- ✅ OpenAI DALL-E 3 integration for match image generation
- ✅ S3 upload and signed URL generation
- ✅ Redis-based job status tracking with Upstash REST API
- ✅ Vercel Background Functions for long-running tasks
- ✅ Real-time polling for job completion
- ✅ Beautiful 80s-inspired UI with neon gradients
- ✅ Download and share functionality
- ✅ TypeScript implementation throughout
- ✅ Proper error handling and status tracking