const express = require('express');
const User = require('../models/User');
const Shop = require('../models/Shop');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Simple in-memory rate limiter for login (IP-based)
const rateLimitMap = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, windowStart: now };
  if (now - entry.windowStart > 15 * 60 * 1000) {
    entry.count = 0;
    entry.windowStart = now;
  }
  entry.count++;
  rateLimitMap.set(ip, entry);
  return entry.count <= 20; // max 20 attempts per 15 min per IP
}

// Admin username/password login
router.post('/login', async (req, res) => {
  const ip = req.ip || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many attempts', errorHi: 'बहुत ज़्यादा कोशिशें — 15 मिनट बाद फिर करें' });
  }
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required', errorHi: 'नाम और पासवर्ड दें' });
    }
    const user = await User.findOne({ username: String(username).toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid login', errorHi: 'गलत नाम या पासवर्ड' });
    }
    if (user.isLocked()) {
      const mins = Math.ceil((user.lockedUntil - Date.now()) / 60000);
      return res.status(423).json({
        error: 'Account locked',
        errorHi: `खाता बंद है — ${mins} मिनट बाद फिर कोशिश करें`,
        lockedUntil: user.lockedUntil,
      });
    }
    if (!(await user.comparePassword(password))) {
      await user.recordFailedAttempt();
      return res.status(401).json({ error: 'Invalid login', errorHi: 'पिन/पासवर्ड ग़लत है, फिर से कोशिश कीजिए' });
    }
    await user.recordSuccess();
    req.session.user = user.toSafeJSON();
    // 30-day session for shopkeepers; shorter for admin
    req.session.cookie.maxAge = user.role === 'shopkeeper' ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
    res.json({ user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// PIN login for shopkeepers
router.post('/pin-login', async (req, res) => {
  const ip = req.ip || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many attempts', errorHi: 'बहुत ज़्यादा कोशिशें — 15 मिनट बाद फिर करें' });
  }
  try {
    const { shopId, pin } = req.body || {};
    if (!shopId || !pin) {
      return res.status(400).json({ error: 'shopId and pin required', errorHi: 'दुकान और पिन चाहिए' });
    }
    const user = await User.findOne({ shopId, role: 'shopkeeper' });
    if (!user) {
      return res.status(401).json({ error: 'Shop not found', errorHi: 'दुकान नहीं मिली' });
    }
    if (user.isLocked()) {
      const mins = Math.ceil((user.lockedUntil - Date.now()) / 60000);
      return res.status(423).json({
        error: 'Account locked',
        errorHi: `पिन बंद है — ${mins} मिनट बाद फिर कोशिश करें`,
        lockedUntil: user.lockedUntil,
      });
    }
    // Try PIN first, then fall back to password for admin-side use
    let ok = await user.comparePin(String(pin).trim());
    if (!ok) ok = await user.comparePassword(String(pin).trim());
    if (!ok) {
      await user.recordFailedAttempt();
      const remaining = 5 - user.failedAttempts;
      return res.status(401).json({
        error: 'Wrong PIN',
        errorHi: 'पिन ग़लत है, फिर से कोशिश कीजिए',
        attemptsLeft: Math.max(0, remaining),
      });
    }
    await user.recordSuccess();
    req.session.user = user.toSafeJSON();
    req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    res.json({ user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Change PIN (shopkeeper) or password (admin)
router.post('/change-secret', requireAuth, async (req, res) => {
  try {
    const { currentSecret, newSecret } = req.body || {};
    if (!newSecret || String(newSecret).length < 4) {
      return res.status(400).json({ error: 'New secret too short', errorHi: 'नया पिन/पासवर्ड बहुत छोटा है' });
    }
    const user = await User.findById(req.session.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Verify current secret
    const okPin = user.pin ? await user.comparePin(String(currentSecret || '')) : false;
    const okPass = await user.comparePassword(String(currentSecret || ''));
    if (!okPin && !okPass) {
      return res.status(401).json({ error: 'Wrong current secret', errorHi: 'पुराना पिन/पासवर्ड गलत है' });
    }

    if (user.role === 'shopkeeper') {
      user.pin = String(newSecret).trim();
    } else {
      user.password = String(newSecret).trim();
    }
    user.mustChangeSecret = false;
    await user.save();
    req.session.user = user.toSafeJSON();
    res.json({ ok: true, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Change failed' });
  }
});

// Set PIN for shopkeeper (admin can also set it without knowing current)
router.post('/set-pin', requireAuth, async (req, res) => {
  try {
    const { shopId, pin } = req.body || {};
    // Admin can set any shop's PIN; shopkeeper can only set their own
    const targetShopId = req.session.user.role === 'admin' ? (shopId || req.session.user.shopId) : req.session.user.shopId;
    if (!pin || String(pin).length !== 4 || !/^\d{4}$/.test(String(pin))) {
      return res.status(400).json({ error: 'PIN must be exactly 4 digits', errorHi: 'पिन 4 अंक का होना चाहिए' });
    }
    const user = await User.findOne({ shopId: targetShopId, role: 'shopkeeper' });
    if (!user) return res.status(404).json({ error: 'Shop user not found' });
    user.pin = String(pin);
    user.mustChangeSecret = false;
    await user.save();
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Set PIN failed' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.session.user });
});

// List shops for the shop-picker on the login screen
router.get('/shops', async (req, res) => {
  try {
    const shops = await Shop.find({}).sort({ shopId: 1 });
    res.json({ shops: shops.map((s) => ({ shopId: s.shopId, name: s.name, nameHi: s.nameHi })) });
  } catch (err) {
    console.error(err);
    // Fallback to hardcoded so login never breaks
    res.json({ shops: [{ shopId: 'shop1', name: 'Shop 1', nameHi: 'दुकान 1' }, { shopId: 'shop2', name: 'Shop 2', nameHi: 'दुकान 2' }] });
  }
});

module.exports = router;
