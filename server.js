require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const mongoose = require('mongoose');
const { connectDB } = require('./lib/db');
const { autoSeed } = require('./lib/autoSeed');

const authRoutes = require('./routes/auth');
const customerRoutes = require('./routes/customers');
const entryRoutes = require('./routes/entries');
const adminRoutes = require('./routes/admin');
const diaryRoutes = require('./routes/diary');

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'khata-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, // default 30d; auth routes can shorten
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  })
);

app.use('/uploads', express.static(uploadsDir));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/entries', entryRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/diary', diaryRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, db: mongoose.connection.readyState === 1 });
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function start() {
  try {
    await connectDB();
  } catch (err) {
    console.error('Database unavailable:', err.message);
    console.error('Set a valid MONGODB_URI in .env (MongoDB Atlas recommended).');
    process.exit(1);
  }

  // ── Auto-seed: runs on EVERY startup, idempotent (skips existing records) ──
  try {
    await autoSeed();
  } catch (err) {
    // Non-fatal: log the error but let the server continue
    console.error('[autoSeed] Error during auto-seed:', err.message);
  }

  app.listen(PORT, () => {
    console.log(`Khata running at http://localhost:${PORT}`);
  });
}

start();
