'use strict';
/**
 * backend/routes/explore.js
 * ──────────────────────────
 * Public explore feed. GET / is unauthenticated (public).
 * Share increment uses verifyToken (mounted at server.js for this route? No —
 * explore is public, so we apply verifyToken only on the share sub-route).
 */
const express = require('express');
const router  = express.Router();
const db      = require('../db/database');
const { verifyToken } = require('../middleware/verifyToken');

router.get('/', async (req, res) => {
  try {
    const page        = Math.max(1, parseInt(req.query.page)  || 1);
    const limit       = Math.min(50, parseInt(req.query.limit) || 12);
    const search      = (req.query.search || '').trim();
    const sortBy      = req.query.sortBy      || 'recent';
    const destination = req.query.destination || '';
    const author      = req.query.author      || '';
    const rating      = req.query.rating      || '';
    const date        = req.query.date        || '';

    const { data, total } = await db.getPublicGenerations({ page, limit, search, sortBy, destination, author, rating, date });

    // If user is authenticated via optional Bearer token, mark wishlisted items
    let userId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const payload = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
        userId = payload.uid || payload.sub || null;
      } catch { /* unauthenticated is fine for public feed */ }
    }

    if (userId) {
      await Promise.all(data.map(async (row) => {
        row.is_wishlisted = await db.isWishlisted(userId, row.id);
      }));
    } else {
      data.forEach(row => { row.is_wishlisted = false; });
    }

    res.json({ records: data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error('[explore] GET / error:', err);
    res.status(500).json({ error: 'Failed to fetch explore narratives.', detail: err.message });
  }
});

// Share increment — requires auth
router.post('/:id/share', verifyToken, async (req, res) => {
  try {
    await db.incrementShares(Number(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to increment share count.' });
  }
});

// View increment — public
router.post('/:id/view', async (req, res) => {
  try {
    await db.incrementViews(Number(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to increment view count.' });
  }
});

module.exports = router;
