/**
 * scripts/seed.js
 *
 * Run ONCE to create the two shop users in the database.
 *
 *   node scripts/seed.js
 *
 * Change USERS array below to set the usernames, PINs, and display names
 * you actually want.  Run the script again any time you need to reset a PIN.
 *
 * The script uses upsert (findOneAndUpdate with upsert:true) so it is safe
 * to run multiple times — it updates the existing document instead of
 * creating a duplicate.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const User     = require('../models/User');

// ── Configure your shops here ─────────────────────────────────────
const USERS = [
  {
    username:    'shop1',
    pin:         '123456',     // ← change to your actual 6-digit PIN
    shop:        'shop1',
    displayName: 'दुकान १',
  },
  {
    username:    'shop2',
    pin:         '654321',     // ← change to your actual 6-digit PIN
    shop:        'shop2',
    displayName: 'दुकान २',
  },
];

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    for (const u of USERS) {
      const pinHash = await User.hashPin(u.pin);

      await User.findOneAndUpdate(
        { username: u.username },
        { pinHash, shop: u.shop, displayName: u.displayName },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      console.log(`✅  User "${u.username}" (${u.displayName}) upserted`);
    }

    console.log('\nDone. You can now log in.');
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
})();
