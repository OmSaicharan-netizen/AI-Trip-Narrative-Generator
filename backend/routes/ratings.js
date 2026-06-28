'use strict';
const express = require('express');
const router  = express.Router();
const db      = require('../db/database');
// Auth: verifyToken applied at server.js level for POST.

// GET reviews for a narrative
router.get('/:id', async (req, res) => {
  try {
    const narrativeId = Number(req.params.id);
    const ratings = await db.getNarrativeRatings(narrativeId);
    res.json({ ratings });
  } catch (err) {
    console.error('[ratings] GET /:id error:', err);
    res.status(500).json({ error: 'Failed to fetch narrative reviews.' });
  }
});

// POST review (Requires auth)
router.post('/:id', async (req, res) => {
  try {
    const narrativeId = Number(req.params.id);
    const { rating, review } = req.body;
    const userId = req.user.uid;
    const userName = req.user.displayName || req.user.email.split('@')[0];

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be an integer between 1 and 5.' });
    }

    await db.addRating({
      narrativeId,
      userId,
      userName,
      rating: Number(rating),
      review: review || ''
    });

    res.json({ success: true, message: 'Rating submitted successfully.' });
  } catch (err) {
    console.error('[ratings] POST /:id error:', err);
    if (err.message.includes('E11000') || err.message.includes('duplicate')) {
      return res.status(400).json({ error: 'You have already rated this narrative.' });
    }
    if (err.message.includes('own narrative')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to submit rating.', detail: err.message });
  }
});

module.exports = router;
