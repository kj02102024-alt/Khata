const express = require('express');
const Entry = require('../models/Entry');
const Customer = require('../models/Customer');
const AuditLog = require('../models/AuditLog');
const DiaryImage = require('../models/DiaryImage');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── GET /metrics ────────────────────────────────────────────────────────────
router.get('/metrics', requireAdmin, async (req, res) => {
  try {
    const shopFilter = req.query.shopId && req.query.shopId !== 'all' ? { shopId: req.query.shopId } : {};

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
    const todayCollections = todayPayments.reduce((s, e) => s + (e.amount || 0), 0);

    const todayCredits = await Entry.find({
      ...shopFilter,
      type: { $in: ['credit', 'sale'] },
      status: 'approved',
      deletedAt: null,
      date: { $gte: start },
    });
    const todayCredit = todayCredits.reduce((s, e) => s + (e.amount || 0), 0);

    const activeCustomers = customers.length;
    const diaryPending = await DiaryImage.countDocuments({
      ...shopFilter,
      status: 'pending',
    });
    const entryPending = await Entry.countDocuments({
      ...shopFilter,
      status: 'pending_admin_review',
      deletedAt: null,
    });
    const pendingPhotos = diaryPending + entryPending;

    const byShop = await Customer.aggregate([
      { $match: { balance: { $gt: 0 } } },
      { $group: { _id: '$shopId', outstanding: { $sum: '$balance' }, count: { $sum: 1 } } },
    ]);

    // 7-day trend (Credit vs Collections)
    const trend = [];
    for (let i = 6; i >= 0; i--) {
      const dStart = new Date();
      dStart.setDate(dStart.getDate() - i);
      dStart.setHours(0, 0, 0, 0);
      const dEnd = new Date(dStart);
      dEnd.setHours(23, 59, 59, 999);

      const dayEntries = await Entry.find({
        ...shopFilter,
        status: 'approved',
        deletedAt: null,
        date: { $gte: dStart, $lte: dEnd },
      });

      let cSum = 0, pSum = 0;
      dayEntries.forEach(e => {
        if (e.type === 'payment') pSum += (e.amount || 0);
        else cSum += (e.amount || 0);
      });

      const dayLabel = dStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      trend.push({
        date: dayLabel,
        credit: Math.round(cSum),
        collection: Math.round(pSum),
      });
    }

    res.json({
      totalOutstanding: Math.round(totalOutstanding * 100) / 100,
      todayCredit: Math.round(todayCredit * 100) / 100,
      todayCollections: Math.round(todayCollections * 100) / 100,
      activeCustomers,
      pendingPhotos,
      byShop,
      trend,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Metrics failed' });
  }
});

// ── GET /aging ──────────────────────────────────────────────────────────────
router.get('/aging', requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const shopFilter = req.query.shopId && req.query.shopId !== 'all' ? { shopId: req.query.shopId } : {};
    const customers = await Customer.find({ ...shopFilter, isArchived: false, balance: { $gt: 0 } });

    const buckets = [
      { label: '0-30 days', min: 0, max: 30, count: 0, total: 0, color: '#10b981' },
      { label: '31-60 days', min: 31, max: 60, count: 0, total: 0, color: '#3b82f6' },
      { label: '61-90 days', min: 61, max: 90, count: 0, total: 0, color: '#f59e0b' },
      { label: '90+ days', min: 91, max: Infinity, count: 0, total: 0, color: '#ef4444' },
    ];

    for (const c of customers) {
      const ageMs = now - new Date(c.createdAt);
      const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
      const bucket = buckets.find(b => ageDays >= b.min && ageDays <= b.max);
      if (bucket) {
        bucket.count++;
        bucket.total += c.balance || 0;
      }
    }

    buckets.forEach(b => {
      b.total = Math.round(b.total * 100) / 100;
    });

    res.json({ buckets });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Aging failed' });
  }
});

