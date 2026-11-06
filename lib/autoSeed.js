/**
 * autoSeed.js — Idempotent startup seeder
 *
 * Called automatically every time the server starts, right after DB connects.
 * Safe to run repeatedly: it checks for each record individually and only
 * inserts what is missing — never overwrites existing data.
 *
 * Env vars (set in Render → Environment):
 *   SEED_SHOP1_PIN       — PIN for shop1 (default: '1234')
 *   SEED_SHOP2_PIN       — PIN for shop2 (default: '5678')
 *   SEED_ADMIN_PASSWORD  — password for admin (default: 'khata123')
 */

const Shop = require('../models/Shop');
const User = require('../models/User');

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
    mustChangeSecret: false,
  };
  if (plaintextPin) {
    doc.pin = plaintextPin;
  }
  const user = await User.create(doc);
  console.log(`  [autoSeed] ✅ Created user: ${username} (${role})`);
  return user;
}

async function autoSeed() {
  const shop1Pin = process.env.SEED_SHOP1_PIN || '1234';
  const shop2Pin = process.env.SEED_SHOP2_PIN || '5678';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'khata123';

  console.log('[autoSeed] Checking default shops and accounts…');

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
    plaintextPassword: shop1Pin,
    plaintextPin: shop1Pin,
    role: 'shopkeeper',
    shopId: 'shop1',
    displayName: process.env.SEED_SHOP1_NAME_HI || 'दुकान 1',
  });

  await ensureUser({
    username: 'shop2',
    plaintextPassword: shop2Pin,
    plaintextPin: shop2Pin,
    role: 'shopkeeper',
    shopId: 'shop2',
    displayName: process.env.SEED_SHOP2_NAME_HI || 'दुकान 2',
  });

  await ensureUser({
    username: 'admin',
    plaintextPassword: adminPassword,
    plaintextPin: null,
    role: 'admin',
    shopId: null,
    displayName: 'मालिक (Admin)',
  });

  console.log('[autoSeed] Done. Default accounts verified/created.');
  return { seeded: true };
}

module.exports = { autoSeed };
