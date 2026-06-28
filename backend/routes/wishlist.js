'use strict';
const express = require('express');
const router  = express.Router();
const db      = require('../db/database');
// Auth: verifyToken applied at server.js level — req.user is available on all routes.

// Toggle wishlist status for a narrative
router.post('/:id', async (req, res) => {
  try {
    const narrativeId = Number(req.params.id);
    const userId = req.user.uid;

    const { added, wishlistCount } = await db.toggleWishlist({ userId, narrativeId });
    res.json({ success: true, added, wishlistCount });
  } catch (err) {
    console.error('[wishlist] POST /:id error:', err);
    res.status(500).json({ error: 'Failed to update wishlist.' });
  }
});

// GET user's wishlisted narratives
router.get('/', async (req, res) => {
  try {
    const userId = req.user.uid;
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, parseInt(req.query.limit) || 12);

    const { data, total } = await db.getUserWishlist(userId, { page, limit });

    res.json({
      records: data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      }
    });
  } catch (err) {
    console.error('[wishlist] GET / error:', err);
    res.status(500).json({ error: 'Failed to fetch wishlist narratives.' });
  }
});

// GET status for check
router.get('/:id/status', async (req, res) => {
  try {
    const narrativeId = Number(req.params.id);
    const userId = req.user.uid;
    const wishlisted = await db.isWishlisted(userId, narrativeId);
    res.json({ wishlisted });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch status.' });
  }
});

module.exports = router;
