'use strict';
/**
 * backend/middleware/requireRole.js
 * ──────────────────────────────────
 * RBAC middleware — enforces minimum role level.
 *
 * Role hierarchy: SuperAdmin > Admin > User
 *
 * Usage:
 *   router.delete('/:id', verifyToken, requireRole('Admin', 'SuperAdmin'), handler);
 *   router.post('/create-admin', verifyToken, requireRole('SuperAdmin'), handler);
 */

const ROLE_RANK = { User: 0, Admin: 1, SuperAdmin: 2 };

/**
 * requireRole(...roles) — middleware factory.
 * Pass one or more allowed role names.
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const userRank    = ROLE_RANK[req.user.role] ?? -1;
    const minRequired = Math.min(...roles.map(r => ROLE_RANK[r] ?? 99));

    if (userRank < minRequired) {
      return res.status(403).json({
        error: `Access denied. Requires one of: ${roles.join(', ')}.`,
      });
    }
    next();
  };
}

/**
 * requireSuperAdmin — shorthand for requireRole('SuperAdmin')
 */
const requireSuperAdmin = requireRole('SuperAdmin');

/**
 * requireAdmin — shorthand for requireRole('Admin', 'SuperAdmin')
 */
const requireAdmin = requireRole('Admin', 'SuperAdmin');

module.exports = { requireRole, requireAdmin, requireSuperAdmin };
