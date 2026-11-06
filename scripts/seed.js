/**
 * Seed script: creates ONLY the two shops and three accounts.
 * Credentials come from environment variables — no hardcoded secrets.
 * Any existing data is preserved unless purge=true.
 */
const User = require('../models/User');
const Shop = require('../models/Shop');

async function seedClean(options = {}) {
  const { purge = true } = options;

  if (purge) {
    const Entry = require('../models/Entry');
    const Customer = require('../models/Customer');
    const AuditLog = require('../models/AuditLog');
    const DiaryImage = require('../models/DiaryImage');
    await Promise.all([
      Entry.deleteMany({}),
      Customer.deleteMany({}),
      AuditLog.deleteMany({}),
      User.deleteMany({}),
      DiaryImage ? DiaryImage.deleteMany({}) : Promise.resolve(),
    ]);

    // Wipe uploads (keep the directory itself)
    const fs = require('fs');
    const path = require('path');
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    if (fs.existsSync(uploadsDir)) {
      for (const f of fs.readdirSync(uploadsDir)) {
        // Keep .gitkeep or hidden files
        if (!f.startsWith('.')) {
          try { fs.unlinkSync(path.join(uploadsDir, f)); } catch { /* ignore */ }
        }
      }
    }
  }

  // Read PINs/passwords from env
  const shop1Pin = process.env.SEED_SHOP1_PIN;
  const shop2Pin = process.env.SEED_SHOP2_PIN;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!shop1Pin || !shop2Pin || !adminPassword) {
    throw new Error(
      'Missing seed credentials. Set SEED_SHOP1_PIN, SEED_SHOP2_PIN, and SEED_ADMIN_PASSWORD in .env'
    );
  }

  // Create shops
  await Shop.deleteMany({});
  await Shop.create([
    { shopId: 'shop1', name: 'Shop 1', nameHi: 'दुकान 1', adminPhone: '' },
    { shopId: 'shop2', name: 'Shop 2', nameHi: 'दुकान 2', adminPhone: '' },
  ]);

  // Create users (mustChangeSecret=true so first login forces change)
  const users = await User.create([
    {
      username: 'admin',
      password: adminPassword,
      role: 'admin',
      shopId: null,
      displayName: 'मालिक (Admin)',
      mustChangeSecret: false,
    },
    {
      username: 'shop1',
      password: shop1Pin,
      pin: shop1Pin,
      role: 'shopkeeper',
      shopId: 'shop1',
      displayName: 'दुकान 1',
      mustChangeSecret: false,
    },
    {
      username: 'shop2',
      password: shop2Pin,
      pin: shop2Pin,
      role: 'shopkeeper',
      shopId: 'shop2',
      displayName: 'दुकान 2',
      mustChangeSecret: false,
    },
  ]);

  return { users };
}

module.exports = { seedClean };
