'use strict';
/**
 * backend/routes/history.js
 * ──────────────────────────
 * Auth handled by verifyToken middleware mounted in server.js.
 * req.user.uid is available on all routes.
 */
const express = require('express');
const router  = express.Router();
const db      = require('../db/database');

/**
 * GET /api/history
 * Paginated list — always scoped to the authenticated user.
 */
router.get('/', async (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(50,  parseInt(req.query.limit) || 12);
  const search = (req.query.search || '').trim();
  const userId = req.user.uid;

  try {
    const { data, total } = await db.getGenerations({ page, limit, search, userId });
    res.json({
      records: data,
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[history] GET / error:', err);
    res.status(500).json({ error: 'Failed to fetch history.', detail: err.message });
  }
});

/**
 * GET /api/history/my
 * Alias — same behaviour, kept for backward compatibility.
 */
router.get('/my', async (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(100, parseInt(req.query.limit) || 50);
  const search = (req.query.search || '').trim();
  const userId = req.user.uid;

  try {
    const { data, total } = await db.getGenerations({ page, limit, search, userId });
    res.json({
      records: data,
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[history] GET /my error:', err);
    res.status(500).json({ error: 'Failed to fetch user narratives.', detail: err.message });
  }
});

/**
 * GET /api/history/:id
 * Returns a single narrative. Only the owner (or Admin/SuperAdmin) may view it.
 */
router.get('/:id', async (req, res) => {
  try {
    const row = await db.getGeneration(Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'Generation not found.' });

    // Enforce ownership unless admin
    if (row.user_id && row.user_id !== req.user.uid && !['Admin','SuperAdmin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    res.json(row);
  } catch (err) {
    console.error(`[history] GET /${req.params.id} error:`, err);
    res.status(500).json({ error: 'Failed to fetch record.', detail: err.message });
  }
});

/**
 * DELETE /api/history/:id
 * Soft-delete. Only the owner (or Admin) may delete.
 */
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const row = await db.getGeneration(id);
    if (!row) return res.status(404).json({ error: 'Narrative not found.' });

    const isAdmin = ['Admin','SuperAdmin'].includes(req.user.role);
    if (row.user_id && row.user_id !== req.user.uid && !isAdmin) {
      return res.status(403).json({ error: 'Forbidden. You do not own this narrative.' });
    }

    await db.deleteGeneration(id);
    res.json({ success: true, id, archived: true });
  } catch (err) {
    console.error(`[history] DELETE /${req.params.id} error:`, err);
    res.status(500).json({ error: 'Failed to archive narrative.', detail: err.message });
  }
});

/**
 * POST /api/history/:id/restore
 */
router.post('/:id/restore', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const row = await db.getGeneration(id);
    if (!row) return res.status(404).json({ error: 'Narrative not found.' });

    const isAdmin = ['Admin','SuperAdmin'].includes(req.user.role);
    if (row.user_id && row.user_id !== req.user.uid && !isAdmin) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    await db.restoreGeneration(id);
    res.json({ success: true, id, restored: true });
  } catch (err) {
    console.error(`[history] RESTORE /${req.params.id} error:`, err);
    res.status(500).json({ error: 'Failed to restore narrative.', detail: err.message });
  }
});

module.exports = router;
