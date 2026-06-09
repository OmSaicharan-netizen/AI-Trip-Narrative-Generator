const express = require('express');
const router  = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('../db/database');
const { buildTravelPrompt } = require('../utils/promptBuilder');

// ── Minimum quality thresholds ────────────────────────────────
const MIN_WORDS  = 150;
const MIN_CHARS  = 3000;
const MAX_RETRIES = 2;     // up to 3 total attempts

// ── Helper: count words ───────────────────────────────────────
function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ── Helper: parse AI response ─────────────────────────────────
/**
 * Parses the AI response into { title, narrative }.
 *
 * The prompt instructs the model to:
 *   Line 1 → plain-text title (no # prefix)
 *   Line 2 → blank line
 *   Lines 3+ → blog body (no title repetition)
 *
 * We also handle legacy responses that start with "# Title".
 */
function parseResponse(raw, fallbackRoute) {
  const lines = raw.split('\n');

  let titleLine = '';
  let bodyStart = 0;

  // Case 1: first line is a markdown heading  # Title
  if (lines[0].startsWith('#')) {
    titleLine = lines[0].replace(/^#+\s*/, '').trim();
    bodyStart = lines[1] === '' ? 2 : 1;
  } else {
    // Case 2: first line is plain title
    titleLine = lines[0].trim();
    bodyStart = lines[1] === '' ? 2 : 1;
  }

  const title = titleLine || `${fallbackRoute} — A Journey to Remember`;

  // Body: everything after the title line (skip one blank line if present)
  let body = lines.slice(bodyStart).join('\n').trim();

  // Safety: remove any accidental re-occurrence of the exact title in the body
  // (escaped for regex use)
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  body = body
    .replace(new RegExp(`^#+\\s*${escapedTitle}\\s*$`, 'gmi'), '')   // # Title heading
    .replace(new RegExp(`^\\*\\*${escapedTitle}\\*\\*\\s*$`, 'gmi'), '')  // **Title**
    .replace(new RegExp(`^${escapedTitle}\\s*$`, 'gmi'), '')           // bare title line
    .trim();

  // Convert any remaining ## subheadings to plain bold paragraphs
  body = body.replace(/^##\s+(.+)$/gm, '\n$1\n');

  return { title, narrative: body };
}

// ── Validate quality ──────────────────────────────────────────
function validateNarrative(text) {
  const words = wordCount(text);
  const chars = text.length;
  return {
    valid:  words >= MIN_WORDS && chars >= MIN_CHARS,
    words,
    chars,
  };
}

/**
 * POST /api/generate
 * Generates an AI travel narrative from trip input fields.
 * Validates minimum 150 words / 3,000 chars. Auto-retries up to 3× on failure.
 */
router.post('/', async (req, res) => {
  const { driverName, route, landmarks, highlights, tripDate, vehicleType, tone } = req.body;

  // ── Input Validation ────────────────────────────────────────
  if (!driverName || !route) {
    return res.status(400).json({
      error: 'driverName and route are required fields.',
    });
  }

  // ── API Key Check ────────────────────────────────────────────
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    return res.status(503).json({
      error: 'Gemini API key not configured. Add GEMINI_API_KEY to your .env file.',
    });
  }

  // ── Build Prompt ─────────────────────────────────────────────
  const prompt = buildTravelPrompt({
    driverName, route, landmarks, highlights, tripDate, vehicleType, tone,
  });

  // ── Gemini Client ─────────────────────────────────────────────
  const genAI = new GoogleGenerativeAI(apiKey);
  const model  = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature:     0.9,
      topP:            0.95,
      maxOutputTokens: 8192,   // ← raised: 3000+ chars ≈ ~2500 tokens; allow headroom
    },
  });

  // ── Generate with retry ────────────────────────────────────
  let lastError = null;
  let title     = null;
  let narrative = null;
  let qualityInfo = {};

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      console.log(`[generate] Attempt ${attempt}/${MAX_RETRIES + 1} — route="${route}", tone="${tone}"`);

      const result      = await model.generateContent(prompt);
      const rawResponse = result.response.text();

      console.log(`[generate] Raw response length: ${rawResponse.length} chars`);

      // Parse title + body
      const parsed = parseResponse(rawResponse, route);
      title     = parsed.title;
      narrative = parsed.narrative;

      // Validate quality
      qualityInfo = validateNarrative(narrative);

      console.log(
        `[generate] Quality check — words: ${qualityInfo.words}, chars: ${qualityInfo.chars}, ` +
        `valid: ${qualityInfo.valid}`
      );

      if (qualityInfo.valid) {
        break;   // ✅ Passes quality gate
      }

      // Quality failed — try again
      console.warn(
        `[generate] Attempt ${attempt} FAILED quality gate ` +
        `(${qualityInfo.words} words, ${qualityInfo.chars} chars). ` +
        `Need ≥${MIN_WORDS} words and ≥${MIN_CHARS} chars.`
      );

      if (attempt <= MAX_RETRIES) {
        // Small wait before retry to avoid rate-limiting
        await new Promise(r => setTimeout(r, 800));
      }

    } catch (err) {
      lastError = err;
      console.error(`[generate] Attempt ${attempt} error:`, err.message);
      if (attempt <= MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  // ── Hard failure: all retries exhausted ────────────────────
  if (lastError && !narrative) {
    console.error('[generate] All attempts failed with errors:', lastError);
    return res.status(500).json({
      error: 'AI generation failed after retries. Please try again.',
      detail: lastError.message,
    });
  }

  // ── Soft failure: quality never met — use best attempt ─────
  if (!qualityInfo.valid) {
    console.warn(
      `[generate] Quality gate not met after ${MAX_RETRIES + 1} attempts. ` +
      `Proceeding with best result (${qualityInfo.words} words, ${qualityInfo.chars} chars).`
    );
  }

  // ── Save to SQLite ──────────────────────────────────────────
  try {
    const id = db.insertGeneration({
      driverName,
      route,
      landmarks:   landmarks   || null,
      highlights:  highlights  || null,
      tripDate:    tripDate    || null,
      vehicleType: vehicleType || 'Sedan',
      tone:        tone        || 'Adventurous',
      prompt,
      aiResponse:  narrative,
      title,
    });

    console.log(
      `[generate] Saved — id=${id}, title="${title}", ` +
      `words=${qualityInfo.words}, chars=${qualityInfo.chars}`
    );

    return res.json({
      id,
      title,
      narrative,
      wordCount:  qualityInfo.words,
      charCount:  qualityInfo.chars,
      createdAt:  new Date().toISOString(),
    });
  } catch (dbErr) {
    console.error('[generate] SQLite save error:', dbErr);
    return res.status(500).json({
      error: 'Failed to save narrative to database.',
      detail: dbErr.message,
    });
  }
});

module.exports = router;
