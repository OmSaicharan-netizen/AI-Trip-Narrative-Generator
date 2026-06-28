/**
 * middleware/authorize.js — Role-based authorization middleware
 * ────────────────────────────────────────────────────────────
 * Verifies that req.user.role is one of the allowed roles for this route.
 */

function authorize(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized. Please sign in.' });
    }
    
    const { role } = req.user;
    if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
      console.warn(`[authorize] Access denied for user ${req.user.email} (role: ${role}). Requires one of: [${allowedRoles.join(', ')}]`);
      return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }
    
    next();
  };
}

module.exports = { authorize };
