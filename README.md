# Description

Serenade is your secret weapon for sparking instant chemistry. Match with someone on Hinge, Tinder, or any app—snap a screenshot of their profile, drop it into Serenade, and we’ll craft a brand-new love song all about the two of you. We deliver a polished video link you can share—no awkward icebreakers required. Just your story, set to music.

# Style Overview

1. Brand Essence
Vibe: A neon-tinged time capsule of the ’80s—think laser grids, sunset gradients, and back-lit palm silhouettes—blended with the warmth of old-school romance.

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
Headline: Retro-serif display (e.g. “Outrun Future” or “ITC Kabel”), oversized, tight tracking, white or pastel pink.

Body & Buttons: Clean sans-serif (e.g. “Roboto” or “Helvetica Neue”), semi-bold for CTAs, regular for copy.

Effects:

Subtle glow: white text with very soft magenta outer shadow (0px 0px 8px)

Animated letter spacing: on hover, +1px tracking for playful pulse

4. Voice & Tone
Warmly flirtatious: “Your chill new way to break the ice”

Playfully daring: “Let’s get loud, get silly, get in sync”

Nostalgic optimism: “Old-school romance, reimagined in neon”

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

- **Tech Stack**: Next.js, React, Tailwind CSS, shadcn/ui, Zustand + sessionStorage
- **State Management**: Zustand store with `persist` middleware syncing to `sessionStorage`
- **Key Data**:
  - `profile`: user-entered profile fields
  - `screenshot`: blob of user’s match screenshot
  - `jobId`: UUID returned by `/api/create-job`
- **Pages & Components**:
  - `pages/index.js` – Profile form & screenshot uploader
  - `pages/result.js` – Status polling & share link display
  - Shared UI: `<Form>`, `<FileUploader>`, `<ProgressBar>`, `<Button>`
- **API Interaction**:
  1. `POST /api/create-job` – Send `{ profile, image: { data, mime_type } }`, receive `{ jobId }`
  2. Poll `GET /api/job-status?jobId=...` – Receive `{ status, shareUrl? }`

---

## 2. Background Processing (Vercel Background Functions)

- **File**: `pages/api/generate.background.js`
- **Responsibilities**:
  1. Decode base64 image & profile data
  2. Call specialized audio+video API (e.g. Suna)
  3. Run custom video assembly logic (FFmpeg or external API)
  4. Upload final media to S3
  5. Update Redis status store with `status: "done"` and `shareUrl`
- **Runtime Settings**:
  - Max execution: 15 minutes
  - Node.js runtime, allocated memory/CPU as needed

---

## 3. Status & Session Store (Upstash Redis)

- **Service**: Upstash Redis (serverless)
- **Env Vars**:
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`
- **Key Schema**:
  - `job:<jobId>` → JSON `{ status, shareUrl }` with TTL (e.g. 24h)
- **Usage**:
  - **`/api/create-job`**: `SET job:<jobId> "{ status: 'pending' }" EX 86400`
  - **Background Function**: `SET job:<jobId> "{ status: 'done', shareUrl }" EX 86400`
  - **`/api/job-status`**: `GET job:<jobId>` → return parsed JSON

---

## 4. Asset Storage & Delivery (AWS S3 + CloudFront)

- **S3 Bucket**: `your-app-generated-assets`
  - Private, SSE-S3 encryption, versioning
  - Folder prefix: `videos/{jobId}.mp4`
- **CloudFront Distribution**:
  - Origin: S3 bucket (via Origin Access Identity)
  - Custom domain: `media.yourapp.com` (HTTPS via ACM)
  - Behaviors:
    - `/videos/*` → cache MP4s (TTL = 24h)
- **Upload Logic**:
  ```js
  import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
  const s3 = new S3Client({ region: "eu-west-2" });
  await s3.send(new PutObjectCommand({
    Bucket: process.env.BUCKET_NAME,
    Key: `videos/${jobId}.mp4`, Body: videoBuffer,
    ContentType: "video/mp4", ACL: "private"
  }));

* **Shareable Link**:

Generate signed URL:
    ```js
    import { GetObjectCommand } from "@aws-sdk/client-s3";
    import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
    const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket, Key }), { expiresIn: 604800 });
    ```
Exposed as `https://media.yourapp.com/videos/{jobId}.mp4?X-Amz-...`

---

## 5. API Routes Summary

* **`POST /api/create-job`**:

  1. Generate `jobId`
  2. Initialize Redis status
  3. Invoke background function (implicitly by request)
  4. Respond `202 Accepted` with `{ jobId }`

* **`GET /api/job-status`**:

  1. Read Redis key `job:<jobId>`
  2. Return `{ status, shareUrl? }` or `404` if missing

* **(Optional) `pages/v/[slug].js`**:

  * Redirect short slug to signed CloudFront URL