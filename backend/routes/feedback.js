const express = require('express');
const router = express.Router();
const db = require('../db/database');

/**
 * POST /api/feedback/link-firestore
 * Links a Firestore document ID back to the Turso narrative record.
 * Called non-blocking from the frontend after Firestore save succeeds.
 */
router.post('/link-firestore', async (req, res) => {
  const { sqliteId, firestoreId } = req.body;
  if (!sqliteId || !firestoreId) {
    return res.status(400).json({ error: 'sqliteId and firestoreId are required.' });
  }
  try {
    await db.updateFirestoreId(Number(sqliteId), firestoreId);
    res.json({ success: true });
  } catch (e) {
    console.error('[feedback/link-firestore] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/feedback/:id
 * Saves a star rating and optional comment for a generation.
 */
router.post('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { rating, comment } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Rating must be between 1 and 5.' });
  }

  try {
    const row = await db.getGeneration(id);
    if (!row) return res.status(404).json({ error: 'Generation not found.' });

    await db.updateRating(id, Math.round(rating), comment || null);
    res.json({ success: true, id, rating: Math.round(rating) });
  } catch (err) {
    console.error(`[feedback] POST /${id} error:`, err);
    res.status(500).json({ error: 'Failed to save rating.', detail: err.message });
  }
});

module.exports = router;
