'use strict';
/**
 * backend/routes/admin.js
 * ────────────────────────
 * Admin & SuperAdmin dashboard endpoints.
 * Auth: verifyToken + requireAdmin applied in server.js (all routes).
 * SuperAdmin-only endpoints additionally use requireSuperAdmin.
 */
const express = require('express');
const router  = express.Router();
const db      = require('../db/database');
const { requireSuperAdmin } = require('../middleware/requireRole');

// ── Narratives ────────────────────────────────────────────────

router.get('/data', async (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(100, parseInt(req.query.limit) || 20);
  const search = (req.query.search || '').trim();
  const tone   = req.query.tone   || '';
  const rating = req.query.rating || '';
  try {
    const { data, total } = await db.getAdminData({ page, limit, search, tone, rating });
    res.json({
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      user: { email: req.user.email, name: req.user.displayName },
    });
  } catch (err) {
    console.error('[admin] GET /data error:', err);
    res.status(500).json({ error: 'Failed to fetch admin data.', detail: err.message });
  }
});

router.get('/data/:id', async (req, res) => {
  try {
    const row = await db.getGeneration(Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'Record not found.' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch record.', detail: err.message });
  }
});

router.delete('/data/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const row = await db.getGeneration(id);
    if (!row) return res.status(404).json({ error: 'Record not found.' });
    await db.deleteGeneration(id);
    await db.logAudit({
      actorId: req.user.uid, actorEmail: req.user.email,
      action: 'delete_narrative', targetType: 'narrative', targetId: id,
      detail: `Deleted narrative: ${row.title || row.route}`,
    });
    res.json({ success: true, deleted: id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete record.', detail: err.message });
  }
});

router.post('/data/:id/restore', async (req, res) => {
  const id = Number(req.params.id);
  try {
    await db.restoreGeneration(id);
    res.json({ success: true, restored: id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to restore record.', detail: err.message });
  }
});

router.get('/export', async (req, res) => {
  try {
    const rows = await db.getAllForExport();
    const headers = ['ID','Driver/Staff','Route','Landmarks','Highlights','Trip Date','Vehicle','Tone','Title','Rating','Comment','Created At'];
    const escape  = (v) => { if (v == null) return ''; const s = String(v).replace(/"/g,'""'); return /[",\n]/.test(s) ? `"${s}"` : s; };
    const csv = [headers.join(','), ...rows.map(r => [r.id,r.driver_name,r.route,r.landmarks,r.highlights,r.trip_date,r.vehicle_type,r.tone,r.title,r.rating,r.comment,r.created_at].map(escape).join(','))].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="manivtha_${new Date().toISOString().slice(0,10)}.csv"`);
    res.send('\uFEFF' + csv);
  } catch (err) {
    res.status(500).json({ error: 'Failed to export data.', detail: err.message });
  }
});

// ── Users ─────────────────────────────────────────────────────

router.get('/users', async (req, res) => {
  try {
    const users = await db.getUsers();
    res.json({ data: users });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users.', detail: err.message });
  }
});

// Only SuperAdmin can change roles
router.post('/users/:uid/role', requireSuperAdmin, async (req, res) => {
  const { uid } = req.params;
  const { role } = req.body;
  if (!['User', 'Admin'].includes(role)) {
    return res.status(400).json({ error: 'Role must be User or Admin. SuperAdmin role cannot be assigned via API.' });
  }
  if (uid === req.user.uid) {
    return res.status(403).json({ error: 'You cannot change your own role.' });
  }
  try {
    await db.updateUserRoleAndPermissions(uid, role);
    await db.logAudit({
      actorId: req.user.uid, actorEmail: req.user.email,
      action: 'change_role', targetType: 'user', targetId: uid,
      detail: `Changed role to ${role}`,
    });
    res.json({ success: true, uid, role });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update role.', detail: err.message });
  }
});

router.post('/users/:uid/status', requireSuperAdmin, async (req, res) => {
  const { uid } = req.params;
  const { status } = req.body;
  if (!['active', 'suspended', 'disabled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status value.' });
  }
  if (uid === req.user.uid) {
    return res.status(403).json({ error: 'You cannot change your own account status.' });
  }
  try {
    await db.updateUserStatus(uid, status);
    await db.logAudit({
      actorId: req.user.uid, actorEmail: req.user.email,
      action: 'change_status', targetType: 'user', targetId: uid,
      detail: `Set account status to ${status}`,
    });
    res.json({ success: true, uid, status });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update status.', detail: err.message });
  }
});

// ── Reports ───────────────────────────────────────────────────

router.get('/reports', async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  try {
    const result = await db.getReports({ page, limit });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch reports.', detail: err.message });
  }
});

router.post('/reports/:id/status', async (req, res) => {
  const { status } = req.body;
  try {
    await db.updateReportStatus(Number(req.params.id), status);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update report.', detail: err.message });
  }
});

// ── Audit Logs (SuperAdmin only) ──────────────────────────────

router.get('/audit-logs', requireSuperAdmin, async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 50);
  try {
    const result = await db.getAuditLogs({ page, limit });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch audit logs.', detail: err.message });
  }
});

// ── Verify (session ping) ─────────────────────────────────────
router.get('/verify', (req, res) => {
  res.json({
    authenticated: true,
    user: { email: req.user.email, name: req.user.displayName, role: req.user.role },
  });
});

module.exports = router;
