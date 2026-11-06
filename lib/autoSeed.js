/**
 * autoSeed.js — Idempotent startup seeder
 *
 * Called automatically every time the server starts, right after DB connects.
 * Safe to run repeatedly: it checks for each record individually and only
 * inserts what is missing — never overwrites existing data.
 *
 * Required env vars (set in Render → Environment):
 *   SEED_SHOP1_PIN       — 4-6 digit PIN for the shop1 shopkeeper
 *   SEED_SHOP2_PIN       — 4-6 digit PIN for the shop2 shopkeeper
 *   SEED_ADMIN_PASSWORD  — password for the admin account
 *
 * Optional env vars:
 *   SEED_SHOP1_NAME_HI   — Hindi name for shop 1 (default: "दुकान 1")
 *   SEED_SHOP2_NAME_HI   — Hindi name for shop 2 (default: "दुकान 2")
 *   SEED_SHOP1_NAME      — English name for shop 1 (default: "Shop 1")
 *   SEED_SHOP2_NAME      — English name for shop 2 (default: "Shop 2")
 *   SEED_ADMIN_PHONE     — Admin contact phone shown on PIN-forgot screen
 */

const Shop = require('../models/Shop');
const User = require('../models/User');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function missingVars() {
  const required = ['SEED_SHOP1_PIN', 'SEED_SHOP2_PIN', 'SEED_ADMIN_PASSWORD'];
  return required.filter((k) => !process.env[k]);
}

async function ensureShop({ shopId, name, nameHi }) {
  const existing = await Shop.findOne({ shopId });
  if (existing) {
    console.log(`  [autoSeed] Shop "${shopId}" already exists — skipped.`);
    return existing;
  }
  const shop = await Shop.create({
    shopId,
    name,
    nameHi,
    adminPhone: process.env.SEED_ADMIN_PHONE || '',
  });
  console.log(`  [autoSeed] ✅ Created shop: ${shopId} (${nameHi})`);
  return shop;
}

async function ensureUser({ username, plaintextPassword, plaintextPin, role, shopId, displayName }) {
  const existing = await User.findOne({ username });
  if (existing) {
    console.log(`  [autoSeed] User "${username}" already exists — skipped.`);
    return existing;
  }
  const doc = {
    username,
    password: plaintextPassword,
    role,
    shopId: shopId || null,
    displayName,
    mustChangeSecret: false, // Normal login doesn't block with mandatory password change
  };
  if (plaintextPin) {
    doc.pin = plaintextPin; // User model's pre-save hook bcrypt-hashes this
  }
  const user = await User.create(doc);
  console.log(`  [autoSeed] ✅ Created user: ${username} (${role})`);
  return user;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * autoSeed()
 *
 * Idempotently ensures the two default shops and three accounts exist.
 * Returns { seeded: boolean, details: string[] }
 */
async function autoSeed() {
  const missing = missingVars();
  if (missing.length > 0) {
    const msg =
      `[autoSeed] ⚠️  Skipped — missing env vars: ${missing.join(', ')}.\n` +
      `           Set them in Render → Environment and redeploy.`;
    console.warn(msg);
    return { seeded: false, details: [msg] };
  }

  console.log('[autoSeed] Checking default shops and accounts…');

  const details = [];

  // ── Shops ──────────────────────────────────────────────────────────────────
  await ensureShop({
    shopId: 'shop1',
    name: process.env.SEED_SHOP1_NAME || 'Shop 1',
    nameHi: process.env.SEED_SHOP1_NAME_HI || 'दुकान 1',
  });
  await ensureShop({
    shopId: 'shop2',
    name: process.env.SEED_SHOP2_NAME || 'Shop 2',
    nameHi: process.env.SEED_SHOP2_NAME_HI || 'दुकान 2',
  });

  // ── Users ──────────────────────────────────────────────────────────────────
  await ensureUser({
    username: 'shop1',
    plaintextPassword: process.env.SEED_SHOP1_PIN,
    plaintextPin: process.env.SEED_SHOP1_PIN,
    role: 'shopkeeper',
    shopId: 'shop1',
    displayName: process.env.SEED_SHOP1_NAME_HI || 'दुकान 1',
  });

  await ensureUser({
    username: 'shop2',
    plaintextPassword: process.env.SEED_SHOP2_PIN,
    plaintextPin: process.env.SEED_SHOP2_PIN,
    role: 'shopkeeper',
    shopId: 'shop2',
    displayName: process.env.SEED_SHOP2_NAME_HI || 'दुकान 2',
  });

  await ensureUser({
    username: 'admin',
    plaintextPassword: process.env.SEED_ADMIN_PASSWORD,
    plaintextPin: null, // admin uses password, not PIN
    role: 'admin',
    shopId: null,
    displayName: 'मालिक (Admin)',
  });

  console.log('[autoSeed] Done. ⚠️  First login forces PIN/password change for all new accounts.');
  return { seeded: true, details };
}

module.exports = { autoSeed };
