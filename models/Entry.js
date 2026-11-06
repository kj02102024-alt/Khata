const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema(
  {
    name: { type: String, default: '', trim: true },
    brand: { type: String, default: '', trim: true },
    qty: { type: Number, default: 1 },
    unit: { type: String, enum: ['पीस', 'मीटर', 'जोड़ी', 'सेट', ''], default: 'पीस' },
    rate: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
  },
  { _id: false }
);

const entrySchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    shopId: { type: String, required: true, index: true },

    // type: 'sale' = उधार (cloth given), 'payment' = जमा (payment received), 'adjustment'
    type: { type: String, enum: ['sale', 'payment', 'adjustment'], default: 'sale' },

    // --- New structured items array (§5) ---
    items: { type: [itemSchema], default: [] },

    // --- New fields (§5) ---
    entryTime: { type: Date, default: () => new Date() }, // separate editable time
    paymentMode: { type: String, enum: ['cash', 'upi', ''], default: '' },
    note: { type: String, default: '', trim: true },
    enteredVia: {
      type: String,
      enum: ['voice-master', 'voice-field', 'typed', 'diary-photo', ''],
      default: '',
    },
    isCleared: { type: Boolean, default: false }, // fully settled / struck through

    // --- Legacy fields (kept for backward compat) ---
    category: { type: String, default: '', trim: true },
    item: { type: String, default: '', trim: true },
    brand: { type: String, default: '', trim: true },
    meters: { type: Number, default: 0 },
    quantity: { type: Number, default: 1 },
    rate: { type: Number, default: 0 },
    amount: { type: Number, required: true },
    settledAmount: { type: Number, default: 0 },
    date: { type: Date, default: () => new Date(), index: true },
    imageUrl: { type: String, default: null },
    status: {
      type: String,
      enum: ['approved', 'pending_admin_review', 'rejected'],
      default: 'approved',
      index: true,
    },
    notes: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    rawSpeech: { type: String, default: '' },
  },
  { timestamps: true }
);

entrySchema.index({ shopId: 1, status: 1, deletedAt: 1 });
entrySchema.index({ customer: 1, type: 1, date: 1 });

entrySchema.virtual('remaining').get(function remaining() {
  if (this.type !== 'sale') return 0;
  return Math.max(0, this.amount - (this.settledAmount || 0));
});

// Computed total from items array (server-side)
entrySchema.virtual('itemsTotal').get(function itemsTotal() {
  if (!this.items || !this.items.length) return this.amount;
  return this.items.reduce((s, it) => s + (it.amount || 0), 0);
});

// Friendly label for display
entrySchema.virtual('itemLabel').get(function itemLabel() {
  if (this.items && this.items.length) {
    return this.items.map((it) => it.name || 'सामान').join(', ');
  }
  return this.item || 'सामान';
});

entrySchema.set('toJSON', { virtuals: true });
entrySchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Entry', entrySchema);
