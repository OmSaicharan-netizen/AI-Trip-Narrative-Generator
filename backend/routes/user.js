'use strict';
/**
 * backend/routes/user.js
 * ────────────────────────
 * Auth handled by verifyToken in server.js.
 */
const express = require('express');
const router  = express.Router();
const db      = require('../db/database');
const turso   = require('../db/turso');

router.get('/dashboard-stats', async (req, res) => {
  try {
    const stats = await db.getUserDashboardStats(req.user.uid);
    res.json(stats);
  } catch (err) {
    console.error('[user] GET /dashboard-stats error:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard stats.', detail: err.message });
  }
});

router.get('/reviews', async (req, res) => {
  try {
    const uid = req.user.uid;

    // Get user's narrative IDs
    const narrRes = await turso.execute(
      'SELECT id, title, route FROM narratives WHERE user_id = ? AND is_deleted = 0',
      [uid]
    );
    const narratives = narrRes.rows;
    const narrativeIds = narratives.map(n => n.id);

    if (!narrativeIds.length) {
      return res.json({ avgScore: 0, totalReviews: 0, distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }, reviews: [] });
    }

    const placeholders = narrativeIds.map(() => '?').join(',');
    const reviewsRes = await turso.execute(
      `SELECT * FROM ratings WHERE narrative_id IN (${placeholders}) ORDER BY created_at DESC`,
      narrativeIds
    );
    const reviews = reviewsRes.rows;

    const total    = reviews.length;
    const sum      = reviews.reduce((acc, r) => acc + Number(r.rating), 0);
    const avgScore = total ? parseFloat((sum / total).toFixed(1)) : 0;
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach(r => { if (distribution[r.rating] !== undefined) distribution[r.rating]++; });

    const narrativeMap = Object.fromEntries(narratives.map(n => [n.id, n.title || n.route || 'Untitled']));
    const enrichedReviews = reviews.map(r => ({
      id:             r.id,
      narrativeId:    r.narrative_id,
      narrativeTitle: narrativeMap[r.narrative_id] || 'Deleted Narrative',
      userName:       r.user_name || 'Anonymous',
      rating:         r.rating,
      review:         r.review || '',
      createdAt:      r.created_at,
    }));

    res.json({ avgScore, totalReviews: total, distribution, reviews: enrichedReviews });
  } catch (err) {
    console.error('[user] GET /reviews error:', err);
    res.status(500).json({ error: 'Failed to fetch user reviews.', detail: err.message });
  }
});

router.get('/notifications', async (req, res) => {
  try {
    const notifications = await db.getUserNotifications(req.user.uid);
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notifications.', detail: err.message });
  }
});

router.post('/notifications/read', async (req, res) => {
  try {
    await db.markNotificationsRead(req.user.uid);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark notifications as read.', detail: err.message });
  }
});

router.get('/activity', async (req, res) => {
  try {
    const activity = await db.getUserActivity(req.user.uid);
    res.json(activity);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch activity logs.', detail: err.message });
  }
});

router.get('/analytics', async (req, res) => {
  try {
    const analytics = await db.getUserAnalyticsMetrics(req.user.uid);
    res.json(analytics);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch analytics metrics.', detail: err.message });
  }
});

router.put('/profile', async (req, res) => {
  try {
    const { displayName, bio, photoURL } = req.body;
    await db.updateUserProfile(req.user.uid, { displayName, bio, photoURL });
    await db.logActivity({ userId: req.user.uid, action: 'Profile Update', detail: 'Updated profile information' });
    res.json({ success: true });
  } catch (err) {
    console.error('[user] PUT /profile error:', err);
    res.status(500).json({ error: 'Failed to update profile.', detail: err.message });
  }
});

module.exports = router;
