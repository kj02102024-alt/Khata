const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'shopkeeper'], required: true },
    shopId: { type: String, default: null },
    displayName: { type: String, default: '' },

    // PIN for shopkeeper (4 digits, bcrypt-hashed same as password)
    pin: { type: String, default: null },

    // Force password / PIN change on first login
    mustChangeSecret: { type: Boolean, default: true },

    // Login lockout
    failedAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.pre('save', async function hashPassword(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  if (this.isModified('pin') && this.pin && !this.pin.startsWith('$2')) {
    this.pin = await bcrypt.hash(this.pin, 10);
  }
  next();
});

userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.password);
};

userSchema.methods.comparePin = function comparePin(plain) {
  if (!this.pin) return Promise.resolve(false);
  return bcrypt.compare(String(plain), this.pin);
};

userSchema.methods.isLocked = function isLocked() {
  if (!this.lockedUntil) return false;
  return this.lockedUntil > new Date();
};

userSchema.methods.recordFailedAttempt = async function recordFailedAttempt() {
  this.failedAttempts = (this.failedAttempts || 0) + 1;
  if (this.failedAttempts >= 5) {
    this.lockedUntil = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    this.failedAttempts = 0;
  }
  await this.save();
};

userSchema.methods.recordSuccess = async function recordSuccess() {
  if (this.failedAttempts || this.lockedUntil) {
    this.failedAttempts = 0;
    this.lockedUntil = null;
    await this.save();
  }
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    username: this.username,
    role: this.role,
    shopId: this.shopId,
    displayName: this.displayName,
    mustChangeSecret: this.mustChangeSecret,
  };
};

module.exports = mongoose.model('User', userSchema);
