'use strict';
/**
 * backend/middleware/verifyToken.js
 * ──────────────────────────────────
 * Verifies the JWT access token from the Authorization header.
 * Sets req.user = { id, uid, email, role, displayName, accountStatus }
 *
 * Expects: Authorization: Bearer <jwt>
 */

const jwt = require('jsonwebtoken');
const db  = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET || (() => { throw new Error('JWT_SECRET is not set'); })();

async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header.' });
  }

  const token = authHeader.slice(7).trim();

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? 'Token expired.' : 'Invalid token.';
    return res.status(401).json({ error: msg });
  }

  try {
    const user = await db.getUserByUid(payload.uid || payload.sub);
    if (!user) {
      return res.status(401).json({ error: 'User account not found.' });
    }
    if (user.account_status !== 'active') {
      return res.status(403).json({ error: `Access denied. Account is ${user.account_status}.` });
    }

    req.user = {
      id:            user.id,
      uid:           user.uid,
      email:         user.email,
      role:          user.role,
      displayName:   user.display_name || '',
      accountStatus: user.account_status,
      photoUrl:      user.photo_url    || '',
    };

    next();
  } catch (err) {
    console.error('[verifyToken] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to verify user profile.' });
  }
}

module.exports = { verifyToken };
