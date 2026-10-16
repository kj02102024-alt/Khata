/**
 * models/User.js
 *
 * One document per shop login.
 * username  – "shop1" or "shop2" (unique)
 * pinHash   – bcrypt hash of the 6-digit PIN
 * shop      – which shop this user controls ("shop1" | "shop2")
 *
 * The PIN is NEVER stored in plain text.  bcryptjs.compare() is
 * used at login time to verify it against the stored hash.
 */

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    pinHash: {
      type: String,
      required: true,
    },
    shop: {
      type: String,
      enum: ['shop1', 'shop2'],
      required: true,
    },
    displayName: {
      type: String,   // e.g. "दुकान १" — shown in the UI header
      default: '',
    },
    role: {
      type: String,
      enum: ['admin', 'shopkeeper'],
      default: 'shopkeeper',
    },
  },
  { timestamps: true }
);

// Instance method: compare a candidate PIN against the stored hash.
userSchema.methods.verifyPin = function (candidatePin) {
  return bcrypt.compare(String(candidatePin), this.pinHash);
};

// Static helper to hash a plain PIN before storing it.
userSchema.statics.hashPin = function (pin) {
  return bcrypt.hash(String(pin), 12); // cost factor 12 is plenty for a PIN
};

module.exports = mongoose.model('User', userSchema);
