/**
 * autoSeed.js — Startup seeder & credential synchronizer
 *
 * Runs automatically every time the server starts.
 * Ensures the 2 shops and 3 default user accounts exist and their
 * passwords/PINs are properly synced and unlocked.
 *
 * Default credentials (or overridden by environment variables):
 *   shop1: PIN '1234'
 *   shop2: PIN '5678'
 *   admin: Password 'khata123'
 */

const Shop = require('../models/Shop');
const User = require('../models/User');

async function ensureShop({ shopId, name, nameHi }) {
  let shop = await Shop.findOne({ shopId });
  if (!shop) {
    shop = await Shop.create({
      shopId,
      name,
      nameHi,
      adminPhone: process.env.SEED_ADMIN_PHONE || '',
    });
    console.log(`  [autoSeed] ✅ Created shop: ${shopId} (${nameHi})`);
  } else {
    // Keep shop name up to date
    shop.name = name;
    shop.nameHi = nameHi;
    await shop.save();
  }
  return shop;
}

async function ensureUser({ username, plaintextPassword, plaintextPin, role, shopId, displayName }) {
  let user = await User.findOne({ username });
  if (!user) {
    user = new User({
      username,
      role,
      shopId: shopId || null,
      displayName,
    });
  }

  // Always sync password and PIN to ensure current defaults/env work!
  user.password = plaintextPassword;
  if (plaintextPin) {
    user.pin = plaintextPin;
  }
  user.displayName = displayName;
  user.shopId = shopId || null;
  user.role = role;
  user.mustChangeSecret = false;
  user.failedAttempts = 0;
  user.lockedUntil = null; // Always unlock if was locked

  await user.save();
  console.log(`  [autoSeed] ✅ Synced user: ${username} (${role})`);
  return user;
}

async function autoSeed() {
  const shop1Pin = process.env.SEED_SHOP1_PIN || '1234';
  const shop2Pin = process.env.SEED_SHOP2_PIN || '5678';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'khata123';

  console.log('[autoSeed] Synchronizing default shops and accounts…');

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

  console.log('[autoSeed] Synchronized all default accounts successfully.');
  return {
    seeded: true,
    credentials: {
      shop1: shop1Pin,
      shop2: shop2Pin,
      admin: adminPassword,
    },
  };
}

module.exports = { autoSeed };