// ── GET /village-stats ───────────────────────────────────────────────────────
router.get('/village-stats', requireAdmin, async (req, res) => {
  try {
    const match = { isArchived: false, balance: { $gt: 0 } };
    if (req.query.shopId && req.query.shopId !== 'all') {
      match.shopId = req.query.shopId;
    }
    const rows = await Customer.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $ifNull: ['$village', 'अज्ञात'] },
          outstanding: { $sum: '$balance' },
          count: { $sum: 1 },
        },
      },
      { $sort: { outstanding: -1 } },
      {
        $project: {
          _id: 0,
          village: { $cond: [{ $eq: ['$_id', ''] }, 'अन्य / खाली', '$_id'] },
          outstanding: { $round: ['$outstanding', 2] },
          count: 1,
        },
      },
      { $limit: 20 },
    ]);
    res.json({ villages: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Village stats failed' });
  }
});

// ── GET /audit ──────────────────────────────────────────────────────────────
router.get('/audit', requireAdmin, async (req, res) => {
  try {
    const filter = {};
    if (req.query.shopId && req.query.shopId !== 'all') filter.shopId = req.query.shopId;
    if (req.query.action && req.query.action !== 'all') filter.action = req.query.action;
    const logs = await AuditLog.find(filter)
      .populate('userId', 'username role displayName displayNameHi')
      .sort({ createdAt: -1 })
      .limit(Number(req.query.limit) || 100);
    res.json({ logs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Audit failed' });
  }
});

// ── GET /ledger ─────────────────────────────────────────────────────────────
router.get('/ledger', requireAdmin, async (req, res) => {
  try {
    const filter = {};
    if (req.query.shopId && req.query.shopId !== 'all') filter.shopId = req.query.shopId;
    if (req.query.deletedOnly === '1') filter.deletedAt = { $ne: null };
    else if (req.query.includeDeleted !== '1') filter.deletedAt = null;
    
    if (req.query.status && req.query.status !== 'all') {
      filter.status = req.query.status;
    } else if (req.query.deletedOnly !== '1') {
      filter.status = 'approved';
    }

    if (req.query.type && req.query.type !== 'all') {
      if (req.query.type === 'credit') {
        filter.type = { $in: ['credit', 'sale'] };
      } else {
        filter.type = req.query.type;
      }
    }

    if (req.query.startDate || req.query.endDate) {
      filter.date = {};
      if (req.query.startDate) filter.date.$gte = new Date(req.query.startDate);
      if (req.query.endDate) {
        const end = new Date(req.query.endDate);
        end.setHours(23, 59, 59, 999);
        filter.date.$lte = end;
      }
    }

    // Search query
    if (req.query.q) {
      const q = req.query.q.trim();
      const numQ = Number(q);
      const orClauses = [
        { item: new RegExp(escapeRegex(q), 'i') },
        { category: new RegExp(escapeRegex(q), 'i') },
        { brand: new RegExp(escapeRegex(q), 'i') },
        { 'items.name': new RegExp(escapeRegex(q), 'i') },
        { note: new RegExp(escapeRegex(q), 'i') },
      ];
      if (!isNaN(numQ) && numQ > 0) {
        orClauses.push({ amount: numQ });
      }

      const matchingCusts = await Customer.find({
        $or: [
          { name: new RegExp(escapeRegex(q), 'i') },
          { alias: new RegExp(escapeRegex(q), 'i') },
          { village: new RegExp(escapeRegex(q), 'i') },
          { phone: new RegExp(escapeRegex(q), 'i') },
          { identifierNote: new RegExp(escapeRegex(q), 'i') },
        ],
      }).select('_id');

      if (matchingCusts.length) {
        orClauses.push({ customer: { $in: matchingCusts.map(c => c._id) } });
      }

      filter.$or = orClauses;
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(500, Number(req.query.limit) || 50);
    const total = await Entry.countDocuments(filter);

    const entries = await Entry.find(filter)
      .populate('customer')
      .sort({ date: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      entries,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ledger failed' });
  }
});

module.exports = router;
