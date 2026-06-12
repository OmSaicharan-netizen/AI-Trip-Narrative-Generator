const express = require('express');
const router  = express.Router();
const db      = require('../db/database');
const { verifyIdToken } = require('../firebase/admin');

// ── Auth helper ────────────────────────────────────────────────
/**
 * Extract and verify Firebase Bearer token from request.
 * Returns { userId, error }
 */
async function extractVerifiedUserId(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return { userId: null, error: 'Missing or invalid Authorization header.' };
  }
  const token = auth.slice(7);
  const { user, error } = await verifyIdToken(token);
  if (error) return { userId: null, error };
  return { userId: user.uid, error: null };
}

/**
 * GET /api/history
 * Returns paginated list of past generations.
 * Query params: page (default 1), limit (default 12), search (optional)
 * NOTE: returns both "records" and "data" keys for cross-version compatibility.
 */
router.get('/', (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(50, parseInt(req.query.limit) || 12);
  const search = (req.query.search || '').trim();

  console.log(`[history] GET / page=${page} limit=${limit} search="${search}"`);

  try {
    const { data, total } = db.getGenerations({ page, limit, search });
    console.log(`[history] Fetched ${data.length} records (total=${total})`);

    res.json({
      records: data,   // ← primary key used by frontend fallback
      data,            // ← alias for backward compat
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('[history] GET / error:', err);
    res.status(500).json({ error: 'Failed to fetch history.', detail: err.message });
  }
});

/**
 * GET /api/history/:id
 * Returns a single generation by ID (includes full ai_response).
 */
router.get('/:id', (req, res) => {
  try {
    const row = db.getGeneration(Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'Generation not found.' });
    console.log(`[history] GET /${req.params.id} OK`);
    res.json(row);
  } catch (err) {
    console.error(`[history] GET /${req.params.id} error:`, err);
    res.status(500).json({ error: 'Failed to fetch record.', detail: err.message });
  }
});

/**
 * DELETE /api/history/:id
 * Soft-deletes a narrative from SQLite (marks as archived — NOT permanently removed).
 * The record is preserved in the database with is_deleted = 1 for future recovery.
 * Requires: Authorization: Bearer <idToken>
 * Only the owner (user_id matches token uid) may archive.
 */
router.delete('/:id', async (req, res) => {
  const recordId = Number(req.params.id);
  if (!recordId || isNaN(recordId)) {
    return res.status(400).json({ error: 'Invalid record ID.' });
  }

  // ── Verify identity ──────────────────────────────────────────
  const { userId, error: authError } = await extractVerifiedUserId(req);
  if (authError) {
    console.warn(`[history] DELETE /${recordId} — auth failed: ${authError}`);
    return res.status(401).json({ error: 'Unauthorized. ' + authError });
  }

  try {
    // ── Fetch record and verify ownership ────────────────────────
    const row = db.getGeneration(recordId);
    if (!row) {
      return res.status(404).json({ error: 'Narrative not found.' });
    }

    // Ownership check: row.user_id must match the authenticated user
    // (allow null user_id rows only if no other user owns it — legacy data)
    if (row.user_id && row.user_id !== userId) {
      console.warn(`[history] DELETE /${recordId} — forbidden: owner=${row.user_id}, requester=${userId}`);
      return res.status(403).json({ error: 'Forbidden. You do not own this narrative.' });
    }

    // Soft-delete: preserves the record; sets is_deleted = 1
    db.deleteGeneration(recordId);
    console.log(`[history] SOFT-DELETE /${recordId} OK — userId=${userId} (record preserved, is_deleted=1)`);

    res.json({ success: true, id: recordId, archived: true });
  } catch (err) {
    console.error(`[history] DELETE /${recordId} error:`, err);
    res.status(500).json({ error: 'Failed to archive narrative.', detail: err.message });
  }
});

/**
 * POST /api/history/:id/restore
 * Restores a previously soft-deleted narrative.
 * Requires: Authorization: Bearer <idToken>
 * Only the owner may restore their narrative.
 */
router.post('/:id/restore', async (req, res) => {
  const recordId = Number(req.params.id);
  if (!recordId || isNaN(recordId)) {
    return res.status(400).json({ error: 'Invalid record ID.' });
  }

  const { userId, error: authError } = await extractVerifiedUserId(req);
  if (authError) {
    return res.status(401).json({ error: 'Unauthorized. ' + authError });
  }

  try {
    // Fetch without the is_deleted filter (raw query for restore)
    const row = db.getGeneration(recordId);
    if (!row) {
      return res.status(404).json({ error: 'Narrative not found or not recoverable.' });
    }
    if (row.user_id && row.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden. You do not own this narrative.' });
    }
    db.restoreGeneration(recordId);
    console.log(`[history] RESTORE /${recordId} OK — userId=${userId}`);
    res.json({ success: true, id: recordId, restored: true });
  } catch (err) {
    console.error(`[history] RESTORE /${recordId} error:`, err);
    res.status(500).json({ error: 'Failed to restore narrative.', detail: err.message });
  }
});

module.exports = router;
