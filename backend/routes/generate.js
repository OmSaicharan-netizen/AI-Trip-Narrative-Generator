'use strict';
/**
 * backend/routes/generate.js
 * ───────────────────────────
 * Auth handled by verifyToken in server.js.
 * userId comes from req.user.uid.
 */
const express = require('express');
const router  = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('../db/database');
const { buildTravelPrompt } = require('../utils/promptBuilder');

const MIN_WORDS   = 200;
const MIN_CHARS   = 3000;
const MAX_RETRIES = 3;

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function parseResponse(raw, fallbackRoute) {
  let parsed;
  try {
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const jsonString = jsonMatch ? jsonMatch[1] : raw;
    parsed = JSON.parse(jsonString);
  } catch {
    return { title: `${fallbackRoute} — A Journey to Remember`, summary: '', socialCaption: '', narrative: raw.trim() };
  }
  const title = parsed.title || `${fallbackRoute} — A Journey to Remember`;
  let body = (parsed.narrative || '').trim();
  const esc = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  body = body
    .replace(new RegExp(`^#+\\s*${esc}\\s*$`, 'gmi'), '')
    .replace(new RegExp(`^\\*\\*${esc}\\*\\*\\s*$`, 'gmi'), '')
    .replace(new RegExp(`^${esc}\\s*$`, 'gmi'), '')
    .replace(/^##\s+(.+)$/gm, '\n$1\n')
    .trim();
  return { title, summary: parsed.summary || '', socialCaption: parsed.socialCaption || '', narrative: body };
}

function validateNarrative(text) {
  const words = wordCount(text);
  const chars = text.length;
  return { valid: words >= MIN_WORDS && chars >= MIN_CHARS, words, chars };
}

router.post('/', async (req, res) => {
  const { driverName, route, startingLocation, destination, title: requestedTitle, mood, style, tone, landmarks, highlights, tripDate, vehicleType } = req.body;
  const finalRoute = (startingLocation && destination) ? `${startingLocation} to ${destination}` : route;

  if (!driverName || !finalRoute) {
    return res.status(400).json({ error: 'driverName and route (or startingLocation/destination) are required.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    return res.status(503).json({ error: 'Gemini API key not configured.' });
  }

  // userId from JWT (verifyToken in server.js)
  const userId = req.user.uid;

  const prompt = buildTravelPrompt({ driverName, route, startingLocation, destination, landmarks, highlights, tripDate, vehicleType, tone, mood, style, title: requestedTitle });

  const genAI = new GoogleGenerativeAI(apiKey);
  const model  = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { temperature: 0.9, topP: 0.95, maxOutputTokens: 8192, responseMimeType: 'application/json' },
  });

  let lastError = null, title = null, narrative = null, summary = null, socialCaption = null, qualityInfo = {};

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      const raw    = result.response.text();
      const parsed = parseResponse(raw, finalRoute);
      title = parsed.title; narrative = parsed.narrative; summary = parsed.summary; socialCaption = parsed.socialCaption;
      qualityInfo = validateNarrative(narrative);
      if (qualityInfo.valid) break;
    } catch (err) {
      lastError = err;
      if (attempt <= MAX_RETRIES) await new Promise(r => setTimeout(r, 300));
    }
  }

  if (lastError && !narrative) {
    return res.status(500).json({ error: 'AI generation failed after retries.', detail: lastError.message });
  }

  try {
    const id = await db.insertGeneration({
      driverName, route: finalRoute, startingLocation, destination, style, summary, socialCaption,
      landmarks: landmarks || null, highlights: highlights || null, tripDate: tripDate || null,
      vehicleType: vehicleType || 'Sedan', tone: mood || tone || 'Adventurous',
      prompt, aiResponse: narrative, title, userId,
    });

    return res.json({ id, title, summary, socialCaption, narrative, userId, wordCount: qualityInfo.words, charCount: qualityInfo.chars, createdAt: new Date().toISOString() });
  } catch (dbErr) {
    console.error('[generate] DB save error:', dbErr);
    return res.status(500).json({ error: 'Failed to save narrative.', detail: dbErr.message });
  }
});

module.exports = router;
