const Entry = require('../models/Entry');
const Customer = require('../models/Customer');

/**
 * Apply a payment to oldest unpaid sales first (FIFO).
 * Returns settlement breakdown.
 */
async function applyFifoPayment(customerId, paymentAmount, shopId, meta = {}) {
  const sales = await Entry.find({
    customer: customerId,
    shopId,
    type: 'sale',
    status: 'approved',
    deletedAt: null,
    $expr: { $lt: ['$settledAmount', '$amount'] },
  }).sort({ date: 1, createdAt: 1 });

  let remaining = paymentAmount;
  const applied = [];

  for (const sale of sales) {
    if (remaining <= 0) break;
    const due = sale.amount - (sale.settledAmount || 0);
    const take = Math.min(due, remaining);
    sale.settledAmount = (sale.settledAmount || 0) + take;
    await sale.save();
    applied.push({ entryId: sale._id, applied: take, remainingOnSale: sale.amount - sale.settledAmount });
    remaining -= take;
  }

  await recalculateBalance(customerId);
  return { applied, leftover: remaining, meta };
}

async function recalculateBalance(customerId) {
  const entries = await Entry.find({
    customer: customerId,
    status: 'approved',
    deletedAt: null,
  });

  let balance = 0;
  for (const e of entries) {
    if (e.type === 'sale') balance += e.amount;
    else if (e.type === 'payment') balance -= e.amount;
    else if (e.type === 'adjustment') balance += e.amount;
  }

  const customer = await Customer.findById(customerId);
  if (customer) {
    customer.balance = Math.round(balance * 100) / 100;
    customer.isArchived = customer.balance <= 0.009;
    await customer.save();
  }
  return customer;
}

module.exports = { applyFifoPayment, recalculateBalance };
