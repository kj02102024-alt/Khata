/**
 * scripts/reset-data.js
 *
 * ⚠️  DESTRUCTIVE — permanently purges ALL entries and customers.
 *
 *   npm run reset-db
 *   node scripts/reset-data.js
 *
 * Sequence:
 *   1. Delete ALL Entry documents
 *   2. Delete ALL Customer documents
 *   3. Re-seed the three default users (shop1 / shop2 / admin)
 *      using upsert so it is safe even when users already exist.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Entry    = require('../models/Entry');
const Customer = require('../models/Customer');
const User     = require('../models/User');

// ── Default users (mirrors seed.js) ────────────────────────────
const DEFAULT_USERS = [
  {
    username:    'shop1',
    pin:         '123456',
    shop:        'shop1',
    displayName: 'दुकान १',
    role:        'shopkeeper',
  },
  {
    username:    'shop2',
    pin:         '654321',
    shop:        'shop2',
    displayName: 'दुकान २',
    role:        'shopkeeper',
  },
  {
    username:    'admin',
    pin:         '999999',
    shop:        'shop1',
    displayName: 'मालिक (एडमिन)',
    role:        'admin',
  },
];

(async () => {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      console.error('❌  MONGODB_URI not found in .env  — aborting.');
      process.exit(1);
    }

    console.log('🔌  Connecting to MongoDB Atlas…');
    await mongoose.connect(uri);
    console.log('✅  Connected.\n');

    // ── Step 1: Purge all entries ────────────────────────────────
    const entryResult = await Entry.deleteMany({});
    console.log(`🗑  Entries deleted  : ${entryResult.deletedCount}`);

    // ── Step 2: Purge all customers ──────────────────────────────
    const customerResult = await Customer.deleteMany({});
    console.log(`🗑  Customers deleted: ${customerResult.deletedCount}\n`);

    // ── Step 3: Re-seed default users ────────────────────────────
    console.log('🌱  Re-seeding default users…');
    for (const u of DEFAULT_USERS) {
      const pinHash = await User.hashPin(u.pin);

      await User.findOneAndUpdate(
        { username: u.username },
        { pinHash, shop: u.shop, displayName: u.displayName, role: u.role },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      console.log(`   ✅  "${u.username}" (${u.displayName} / ${u.role}) — PIN: ${u.pin}`);
    }

    console.log('\n✅  Reset complete. Database is clean and users are ready.');
    process.exit(0);

  } catch (err) {
    console.error('\n❌  Reset failed:', err.message || err);
    process.exit(1);
  }
})();
