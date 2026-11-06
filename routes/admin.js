const express = require('express');
const Entry = require('../models/Entry');
const Customer = require('../models/Customer');
const AuditLog = require('../models/AuditLog');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/metrics', requireAdmin, async (req, res) => {
  try {
    const shopFilter = req.query.shopId ? { shopId: req.query.shopId } : {};

    const customers = await Customer.find({ ...shopFilter, isArchived: false, balance: { $gt: 0 } });
    const totalOutstanding = customers.reduce((s, c) => s + (c.balance || 0), 0);

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const todayPayments = await Entry.find({
      ...shopFilter,
      type: 'payment',
      status: 'approved',
      deletedAt: null,
      date: { $gte: start },
    });
    const todayCollections = todayPayments.reduce((s, e) => s + e.amount, 0);

    const activeCustomers = customers.length;
    const pendingPhotos = await Entry.countDocuments({
      ...shopFilter,
      status: 'pending_admin_review',
      deletedAt: null,
      imageUrl: { $ne: null },
    });

    const byShop = await Customer.aggregate([
      { $match: { balance: { $gt: 0 } } },
      { $group: { _id: '$shopId', outstanding: { $sum: '$balance' }, count: { $sum: 1 } } },
    ]);

    res.json({
      totalOutstanding: Math.round(totalOutstanding * 100) / 100,
      todayCollections: Math.round(todayCollections * 100) / 100,
      activeCustomers,
      pendingPhotos,
      byShop,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Metrics failed' });
  }
});

router.get('/audit', requireAdmin, async (req, res) => {
  try {
    const filter = {};
    if (req.query.shopId) filter.shopId = req.query.shopId;
    const logs = await AuditLog.find(filter)
      .populate('userId', 'username role')
      .sort({ createdAt: -1 })
      .limit(Number(req.query.limit) || 100);
    res.json({ logs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Audit failed' });
  }
});

router.get('/ledger', requireAdmin, async (req, res) => {
  try {
    const filter = {};
    if (req.query.shopId) filter.shopId = req.query.shopId;
    if (req.query.deletedOnly === '1') filter.deletedAt = { $ne: null };
    else if (req.query.includeDeleted !== '1') filter.deletedAt = null;
    if (req.query.status) filter.status = req.query.status;
    else if (req.query.deletedOnly !== '1') filter.status = 'approved';

    const entries = await Entry.find(filter)
      .populate('customer')
      .sort({ date: -1 })
      .limit(Number(req.query.limit) || 200);
    res.json({ entries });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ledger failed' });
  }
});


module.exports = router;
