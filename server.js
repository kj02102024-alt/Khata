require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
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

// Trust reverse proxy (Render, AWS ALB, Nginx) so HTTPS and secure cookies work seamlessly
app.set('trust proxy', 1);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Persistent session store: keeps Shop 1, Shop 2 and Admin logged in across server restarts and dyno sleep.
// Uses mongoose clientPromise so it attaches to whichever MongoDB connection is active (Atlas or local).
const sessionStore = MongoStore.create({
  clientPromise: mongoose.connection.asPromise().then((c) => c.getClient()),
  collectionName: 'sessions',
  ttl: 180 * 24 * 60 * 60, // 180 days (half a year) in seconds
  autoRemove: 'native',
  touchAfter: 24 * 3600, // only touch session once per 24 hours if unchanged
});

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'khata-dev-secret',
    resave: false,
    saveUninitialized: false,
    rolling: true, // resets cookie maxAge on every request while active
    store: sessionStore,
    cookie: {
      httpOnly: true,
      maxAge: 180 * 24 * 60 * 60 * 1000, // 180 days in ms
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
