import { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

// Configure OpenAI SDK to use OpenRouter
const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": process.env.YOUR_SITE_URL || "https://serenade-app.vercel.app",
    "X-Title": "Serenade App",
  },
});

interface SongResponse {
  lyrics: string;
  style_prompt: string;
  reasoning: string;
}

interface SongRequest {
  user_profile: string;
  match_profile: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<SongResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      lyrics: '',
      style_prompt: '',
      reasoning: ''
    });
  }

  try {
    const { user_profile, match_profile }: SongRequest = req.body;

    if (!user_profile || !match_profile) {
      return res.status(400).json({ 
        lyrics: '',
        style_prompt: '',
        reasoning: ''
      });
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(500).json({ 
        lyrics: '',
        style_prompt: '',
        reasoning: ''
      });
    }

    console.log(`Generating songing!"`);

    // Create a detailed prompt for song generation
    const songPrompt = `
    You are “LyricSmith,” a specialist in writing short-form, hook-heavy choruses for social-video platforms.

## INPUT (from the user role)  

<User>: User's profile JSON
ProfileJSON
<User>: Match's profile JSON
ProfileJSON
Match's image captions
ProfileCaptions

## SCHEMA

ProfileJSON adheres to 
{
  "basic": { "name": "", "age": 0, "gender": "", "height": "", "location": "" , "preferred_relationship_type": "",  "kind_of_dating": "", "sexual_oreintation": ""},
  "personality_humour": "",
  "interests_lifestyle": "",
  "fashion_aesthetic": "",
  "music_culture": "",
  "relationship_emotion": "",
  "visual_cues": "",
  "hooks_quotes": []
}

ProfileCaptions adheres to
[
  {
    "caption": "<sentence>",
    "notable_items": {
      "drinks":        ["<exact drink names>"],
      "foods_snacks":  ["<visible foods/snacks>"],
      "clothing":      ["<notable garments or accessories>"],
      "pets_animals":  ["<species/breed>"],
      "music_gear":    ["<instruments or DJ gear>"],
      "party_festival":["<wristbands, glowsticks, tents, etc.>"],
      "other":         ["<anything else worth noting>"]
    },
    "scene":   "<one of: indoor | outdoor | nightlife | festival | cafe | beach | unknown>",
    "emotion": "<one of: happy | relaxed | excited | neutral | sad | unknown>"
     "guess": "<sentence>",
  }
  , … (one object per photo) …
]

## YOUR TASK

Detect genuine common ground. Pick exactly 2–3 overlaps or closely-related traits. The song is primarily about the match and the not user for which we have the JSON its a nice to have if there is something in common otherwise focus on the match.

VERY IMPORTANT to mention the match's name in the first few lyrics so that they its personalised to them

Write a chorus.
• 6–8 short lines (so it sings naturally for 15–30 s at ≈100 BPM).
• Keep tight rhyme or internal assonance; no verses, no bridge, no emojis.
• Do not invent facts—reuse phrases from the profiles when helpful (e.g. “espresso martini”).

Add one production note. One sentence naming tempo, vibe/genre, and any key sonic elements (e.g., “bright synth stabs over four-on-the-floor kick”).

OUTPUT — SCHEMA VALID JSON ONLY

lyrics: line1\\nline2
style_prompt: "..."
"reasoning": "..."

{
  "lyrics": "",
  "style_prompt": "...",
  "reasoning": "..."
}

STRICTNESS RULES

If you return anything outside that JSON object (including apologies or extra keys) the call is considered invalid.

Lyrics must focus on the chosen overlaps; ignore unrelated profile details.

No emojis, no line numbers, no markdown formatting.`;
    const response = await openrouter.chat.completions.create({
      model: "anthropic/claude-3.7-sonnet",
      messages: [
        {
          role: "system",
          content: songPrompt
        },
        {
          role: "user",
          content: `
          User profile
          ${user_profile}
          `
        },
        {
          role: "user",
          content: `
          Match profile
          ${match_profile}
          `
        }
      ],
      max_tokens: 1500,
      temperature: 0.8, // Higher temperature for more creativity
      response_format: { type: "json_object" }
    });

    let generatedContent = response.choices[0].message.content;
    
    if (!generatedContent) {
      throw new Error('No content generated from OpenRouter');
    }

    generatedContent = generatedContent.replaceAll('```json', '');

    let songData;
    try {;
      songData = JSON.parse(generatedContent) as SongResponse;
    } catch (parseError) {
      console.error('Failed to parse JSON response:', generatedContent);
      throw new Error('Invalid JSON response from AI model');
    }

    // Validate the response structure
    if (!songData.lyrics && !songData.style_prompt) {
      throw new Error('Incomplete song data generated');
    }

    console.log(`Successfully generated song: "${songData.lyrics}"`);

    return res.status(200).json({
      lyrics: songData.lyrics,
      style_prompt: songData.style_prompt,
      reasoning: songData.reasoning
    });

  } catch (error) {
    console.error('Error generating song:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return res.status(500).json({
      lyrics: '',
      style_prompt: '',
      reasoning: ''
    });
  }
}
