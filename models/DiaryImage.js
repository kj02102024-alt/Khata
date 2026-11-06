const mongoose = require('mongoose');

const diaryRowSchema = new mongoose.Schema(
  {
    dateRaw: { type: String, default: '' },
    date: { type: Date, default: null },
    customerName: { type: String, default: '' },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    relationNote: { type: String, default: '' },
    village: { type: String, default: '' },
    mobile: { type: String, default: '' },
    item: { type: String, default: '' },
    brand: { type: String, default: '' },
    qty: { type: Number, default: 1 },
    unit: { type: String, default: 'piece' },
    amount: { type: Number, default: 0 },
    type: { type: String, enum: ['credit', 'payment'], default: 'credit' },
    crossedOut: { type: Boolean, default: false },
    unclear: { type: Boolean, default: false },
  },
  { _id: true }
);

const diaryImageSchema = new mongoose.Schema(
  {
    path: { type: String, required: true },
    shopId: { type: String, required: true, index: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: {
      type: String,
      enum: ['pending', 'draft', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    customerHint: { type: String, default: '' },
    rows: { type: [diaryRowSchema], default: [] },
    rejectReason: { type: String, default: '' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DiaryImage', diaryImageSchema);
