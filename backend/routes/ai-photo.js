/**
 * backend/routes/ai-photo.js — AI Photo Intelligence API
 * ─────────────────────────────────────────────────────────
 * POST /api/ai-photo/analyze          Analyze photo with Gemini Vision
 * POST /api/ai-photo/generate         Generate AI travel image via Gemini Imagen
 * POST /api/ai-photo/social-captions  Generate platform-specific social captions
 */

'use strict';

const express = require('express');
const multer  = require('multer');
const router  = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const db      = require('../db/database');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') throw new Error('Gemini API key not configured.');
  return new GoogleGenerativeAI(apiKey);
}

// Auth: req.user?.uid available if verifyToken was applied upstream.

// ─────────────────────────────────────────────────────────────────────
// POST /api/ai-photo/analyze
// Body: multipart with field "photo" (file) OR JSON { photoUrl }
// Returns: { mood, suggestedFilter, captions, hashtags, enhancement }
// ─────────────────────────────────────────────────────────────────────
router.post('/analyze', upload.single('photo'), async (req, res) => {
  try {
    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    let imagePart;

    if (req.file) {
      // Photo uploaded as multipart
      imagePart = {
        inlineData: {
          data:     req.file.buffer.toString('base64'),
          mimeType: req.file.mimetype,
        },
      };
    } else if (req.body.photoUrl) {
      // Photo provided as URL — fetch it
      const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
      const response = await fetch(req.body.photoUrl);
      if (!response.ok) throw new Error('Could not fetch photo from URL');
      const buffer = Buffer.from(await response.arrayBuffer());
      imagePart = {
        inlineData: {
          data:     buffer.toString('base64'),
          mimeType: response.headers.get('content-type') || 'image/jpeg',
        },
      };
    } else {
      return res.status(400).json({ error: 'Provide a photo file or photoUrl.' });
    }

    const { destination = '', mood = '', narrative = '' } = req.body;

    const prompt = `You are a professional travel photographer and social media expert.
Analyze this travel photograph and respond ONLY with a JSON object (no markdown, no code blocks).

Context: ${destination ? `Destination: ${destination}.` : ''} ${mood ? `Trip mood: ${mood}.` : ''} ${narrative ? `Narrative excerpt: "${narrative.slice(0, 200)}"` : ''}

Return this exact JSON structure:
{
  "mood": "one word describing the photo's emotional mood (e.g. Serene, Adventurous, Dramatic, Golden, Misty)",
  "scene": "one sentence describing what is in the photo",
  "suggestedFilter": "one of: none | vivid | warm | cool | bw | vintage | dramatic | fade | golden | matte",
  "brightness": 100,
  "contrast": 100,
  "saturation": 100,
  "captions": {
    "instagram": "Instagram caption (max 150 chars, emojis, no hashtags here)",
    "twitter": "Twitter/X post (max 240 chars, punchy, engaging)",
    "linkedin": "Professional LinkedIn caption (max 200 chars, storytelling tone)",
    "whatsapp": "WhatsApp status (max 100 chars, casual, friendly)"
  },
  "hashtags": ["travel", "roadtrip", "manivtha", "wanderlust", "adventure"],
  "enhancement": "one sentence tip on how to further improve this photo"
}

brightness/contrast/saturation should be integers between 70-150 (100 = no change).
suggestedFilter must be exactly one of the listed options.`;

    const result = await model.generateContent([prompt, imagePart]);
    const raw    = result.response.text().trim();

    let parsed;
    try {
      const clean = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
      parsed = JSON.parse(clean);
    } catch (e) {
      console.error('[ai-photo/analyze] JSON parse error:', e.message, '\nRaw:', raw.slice(0, 300));
      return res.status(500).json({ error: 'AI response could not be parsed.', raw: raw.slice(0, 500) });
    }

    console.log(`[ai-photo/analyze] mood=${parsed.mood}, filter=${parsed.suggestedFilter}`);
    return res.json(parsed);

  } catch (err) {
    console.error('[ai-photo/analyze] Error:', err.message);
    return res.status(500).json({ error: err.message || 'Analysis failed.' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// POST /api/ai-photo/generate
// Body JSON: { prompt, destination, mood, style, narrativeId, userId }
// Returns: { imageUrl, photoId, prompt }  (image stored in Turso trip_photos table)
// ─────────────────────────────────────────────────────────────────────
router.post('/generate', async (req, res) => {
  try {
    const { prompt: userPrompt, destination, mood, style, narrativeId } = req.body;
    const userId = await extractUserId(req);

    if (!destination && !userPrompt) {
      return res.status(400).json({ error: 'Provide destination or prompt.' });
    }

    const genAI = getGenAI();

    // Build a vivid image generation prompt
    const imagePrompt = userPrompt ||
      `A stunning, high-quality travel photograph of ${destination}. ` +
      `${mood ? `Mood: ${mood}. ` : ''}` +
      `${style ? `Style: ${style}. ` : ''}` +
      `Golden hour lighting, vibrant colors, professional travel photography, 8K quality, ` +
      `cinematic composition, sharp focus, no text or watermarks.`;

    console.log(`[ai-photo/generate] Generating image for: "${imagePrompt.slice(0, 80)}..."`);

    // Use Gemini image generation model
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-preview-image-generation',
    });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: imagePrompt }] }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });

    // Extract the image from the response
    const parts = result.response.candidates?.[0]?.content?.parts || [];
    let imageBase64 = null;
    let mimeType    = 'image/png';

    for (const part of parts) {
      if (part.inlineData) {
        imageBase64 = part.inlineData.data;
        mimeType    = part.inlineData.mimeType || 'image/png';
        break;
      }
    }

    if (!imageBase64) {
      console.error('[ai-photo/generate] No image in response. Parts:', JSON.stringify(parts).slice(0, 300));
      return res.status(500).json({ error: 'AI did not return an image. Try a different prompt.' });
    }

    // Save to Turso trip_photos table
    const photoId = await db.insertPhoto({
      narrativeId: narrativeId ? Number(narrativeId) : null,
      userId:      userId || null,
      filename:    `ai-generated-${Date.now()}.png`,
      mimeType,
      data:        imageBase64,
      size:        Math.round(imageBase64.length * 0.75), // approx bytes from base64
    });

    console.log(`[ai-photo/generate] Image generated and saved. photoId=${photoId}`);

    return res.json({
      photoId,
      imageUrl:   `/api/photos/single/${photoId}`,
      dataUrl:    `data:${mimeType};base64,${imageBase64}`,
      prompt:     imagePrompt,
      mimeType,
    });

  } catch (err) {
    console.error('[ai-photo/generate] Error:', err.message);
    // Fallback error with more detail
    if (err.message?.includes('not found') || err.message?.includes('model')) {
      return res.status(503).json({ error: 'Image generation model not available. Try again or use a different prompt.', detail: err.message });
    }
    return res.status(500).json({ error: err.message || 'Image generation failed.' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// POST /api/ai-photo/social-captions
// Body JSON: { narrativeText, destination, mood, title, driverName, landmarks, highlights }
// Returns: { captions: {instagram,twitter,linkedin,whatsapp}, hashtags[], postIdeas[] }
// ─────────────────────────────────────────────────────────────────────
router.post('/social-captions', async (req, res) => {
  try {
    const { narrativeText, destination, mood, title, driverName, landmarks, highlights } = req.body;

    if (!narrativeText && !destination) {
      return res.status(400).json({ error: 'Provide narrativeText or destination.' });
    }

    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.9, responseMimeType: 'application/json' },
    });

    const contextSnippet = narrativeText ? narrativeText.slice(0, 600) : '';

    const prompt = `You are a viral travel content creator and social media strategist for Manivtha Tours & Travels.

Trip Details:
- Title: ${title || 'Trip to ' + destination}
- Destination: ${destination || 'Unknown'}
- Driver/Guide: ${driverName || 'Manivtha team'}
- Mood: ${mood || 'Adventurous'}
- Landmarks: ${landmarks || 'Various scenic spots'}
- Highlights: ${highlights || 'Amazing scenery and experiences'}
- Narrative excerpt: "${contextSnippet}"

Generate social media content. Return ONLY a JSON object:
{
  "captions": {
    "instagram": "Engaging Instagram caption (100-150 chars, emojis, emotional hook, no hashtags)",
    "twitter": "Punchy Twitter/X post (under 240 chars, wit or insight, one emoji max)",
    "linkedin": "Professional LinkedIn post opening (150-200 chars, storytelling, inspiring)",
    "whatsapp": "Casual WhatsApp status or story caption (60-90 chars, emoji, friendly)"
  },
  "hashtags": ["travel", "manivtha", "roadtrip", "india", "adventure", "wanderlust", "explore", "travelgram", "tripdiaries", "instatravel"],
  "postIdeas": [
    "Short reel idea or story concept #1",
    "Short reel idea or story concept #2",
    "Short reel idea or story concept #3"
  ],
  "bestTime": "Best time to post for maximum engagement (e.g. 'Friday 6-8 PM IST')",
  "viralHook": "A one-liner hook that stops the scroll"
}`;

    const result = await model.generateContent(prompt);
    const raw    = result.response.text().trim();

    let parsed;
    try {
      const clean = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
      parsed = JSON.parse(clean);
    } catch (e) {
      console.error('[ai-photo/social-captions] Parse error:', e.message);
      return res.status(500).json({ error: 'Could not parse AI captions.' });
    }

    console.log(`[ai-photo/social-captions] Generated for: "${title || destination}"`);
    return res.json(parsed);

  } catch (err) {
    console.error('[ai-photo/social-captions] Error:', err.message);
    return res.status(500).json({ error: err.message || 'Caption generation failed.' });
  }
});

module.exports = router;
