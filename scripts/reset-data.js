/**
 * Reset script: wipes ALL collections + uploads, then seeds ONLY
 * the two shops and three accounts. Credentials must be in .env.
 *
 * Usage:
 *   npm run reset-data
 *
 * Required .env variables:
 *   SEED_SHOP1_PIN   — 4-digit PIN for दुकान 1 (must be changed on first login)
 *   SEED_SHOP2_PIN   — 4-digit PIN for दुकान 2
 *   SEED_ADMIN_PASSWORD — password for admin account
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { connectDB, disconnectDB } = require('../lib/db');
const { seedClean } = require('./seed');

async function reset() {
  await connectDB();
  const { users } = await seedClean({ purge: true });
  console.log('\n✅ Reset complete. Seeded accounts:');
  users.forEach((u) => console.log(`  - ${u.username} (${u.role}${u.shopId ? ', ' + u.shopId : ''})`));
  console.log('\nAll data wiped. Uploads folder cleared.');
  console.log('Each account will be required to change its PIN/password on first login.');
  await disconnectDB();
}

reset().catch((err) => {
  console.error('❌ Reset failed:', err.message);
  process.exit(1);
});
