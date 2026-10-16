/**
 * routes/auth.js
 *
 * POST /api/auth/login
 *   Body: { username, pin }
 *   Returns: { token, shop, displayName }
 *
 * Security layers:
 *   • express-rate-limit (applied in server.js) caps login attempts to
 *     10 per 15 min per IP — brute-forcing a 6-digit PIN takes up to
 *     999,990 tries, so rate-limiting makes it impractical.
 *   • express-validator rejects obviously malformed input early.
 *   • bcryptjs.compare is timing-safe (no early exit on mismatch).
 *   • JWT expiry is 90 days — long enough that elderly users rarely
 *     need to re-login, but not forever.
 */

const express   = require('express');
const jwt       = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');

const User      = require('../models/User');

const router = express.Router();

// ── Validation rules ──────────────────────────────────────────────
const loginValidation = [
  body('username')
    .trim()
    .notEmpty().withMessage('यूजरनेम जरूरी है')
    .isLength({ max: 50 }).withMessage('यूजरनेम बहुत लंबा है'),
  body('pin')
    .notEmpty().withMessage('PIN जरूरी है')
    .isLength({ min: 4, max: 8 }).withMessage('PIN 4-8 अंकों का होना चाहिए')
    .isNumeric().withMessage('PIN केवल अंक होने चाहिए'),
];

// ── POST /api/auth/login ──────────────────────────────────────────
router.post('/login', loginValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  const { username, pin } = req.body;

  try {
    const user = await User.findOne({ username: username.toLowerCase().trim() });

    // Use the same generic error for "not found" and "wrong PIN" to
    // avoid leaking which usernames exist.
    const GENERIC_ERROR = 'यूजरनेम या PIN गलत है';

    if (!user) {
      return res.status(401).json({ error: GENERIC_ERROR });
    }

    const ok = await user.verifyPin(pin);
    if (!ok) {
      return res.status(401).json({ error: GENERIC_ERROR });
    }

    // Build JWT payload — keep it small, no sensitive fields.
    const payload = {
      userId:      user._id,
      shop:        user.shop,
      username:    user.username,
      displayName: user.displayName,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: '90d',
    });

    res.json({
      token,
      shop:        user.shop,
      displayName: user.displayName,
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'सर्वर में कोई समस्या है, बाद में कोशिश करें' });
  }
});

module.exports = router;
