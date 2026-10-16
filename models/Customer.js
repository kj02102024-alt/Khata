/**
 * models/Customer.js
 *
 * Shared across both shops.  Both shops can add entries for the same
 * customer and see the combined balance.
 *
 * Indexes on name and village power the live-search feature without
 * a full collection scan.  Text indexes let us do $text searches;
 * the collation on the index makes search case-insensitive (useful
 * even for Devanagari variants).
 */

const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'ग्राहक का नाम जरूरी है'],
      trim: true,
    },
    village: {
      type: String,
      trim: true,
      default: '',
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    alias: {
      type: [String],
      default: [],
      index: true,
    },
  },
  { timestamps: true }
);

// Compound text index: searching name, village, or alias with one query
customerSchema.index({ name: 'text', village: 'text', alias: 'text' });

// Regular (ascending) indexes for exact / prefix matching via regex
customerSchema.index({ name: 1 });
customerSchema.index({ village: 1 });
customerSchema.index({ alias: 1 });

module.exports = mongoose.model('Customer', customerSchema);
