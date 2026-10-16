/**
 * middleware/auth.js
 *
 * Protects every API route that needs authentication.
 *
 * Usage:  router.get('/protected', requireAuth, handler)
 *
 * How it works:
 *   1. Reads the Authorization header:  "Bearer <token>"
 *   2. Verifies the JWT signature with JWT_SECRET.
 *   3. Attaches { userId, shop, username } to req.user.
 *   4. Calls next() so the route handler can run.
 *
 * On failure it returns 401 with a JSON error — the frontend
 * interprets 401 as "session expired, go back to login".
 */

const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';

  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'लॉगिन जरूरी है' });
  }

  const token = authHeader.slice(7); // drop "Bearer "

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // payload contains: { userId, shop, username, role, displayName, iat, exp }
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'सेशन समाप्त हो गया, फिर लॉगिन करें' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'केवल एडमिन को अनुमति है' });
  }
  next();
}

module.exports = requireAuth;
module.exports.requireAuth = requireAuth;
module.exports.requireAdmin = requireAdmin;
