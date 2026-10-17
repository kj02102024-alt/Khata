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
 *   status + deleted → OCR verification queue queries
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
      default: null,      // decimal meters for cut pieces (पैंट-शर्ट / थान)
    },
    // ── Textile / Handloom product fields (100% Dynamic & Open) ──
    category: {
      type: String,
      trim: true,
      default: 'अन्य',     // open text: e.g. गड्डा, सूती पर्दा, पैंट-शर्ट, साड़ी, चादर, कॉटन roll, अन्य
    },
    unitType: {
      type: String,
      trim: true,
      default: 'piece',   // dynamic: meter, piece/nag, kg, set, thān, etc.
    },
    quantity: {
      type: Number,
      default: null,      // integer count (saree, blanket, parda, gadde pieces)
    },
    brand: {
      type: String,
      trim: true,
      default: '',        // e.g. Laxmipati, Raymond, Vimal, Arvind
    },
    designNumber: {
      type: String,
      trim: true,
      default: '',        // e.g. Design #405 or article number
    },
    rate: {
      type: Number,
      default: null,      // price per meter or per piece
    },
    dueDate: {
      type: Date,
      default: null,      // promised payment date (उधार चुकाने की तारीख)
    },
    date: {
      type: Date,
      default: Date.now,  // automatically default to exact current timestamp
      required: true,
      index: true,
    },
    note: {
      type: String,
      trim: true,
      default: '',
    },
    photo: {
      type: String,
      default: '',        // base64 data URL of receipt/bill
    },

    // ── OCR / Diary-photo upload fields ──────────────────────────
    // imageUrl: path to the uploaded diary photo file on disk.
    //   Set by the OCR upload route; empty string for manual entries.
    imageUrl: {
      type: String,
      trim: true,
      default: '',
    },
    // ocrExtractedData: raw structured JSON returned by the OCR/AI
    //   extraction step.  Stored as Mixed so we can evolve its shape
    //   without a schema migration.  null for manual entries.
    ocrExtractedData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    // status: 'approved' for normal entries; 'pending_admin_approval'
    //   for OCR-based entries that need admin verification before they
    //   affect the customer's displayed balance.
    status: {
      type: String,
      enum: ['approved', 'pending_admin_approval', 'pending_admin_review'],
      default: 'approved',
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

// Compound index for the OCR admin verification queue
entrySchema.index({ status: 1, deleted: 1 });

module.exports = mongoose.model('Entry', entrySchema);
