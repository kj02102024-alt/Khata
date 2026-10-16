/**
 * models/Entry.js
 *
 * One ledger line: either a sale or a payment.
 *
 * Soft-delete fields (deleted / deletedAt / deletedBy) let us
 * implement "undo last entry" without destroying data. The balance
 * aggregation in the routes layer filters out deleted entries.
 *
 * amount is stored as integer rupees — no decimals to worry about.
 *
 * Indexes:
 *   customer + date  → fast per-customer timeline queries
 *   shop             → (future) per-shop reports
 *   date             → "today's entries" query
 */

const mongoose = require('mongoose');

const entrySchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    shop: {
      type: String,
      enum: ['shop1', 'shop2'],
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['sale', 'payment'],
      required: true,
    },
    amount: {
      type: Number,       // integer rupees
      required: true,
      min: [1, 'राशि कम से कम ₹1 होनी चाहिए'],
    },
    item: {
      type: String,
      trim: true,
      default: '',        // optional for payments
    },
    meters: {
      type: Number,
      default: null,      // only meaningful for sales
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    note: {
      type: String,
      trim: true,
      default: '',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // ── Soft-delete ──────────────────────────────────────────────
    deleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

// Compound index for the most common query: all live entries for a customer
entrySchema.index({ customer: 1, deleted: 1, date: -1 });

module.exports = mongoose.model('Entry', entrySchema);
