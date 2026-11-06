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

  // ── Sample Labours ────────────────────────────────────────────────────────
  try {
    const Labour = require('../models/Labour');
    const LabourEntry = require('../models/LabourEntry');
    const { recalculateLabourBalance } = require('../routes/labour');
    const labourCount = await Labour.countDocuments();
    if (labourCount === 0) {
      const l1 = await Labour.create({
        name: 'रमेश कुमार',
        phone: '9876543210',
        shopId: 'shop1',
        roleTitle: 'कारीगर / मास्टर',
        wageType: 'monthly',
        wageAmount: 14000,
        joiningDate: new Date(Date.now() - 60 * 86400000),
        status: 'active',
      });
      await LabourEntry.create({
        labour: l1._id,
        shopId: 'shop1',
        type: 'salary_credit',
        category: 'salary',
        amount: 14000,
        date: new Date(Date.now() - 30 * 86400000),
        description: 'पिछले महीने का वेतन',
      });
      await LabourEntry.create({
        labour: l1._id,
        shopId: 'shop1',
        type: 'payment',
        category: 'advance',
        amount: 4000,
        paymentMode: 'cash',
        date: new Date(Date.now() - 10 * 86400000),
        description: 'त्यौहार एडवांस नकद दिया',
      });
      await recalculateLabourBalance(l1._id);

      const l2 = await Labour.create({
        name: 'सुरेश पटेल',
        phone: '9876512345',
        shopId: 'shop2',
        roleTitle: 'हेल्पर / पल्लेदार',
        wageType: 'daily',
        wageAmount: 500,
        joiningDate: new Date(Date.now() - 40 * 86400000),
        status: 'active',
      });
      await LabourEntry.create({
        labour: l2._id,
        shopId: 'shop2',
        type: 'salary_credit',
        category: 'daily_wage',
        amount: 6000,
        date: new Date(Date.now() - 15 * 86400000),
        description: '12 दिन की दिहाड़ी (12 × ₹500)',
      });
      await LabourEntry.create({
        labour: l2._id,
        shopId: 'shop2',
        type: 'payment',
        category: 'salary',
        amount: 5000,
        paymentMode: 'upi',
        date: new Date(Date.now() - 7 * 86400000),
        description: 'PhonePe से भुगतान किया',
      });
      await recalculateLabourBalance(l2._id);
      console.log('  [autoSeed] ✅ Initial sample labours seeded');
    }
  } catch (err) {
    console.warn('[autoSeed] Sample labour seeding skipped:', err.message);
  }

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
