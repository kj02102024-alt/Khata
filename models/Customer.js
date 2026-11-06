const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    // --- New fields (§5) ---
    honorific: { type: String, enum: ['श्री', 'श्रीमती', 'कुमारी', ''], default: '' },
    diaryNo: { type: Number, default: null },
    identifierNote: { type: String, default: '', trim: true }, // "झोला वाले", "संजय पटेल की बहन"

    // --- Existing fields (kept) ---
    name: { type: String, required: true, trim: true },
    alias: { type: String, default: '', trim: true },
    village: { type: String, default: '', trim: true, index: true },
    phone: { type: String, default: '', trim: true },
    mobile2: { type: String, default: '', trim: true },
    shopId: { type: String, required: true, index: true },
    relationNote: { type: String, default: '', trim: true }, // kept for backward compat
    isArchived: { type: Boolean, default: false },
    balance: { type: Number, default: 0 },
  },
  { timestamps: true }
);

customerSchema.index({ name: 1, village: 1, shopId: 1 });
customerSchema.index({ alias: 1, shopId: 1 });
customerSchema.index({ diaryNo: 1, shopId: 1 });
customerSchema.index({ phone: 1, shopId: 1 });
customerSchema.index({ name: 'text', alias: 'text', village: 'text', identifierNote: 'text' });

customerSchema.virtual('displayName').get(function displayName() {
  const parts = [];
  if (this.honorific) parts.push(this.honorific);
  parts.push(this.name);
  const note = this.identifierNote || this.relationNote;
  if (note) parts.push(`(${note})`);
  return parts.join(' ');
});

customerSchema.set('toJSON', { virtuals: true });
customerSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Customer', customerSchema);
