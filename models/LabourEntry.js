const mongoose = require('mongoose');

const labourEntrySchema = new mongoose.Schema(
  {
    labour: { type: mongoose.Schema.Types.ObjectId, ref: 'Labour', required: true, index: true },
    shopId: { type: String, required: true, index: true },
    date: { type: Date, default: () => new Date(), index: true },
    // type:
    // 'payment' = पैसा दिया (Advance / Salary payout given to labour)
    // 'salary_credit' = वेतन जोड़ा (Salary / Wage credited for work)
    type: { type: String, enum: ['payment', 'salary_credit'], default: 'payment', required: true },
    category: {
      type: String,
      enum: ['advance', 'salary', 'daily_wage', 'bonus', 'kharcha', 'other'],
      default: 'advance',
    },
    amount: { type: Number, required: true },
    paymentMode: { type: String, enum: ['cash', 'upi', 'bank', ''], default: 'cash' },
    description: { type: String, default: '', trim: true },
    runningBalance: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

labourEntrySchema.index({ labour: 1, date: 1 });

module.exports = mongoose.model('LabourEntry', labourEntrySchema);
