/**
 * server.js
 *
 * Express application entry point.
 *
 * Order of middleware (top to bottom) matters:
 *   1. dotenv          – load secrets before anything else
 *   2. helmet          – set security headers on every response
 *   3. rate limiter    – only on /api/auth/login
 *   4. express.json()  – parse JSON request bodies
 *   5. API routes      – /api/auth, /api/customers, /api/entries
 *   6. Static files    – serve /public (the frontend)
 *   7. Catch-all       – return index.html for any unknown GET
 *                         so the SPA can handle client-side "routing"
 *
 * connectDB() is awaited before app.listen() so the first request
 * never races against an unready database connection.
 */

require('dotenv').config();

const express      = require('express');
const path         = require('path');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');

const connectDB    = require('./db');
const authRoutes     = require('./routes/auth');
const customerRoutes = require('./routes/customers');
const entryRoutes    = require('./routes/entries');
const adminRoutes    = require('./routes/admin');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Security headers (helmet) ─────────────────────────────────────
// Content-Security-Policy is set to allow our own inline scripts/styles
// and the Google Fonts CDN used for the Devanagari font.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'", "'unsafe-inline'"],  // needed for inline <script>
        styleSrc:   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc:    ["'self'", 'https://fonts.gstatic.com'],
        imgSrc:     ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
      },
    },
  })
);

// ── Rate limiter — login endpoint only ───────────────────────────
// 10 attempts per 15 minutes per IP.  Logs a warning so you notice
// if someone is probing; in production you could also alert on this.
const loginLimiter = rateLimit({
  windowMs:         15 * 60 * 1000,  // 15 minutes
  max:              10,
  standardHeaders:  true,
  legacyHeaders:    false,
  message:          { error: 'बहुत ज़्यादा कोशिश हो गई, 15 मिनट बाद कोशिश करें' },
  handler: (req, res, next, options) => {
    console.warn(`Rate limit hit from ${req.ip}`);
    res.status(options.statusCode).json(options.message);
  },
});

// ── JSON body parser (10MB for photo receipts) ────────────────────
app.use(express.json({ limit: '10mb' }));

// ── API routes ────────────────────────────────────────────────────
app.use('/api/auth',      loginLimiter, authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/entries',   entryRoutes);
app.use('/api/admin',     adminRoutes);

// ── Static frontend ───────────────────────────────────────────────
const PUBLIC = path.join(__dirname, 'public');
app.use(express.static(PUBLIC));

// Catch-all: any route the browser navigates to (like /customer/123)
// should return index.html so the SPA JS can parse the URL.
app.get('*', (_req, res) => {
  res.sendFile(path.join(PUBLIC, 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────
(async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`🚀  Khata running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Startup failed:', err);
    process.exit(1);
  }
})();
