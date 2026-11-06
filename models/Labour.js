const mongoose = require('mongoose');

const labourSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: '', trim: true },
    shopId: { type: String, required: true, index: true }, // 'shop1', 'shop2', or 'all'
    roleTitle: { type: String, default: 'कारीगर', trim: true }, // कारीगर, हेल्पर, दर्जी, मास्टर, पल्लेदार
    wageType: { type: String, enum: ['monthly', 'daily'], default: 'monthly' },
    wageAmount: { type: Number, default: 0 }, // e.g. 12000/month or 500/day
    joiningDate: { type: Date, default: () => new Date() },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
    totalEarned: { type: Number, default: 0 }, // accrued salary / wages credited
    totalPaid: { type: Number, default: 0 }, // advance + salary payments given
    balance: { type: Number, default: 0 }, // totalEarned - totalPaid (positive = pending owed to labour, negative = advance with labour)
    notes: { type: String, default: '', trim: true },
    isArchived: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

labourSchema.index({ name: 'text', roleTitle: 'text', phone: 'text' });
labourSchema.index({ shopId: 1, isArchived: 1, status: 1 });

module.exports = mongoose.model('Labour', labourSchema);
