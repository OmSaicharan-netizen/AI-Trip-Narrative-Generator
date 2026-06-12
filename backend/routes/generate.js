const express = require('express');
const router  = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('../db/database');
const { buildTravelPrompt } = require('../utils/promptBuilder');

// ── Optional Firebase Admin (for token extraction) ────────────
let adminAuth = null;
try {
  const admin = require('firebase-admin');
  if (admin.apps.length) adminAuth = admin.auth();
} catch (_) {}

// ── Minimum quality thresholds ────────────────────────────────
const MIN_WORDS   = 200;   // ≥ 200 words required
const MIN_CHARS   = 3000;  // ≥ 3,000 characters required
const MAX_RETRIES = 3;     // up to 4 total attempts

// ── Helpers ───────────────────────────────────────────────────
function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Extract userId from optional Bearer token.
 * Non-blocking: returns null if token absent/invalid.
 */
async function extractUserId(req) {
  if (!adminAuth) return null;
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded.uid || null;
  } catch (e) {
    console.warn('[generate] Token verification failed (non-fatal):', e.message);
    return null;
  }
}

/**
 * Parse AI response JSON
 */
function parseResponse(raw, fallbackRoute) {
  let parsed;
  try {
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const jsonString = jsonMatch ? jsonMatch[1] : raw;
    parsed = JSON.parse(jsonString);
  } catch (e) {
    console.error('[generate] Failed to parse JSON response. Falling back to plain text extraction.', e);
    return { 
      title: `${fallbackRoute} — A Journey to Remember`, 
      summary: '',
      socialCaption: '',
      narrative: raw.trim() 
    };
  }

  const title = parsed.title || `${fallbackRoute} — A Journey to Remember`;
  let body = (parsed.narrative || '').trim();

  const esc = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  body = body
    .replace(new RegExp(`^#+\\s*${esc}\\s*$`, 'gmi'), '')
    .replace(new RegExp(`^\\*\\*${esc}\\*\\*\\s*$`, 'gmi'), '')
    .replace(new RegExp(`^${esc}\\s*$`, 'gmi'), '')
    .trim();

  body = body.replace(/^##\s+(.+)$/gm, '\n$1\n');

  return { 
    title, 
    summary: parsed.summary || '',
    socialCaption: parsed.socialCaption || '',
    narrative: body 
  };
}

function validateNarrative(text) {
  const words = wordCount(text);
  const chars = text.length;
  return { valid: words >= MIN_WORDS && chars >= MIN_CHARS, words, chars };
}

/**
 * POST /api/generate
 * Generates an AI travel narrative from trip input fields.
 * Optionally accepts Authorization: Bearer <idToken> to associate with a user.
 */
router.post('/', async (req, res) => {
  const { driverName, route, startingLocation, destination, title: requestedTitle, mood, style, tone, landmarks, highlights, tripDate, vehicleType } = req.body;

  const finalRoute = (startingLocation && destination) ? `${startingLocation} to ${destination}` : route;

  if (!driverName || !finalRoute) {
    return res.status(400).json({ error: 'driverName and route (or startingLocation/destination) are required fields.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    return res.status(503).json({ error: 'Gemini API key not configured.' });
  }

  // Extract userId non-blocking
  const userId = await extractUserId(req);
  console.log(`[generate] userId=${userId || 'anonymous'}, route="${finalRoute}", mood="${mood || tone}"`);

  const prompt = buildTravelPrompt({ driverName, route, startingLocation, destination, landmarks, highlights, tripDate, vehicleType, tone, mood, style, title: requestedTitle });

  const genAI = new GoogleGenerativeAI(apiKey);
  const model  = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { temperature: 0.9, topP: 0.95, maxOutputTokens: 8192, responseMimeType: "application/json" },
  });

  let lastError = null;
  let title = null;
  let narrative = null;
  let summary = null;
  let socialCaption = null;
  let qualityInfo = {};

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      console.log(`[generate] Attempt ${attempt}/${MAX_RETRIES + 1}`);
      const result = await model.generateContent(prompt);
      const raw    = result.response.text();
      console.log(`[generate] Raw length: ${raw.length} chars`);

      const parsed = parseResponse(raw, finalRoute);
      title     = parsed.title;
      narrative = parsed.narrative;
      summary   = parsed.summary;
      socialCaption = parsed.socialCaption;
      qualityInfo = validateNarrative(narrative);

      console.log(`[generate] Quality — words:${qualityInfo.words}, chars:${qualityInfo.chars}, valid:${qualityInfo.valid}`);

      if (qualityInfo.valid) break;

      console.warn(`[generate] Attempt ${attempt} below quality gate (words:${qualityInfo.words}/${MIN_WORDS}, chars:${qualityInfo.chars}/${MIN_CHARS}). Retrying immediately…`);
      // No sleep — retry immediately to minimise latency
    } catch (err) {
      lastError = err;
      console.error(`[generate] Attempt ${attempt} error:`, err.message);
      // Brief pause only on network/API errors to avoid hammering
      if (attempt <= MAX_RETRIES) await new Promise(r => setTimeout(r, 300));
    }
  }

  if (lastError && !narrative) {
    return res.status(500).json({ error: 'AI generation failed after retries.', detail: lastError.message });
  }

  if (!qualityInfo.valid) {
    console.warn(`[generate] Quality gate not met — proceeding with best result.`);
  }

  try {
    const id = db.insertGeneration({
      driverName, 
      route: finalRoute,
      startingLocation,
      destination,
      style,
      summary,
      socialCaption,
      landmarks:   landmarks   || null,
      highlights:  highlights  || null,
      tripDate:    tripDate    || null,
      vehicleType: vehicleType || 'Sedan',
      tone:        mood || tone || 'Adventurous',
      prompt,
      aiResponse:  narrative,
      title,
      userId,
    });

    console.log(`[generate] Saved — id=${id}, title="${title}", words=${qualityInfo.words}, chars=${qualityInfo.chars}, userId=${userId || 'null'}`);

    return res.json({
      id,
      title,
      summary,
      socialCaption,
      narrative,
      userId,
      wordCount:  qualityInfo.words,
      charCount:  qualityInfo.chars,
      createdAt:  new Date().toISOString(),
    });
  } catch (dbErr) {
    console.error('[generate] SQLite save error:', dbErr);
    return res.status(500).json({ error: 'Failed to save narrative.', detail: dbErr.message });
  }
});

module.exports = router;
