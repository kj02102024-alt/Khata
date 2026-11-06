require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const mongoose = require('mongoose');
const { connectDB } = require('./lib/db');

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

  const User = require('./models/User');
  if ((await User.countDocuments()) === 0) {
    // No users → auto-seed from env variables
    if (!process.env.SEED_SHOP1_PIN || !process.env.SEED_ADMIN_PASSWORD) {
      console.warn('⚠️  No users found and SEED_SHOP1_PIN / SEED_ADMIN_PASSWORD not set.');
      console.warn('   Set these in .env, then run: npm run reset-data');
    } else {
      console.log('No users found — seeding from environment variables…');
      try {
        const { seedClean } = require('./scripts/seed');
        const { users } = await seedClean({ purge: false });
        console.log('Seeded users:');
        users.forEach((u) => console.log(`  - ${u.username} (${u.role})`));
        console.log('⚠️  Each account must change its PIN/password on first login.');
      } catch (err) {
        console.error('Auto-seed failed:', err.message);
      }
    }
  }

  app.listen(PORT, () => {
    console.log(`Khata running at http://localhost:${PORT}`);
  });
}

start();
