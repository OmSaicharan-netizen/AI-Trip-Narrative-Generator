'use strict';
/**
 * backend/routes/auth.js — Authentication Routes
 * ─────────────────────────────────────────────────
 * POST /api/auth/register      — create account
 * POST /api/auth/login         — issue access + refresh tokens
 * POST /api/auth/logout        — revoke refresh token
 * POST /api/auth/refresh       — exchange refresh token → new access token
 * POST /api/auth/forgot-password — generate reset token (logged to console)
 * POST /api/auth/reset-password  — consume token, update password
 * GET  /api/auth/me            — current user profile (requires verifyToken)
 */

const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');

const db = require('../db/database');
const { verifyToken } = require('../middleware/verifyToken');

const router = express.Router();

// ── Constants ─────────────────────────────────────────────────
const JWT_SECRET         = process.env.JWT_SECRET         || (() => { throw new Error('JWT_SECRET is not set'); })();
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || (() => { throw new Error('JWT_REFRESH_SECRET is not set'); })();
const ACCESS_TTL  = '15m';
const REFRESH_TTL = '7d';
const BCRYPT_ROUNDS = 12;

// ── Rate limiters ─────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { error: 'Too many attempts. Please wait an hour.' },
});

// ── Token helpers ─────────────────────────────────────────────
function issueAccessToken(user) {
  return jwt.sign(
    {
      sub:    user.uid,
      uid:    user.uid,
      email:  user.email,
      role:   user.role,
      name:   user.display_name || user.displayName || '',
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

function issueRefreshToken(user) {
  return jwt.sign(
    { sub: user.uid, type: 'refresh' },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TTL }
  );
}

async function storeRefreshToken(userId, token) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { execute } = require('../db/turso');
  await execute(
    'INSERT INTO sessions (user_id, refresh_token, expires_at) VALUES (?,?,?)',
    [Number(userId), token, expiresAt]
  );
}

async function revokeRefreshToken(token) {
  const { execute } = require('../db/turso');
  await execute('UPDATE sessions SET revoked = 1 WHERE refresh_token = ?', [token]);
}

async function isRefreshTokenValid(token) {
  const { execute } = require('../db/turso');
  const res = await execute(
    'SELECT id FROM sessions WHERE refresh_token = ? AND revoked = 0 AND expires_at > ?',
    [token, new Date().toISOString()]
  );
  return res.rows.length > 0;
}

// ── POST /api/auth/register — DISABLED (closed system) ───────
router.post('/register', (req, res) => {
  return res.status(403).json({ error: 'Registration is not open. Please contact your administrator.' });
});

// ── POST /api/auth/login ──────────────────────────────────────
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await db.getUserByEmail(email);
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.account_status !== 'active') {
      return res.status(403).json({ error: `Account is ${user.account_status}. Contact support.` });
    }

    // Update last login
    const { execute } = require('../db/turso');
    await execute('UPDATE users SET last_login = ? WHERE uid = ?', [new Date().toISOString(), user.uid]);

    const accessToken  = issueAccessToken(user);
    const refreshToken = issueRefreshToken(user);
    await storeRefreshToken(user.id, refreshToken);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict', maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      accessToken,
      user: {
        uid:         user.uid,
        email:       user.email,
        displayName: user.display_name,
        role:        user.role,
        photoUrl:    user.photo_url,
      },
    });
  } catch (err) {
    console.error('[auth] login error:', err.message);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────
router.post('/logout', async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;
    if (token) await revokeRefreshToken(token);
    res.clearCookie('refreshToken');
    return res.json({ message: 'Logged out successfully.' });
  } catch (err) {
    console.error('[auth] logout error:', err.message);
    return res.status(500).json({ error: 'Logout failed.' });
  }
});

// ── POST /api/auth/refresh ────────────────────────────────────
router.post('/refresh', async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) return res.status(401).json({ error: 'No refresh token.' });

    const valid = await isRefreshTokenValid(token);
    if (!valid) return res.status(401).json({ error: 'Invalid or expired refresh token.' });

    let payload;
    try {
      payload = jwt.verify(token, JWT_REFRESH_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid refresh token.' });
    }

    const user = await db.getUserByUid(payload.sub);
    if (!user || user.account_status !== 'active') {
      return res.status(403).json({ error: 'Account is not active.' });
    }

    const newAccessToken = issueAccessToken(user);
    return res.json({ accessToken: newAccessToken });
  } catch (err) {
    console.error('[auth] refresh error:', err.message);
    return res.status(500).json({ error: 'Token refresh failed.' });
  }
});

// ── POST /api/auth/forgot-password ───────────────────────────
router.post('/forgot-password', strictLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const user = await db.getUserByEmail(email);
    // Always respond 200 to avoid email enumeration
    if (!user) return res.json({ message: 'If that email exists, a reset link has been sent.' });

    const token     = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
    const { execute } = require('../db/turso');
    await execute(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?,?,?)',
      [user.id, token, expiresAt]
    );

    // TODO: Replace with actual email delivery (SendGrid, Nodemailer, etc.)
    console.log(`\n[PASSWORD RESET] Token for ${email}: ${token}\nExpires: ${expiresAt}\n`);

    return res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('[auth] forgot-password error:', err.message);
    return res.status(500).json({ error: 'Request failed.' });
  }
});

// ── POST /api/auth/reset-password ────────────────────────────
router.post('/reset-password', strictLimiter, async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and new password are required.' });
    if (password.length < 8)  return res.status(400).json({ error: 'Password must be at least 8 characters.' });

    const { execute } = require('../db/turso');
    const res2 = await execute(
      `SELECT prt.*, u.uid FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE prt.token = ? AND prt.used = 0 AND prt.expires_at > ?`,
      [token, new Date().toISOString()]
    );
    if (!res2.rows.length) return res.status(400).json({ error: 'Invalid or expired reset token.' });

    const row  = res2.rows[0];
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await execute('UPDATE users SET password_hash = ?, updated_at = ? WHERE uid = ?', [hash, new Date().toISOString(), row.uid]);
    await execute('UPDATE password_reset_tokens SET used = 1 WHERE id = ?', [row.id]);

    return res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    console.error('[auth] reset-password error:', err.message);
    return res.status(500).json({ error: 'Password reset failed.' });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await db.getUserByUid(req.user.uid);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    return res.json({
      uid:         user.uid,
      email:       user.email,
      displayName: user.display_name,
      photoUrl:    user.photo_url,
      role:        user.role,
      accountStatus: user.account_status,
      bio:         user.bio,
      createdAt:   user.created_at,
      lastLogin:   user.last_login,
    });
  } catch (err) {
    console.error('[auth] me error:', err.message);
    return res.status(500).json({ error: 'Failed to load profile.' });
  }
});

module.exports = router;
