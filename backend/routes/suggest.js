const express = require('express');
const router  = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');

router.post('/title', async (req, res) => {
  const { destination, startingLocation } = req.body;
  if (!destination) {
    return res.status(400).json({ error: 'destination is required.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    return res.status(503).json({ error: 'Gemini API key not configured.' });
  }

  const prompt = `You are a creative travel blogger. Suggest a single, captivating, short title for a travel story about a trip to ${destination}${startingLocation ? ` starting from ${startingLocation}` : ''}. Output ONLY the title, nothing else, without quotes.`;

  const genAI = new GoogleGenerativeAI(apiKey);
  // Using 1.5-flash for faster response on simple suggestions
  const model  = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' }); 

  try {
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim().replace(/^["']|["']$/g, '');
    return res.json({ title: raw });
  } catch (err) {
    console.error('[suggest] error:', err.message);
    return res.status(500).json({ error: 'Failed to generate title.' });
  }
});

module.exports = router;
