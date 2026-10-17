/**
 * routes/admin.js
 *
 * Dedicated admin routes protected by requireAuth + requireAdmin.
 *
 * Features:
 *   • GET  /api/admin/overview         - Cross-shop reporting & metrics
 *   • GET  /api/admin/audit-log        - Complete logs including soft-deleted entries
 *   • POST /api/admin/restore-entry/:id - Manual soft-delete override (restore)
 *   • GET  /api/admin/export           - Data export (CSV / JSON)
 */

const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const Customer = require('../models/Customer');
const Entry = require('../models/Entry');
const User = require('../models/User');

const router = express.Router();
router.use(requireAuth);
router.use(requireAdmin);

// ── GET /api/admin/overview ───────────────────────────────────────
router.get('/overview', async (req, res) => {
  try {
    const totalCustomers = await Customer.countDocuments();

    // Aggregation grouped by shop and type (active approved entries only)
    const stats = await Entry.aggregate([
      { $match: { deleted: false, status: { $ne: 'pending_admin_approval' } } },
      {
        $group: {
          _id: { shop: '$shop', type: '$type' },
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);

    // IST Day Boundary for Today's Collections
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    const istStartOfDay = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()) - istOffset);

    const todayPaymentsAgg = await Entry.aggregate([
      {
        $match: {
          deleted: false,
          type: 'payment',
          status: { $ne: 'pending_admin_approval' },
          date: { $gte: istStartOfDay },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);
    const todayCollections = todayPaymentsAgg[0]?.total || 0;

    // Active pending accounts (customers with net dues > 0)
    const customerBalanceAgg = await Entry.aggregate([
      { $match: { deleted: false, status: { $ne: 'pending_admin_approval' } } },
      {
        $group: {
          _id: '$customer',
          totalSales: { $sum: { $cond: [{ $eq: ['$type', 'sale'] }, '$amount', 0] } },
          totalPayments: { $sum: { $cond: [{ $eq: ['$type', 'payment'] }, '$amount', 0] } },
        },
      },
      {
        $project: {
          balance: { $subtract: ['$totalSales', '$totalPayments'] },
        },
      },
      {
        $match: {
          balance: { $gt: 0 },
        },
      },
      {
        $count: 'activeCount',
      },
    ]);
    const activePendingAccounts = customerBalanceAgg[0]?.activeCount || 0;

    const report = {
      shop1: { sales: 0, payments: 0, salesCount: 0, paymentsCount: 0 },
      shop2: { sales: 0, payments: 0, salesCount: 0, paymentsCount: 0 },
      grand: { sales: 0, payments: 0, balance: 0 },
      totalCustomers,
      todayCollections,
      activePendingAccounts,
      deletedEntriesCount: await Entry.countDocuments({ deleted: true }),
      pendingOcrCount:     await Entry.countDocuments({ status: 'pending_admin_approval', deleted: false }),
      totalEntriesCount:   await Entry.countDocuments(),
    };

    for (const s of stats) {
      const shop = s._id.shop;
      const type = s._id.type;
      if (shop === 'shop1' || shop === 'shop2') {
        if (type === 'sale') {
          report[shop].sales += s.totalAmount;
          report[shop].salesCount += s.count;
          report.grand.sales += s.totalAmount;
        } else if (type === 'payment') {
          report[shop].payments += s.totalAmount;
          report[shop].paymentsCount += s.count;
          report.grand.payments += s.totalAmount;
        }
      }
    }

    report.shop1.balance = report.shop1.sales - report.shop1.payments;
    report.shop2.balance = report.shop2.sales - report.shop2.payments;
    report.grand.balance = report.grand.sales - report.grand.payments;

    res.json(report);
  } catch (err) {
    console.error('Admin overview error:', err);
    res.status(500).json({ error: 'एडमिन रिपोर्ट लोड नहीं हो सकी' });
  }
});

// ── POST /api/admin/adjust-balance ────────────────────────────────
router.post('/adjust-balance', async (req, res) => {
  try {
    const { customerId, shop, type, amount, note } = req.body;
    if (!customerId || !amount || Number(amount) <= 0 || !['sale', 'payment'].includes(type)) {
      return res.status(400).json({ error: 'अमान्य विवरण (Invalid adjustment data)' });
    }
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ error: 'ग्राहक नहीं मिला' });
    }
    const entry = new Entry({
      customer: customerId,
      shop: shop || req.user.shop || 'shop1',
      type,
      amount: Math.round(Number(amount)),
      item: 'संतुलन समायोजन (Admin Balance Adjustment)',
      note: note || 'मालिक द्वारा खाता समायोजन',
      date: new Date(),
      createdBy: req.user.userId,
      status: 'approved',
    });
    await entry.save();
    await entry.populate('customer', 'name village');
    res.json({ message: 'खाता सफलतापूर्वक समायोजित किया गया', entry });
  } catch (err) {
    console.error('Balance adjustment error:', err);
    res.status(500).json({ error: 'समायोजन विफल' });
  }
});

// ── GET /api/admin/audit-log ──────────────────────────────────────
router.get('/audit-log', async (req, res) => {
  try {
    const filter = {};
    if (req.query.deletedOnly === 'true') {
      filter.deleted = true;
    }

    const entries = await Entry.find(filter)
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(100)
      .populate('customer', 'name village phone')
      .populate('createdBy', 'username displayName')
      .populate('deletedBy', 'username displayName')
      .lean();

    res.json(entries);
  } catch (err) {
    console.error('Audit log error:', err);
    res.status(500).json({ error: 'ऑडिट लॉग लोड नहीं हो सका' });
  }
});

// ── POST /api/admin/restore-entry/:id ─────────────────────────────
router.post('/restore-entry/:id', async (req, res) => {
  try {
    const entry = await Entry.findById(req.params.id);
    if (!entry) {
      return res.status(404).json({ error: 'हिसाब नहीं मिला' });
    }

    entry.deleted = false;
    entry.deletedAt = null;
    entry.deletedBy = null;
    await entry.save();

    await entry.populate('customer', 'name village');
    res.json({ message: 'हिसाब वापस चालू हो गया', entry });
  } catch (err) {
    console.error('Restore error:', err);
    res.status(500).json({ error: 'हिसाब बहाल नहीं हो सका' });
  }
});

// ── GET /api/admin/export ─────────────────────────────────────────
router.get('/export', async (req, res) => {
  try {
    const format = req.query.format === 'csv' ? 'csv' : 'json';

    const customers = await Customer.find().sort({ name: 1 }).lean();
    const entries = await Entry.find()
      .sort({ date: -1, createdAt: -1 })
      .populate('customer', 'name village phone')
      .populate('createdBy', 'username displayName')
      .lean();

    if (format === 'json') {
      res.setHeader('Content-Disposition', `attachment; filename="khata-backup-${new Date().toISOString().slice(0, 10)}.json"`);
      return res.json({ customers, entries });
    }

    // CSV format
    const rows = [];
    rows.push(['ID', 'Date', 'Customer Name', 'Village', 'Shop', 'Type', 'Amount (INR)', 'Item', 'Meters', 'Note', 'Status', 'Created By'].join(','));

    for (const e of entries) {
      const row = [
        `"${e._id}"`,
        `"${e.date ? new Date(e.date).toLocaleDateString('en-IN') : ''}"`,
        `"${(e.customer?.name || '').replace(/"/g, '""')}"`,
        `"${(e.customer?.village || '').replace(/"/g, '""')}"`,
        `"${e.shop}"`,
        `"${e.type}"`,
        e.amount || 0,
        `"${(e.item || '').replace(/"/g, '""')}"`,
        e.meters || '',
        `"${(e.note || '').replace(/"/g, '""')}"`,
        `"${e.deleted ? 'DELETED' : 'ACTIVE'}"`,
        `"${(e.createdBy?.displayName || e.createdBy?.username || '').replace(/"/g, '""')}"`,
      ];
      rows.push(row.join(','));
    }

    const csvContent = '\uFEFF' + rows.join('\r\n'); // Add UTF-8 BOM for Excel Hindi support
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="khata-export-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csvContent);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'डेटा डाउनलोड नहीं हो सका' });
  }
});

module.exports = router;
