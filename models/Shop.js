const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema(
  {
    shopId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    nameHi: { type: String, required: true },
    // Admin contact number shown on PIN-forgot screen
    adminPhone: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Shop', shopSchema);
