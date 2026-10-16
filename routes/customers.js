/**
 * routes/customers.js
 *
 * All routes require a valid JWT (requireAuth middleware).
 *
 * GET  /api/customers/search?q=<query>
 *   Live search by name or village.  Returns up to 20 matches.
 *   Uses MongoDB $text search when query ≥ 2 chars (uses the text index),
 *   which handles partial Devanagari word matches well.
 *
 * GET  /api/customers/:id
 *   Returns customer fields.
 *
 * GET  /api/customers/:id/detail
 *   Returns customer + all non-deleted entries (newest first) + balance.
 *   Balance is computed with an aggregation pipeline so it's always
 *   consistent with what's stored in the DB.
 *
 * POST /api/customers
 *   Create a new customer (name required, village + phone optional).
 */

const express  = require('express');
const { body, query, param, validationResult } = require('express-validator');

const requireAuth = require('../middleware/auth');
const Customer    = require('../models/Customer');
const Entry       = require('../models/Entry');

const router = express.Router();
router.use(requireAuth);   // every customer route needs auth

// ── GET /api/customers/search?q= ─────────────────────────────────
router.get(
  '/search',
  [
    query('q').optional().trim(),
    query('pendingOnly').optional().isBoolean(),
  ],
  async (req, res) => {
    const q = (req.query.q || '').trim();
    const pendingOnly = req.query.pendingOnly === 'true';

    try {
      let customers = [];

      if (!q) {
        // If query is empty, return latest customers (up to 30)
        customers = await Customer.find().sort({ updatedAt: -1 }).limit(30).lean();
      } else if (q.length >= 2) {
        // Text index search — matches anywhere in name or village.
        customers = await Customer.find(
          { $text: { $search: q } },
          { score: { $meta: 'textScore' } }
        )
          .sort({ score: { $meta: 'textScore' } })
          .limit(30)
          .lean();
      } else {
        // Single-character: regex prefix on name or village
        const re = new RegExp(q, 'i');
        customers = await Customer.find({
          $or: [{ name: re }, { village: re }],
        })
          .limit(30)
          .lean();
      }

      // Compute balances for these customers
      if (customers.length > 0) {
        const customerIds = customers.map(c => c._id);
        const balances = await Entry.aggregate([
          { $match: { customer: { $in: customerIds }, deleted: false } },
          {
            $group: {
              _id: '$customer',
              totalSales: { $sum: { $cond: [{ $eq: ['$type', 'sale'] }, '$amount', 0] } },
              totalPayments: { $sum: { $cond: [{ $eq: ['$type', 'payment'] }, '$amount', 0] } },
            },
          },
        ]);

        const balanceMap = new Map();
        for (const b of balances) {
          balanceMap.set(String(b._id), {
            balance: b.totalSales - b.totalPayments,
            totalSales: b.totalSales,
            totalPayments: b.totalPayments,
          });
        }

        customers = customers.map(c => {
          const stats = balanceMap.get(String(c._id)) || { balance: 0, totalSales: 0, totalPayments: 0 };
          return {
            ...c,
            balance: stats.balance,
            dues: stats.balance > 0 ? stats.balance : 0,
            advance: stats.balance < 0 ? Math.abs(stats.balance) : 0,
            totalSales: stats.totalSales,
            totalPayments: stats.totalPayments,
          };
        });

        if (pendingOnly) {
          customers = customers.filter(c => c.balance > 0);
        }
      }

      res.json(customers);
    } catch (err) {
      console.error('Search error:', err);
      res.status(500).json({ error: 'खोज में समस्या आई' });
    }
  }
);

// ── GET /api/customers/:id/detail ────────────────────────────────
router.get(
  '/:id/detail',
  [param('id').isMongoId().withMessage('गलत ग्राहक ID')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    try {
      const customer = await Customer.findById(req.params.id).lean();
      if (!customer) {
        return res.status(404).json({ error: 'ग्राहक नहीं मिला' });
      }

      // All non-deleted entries, newest first
      const entries = await Entry.find({
        customer: req.params.id,
        deleted: false,
      })
        .sort({ date: -1, createdAt: -1 })
        .lean();

      // Separate sales in ascending order (oldest first) for FIFO reconciliation
      const salesAsc = entries
        .filter(e => e.type === 'sale')
        .slice()
        .sort((a, b) => new Date(a.date) - new Date(b.date) || new Date(a.createdAt) - new Date(b.createdAt));

      const totalSales = salesAsc.reduce((sum, s) => sum + s.amount, 0);
      const totalPayments = entries
        .filter(e => e.type === 'payment')
        .reduce((sum, p) => sum + p.amount, 0);

      const balance = totalSales - totalPayments;
      const dues = balance > 0 ? balance : 0;
      const advance = balance < 0 ? Math.abs(balance) : 0;

      // FIFO Reconciliation: apply total payments to sales from oldest to newest
      let remainingPaymentPool = totalPayments;
      const reconMap = new Map();

      for (const sale of salesAsc) {
        const saleAmt = sale.amount;
        if (remainingPaymentPool >= saleAmt) {
          reconMap.set(String(sale._id), {
            status: 'paid',
            paidAmount: saleAmt,
            remainingAmount: 0,
          });
          remainingPaymentPool -= saleAmt;
        } else if (remainingPaymentPool > 0) {
          reconMap.set(String(sale._id), {
            status: 'partly_paid',
            paidAmount: remainingPaymentPool,
            remainingAmount: saleAmt - remainingPaymentPool,
          });
          remainingPaymentPool = 0;
        } else {
          reconMap.set(String(sale._id), {
            status: 'unpaid',
            paidAmount: 0,
            remainingAmount: saleAmt,
          });
        }
      }

      // Attach reconciliation details to entries
      const reconciledEntries = entries.map(e => {
        if (e.type === 'sale') {
          const recon = reconMap.get(String(e._id)) || {
            status: 'unpaid',
            paidAmount: 0,
            remainingAmount: e.amount,
          };
          return { ...e, reconciliation: recon };
        }
        return e;
      });

      const paidSales = reconciledEntries.filter(e => e.type === 'sale' && e.reconciliation?.status === 'paid');
      const pendingSales = reconciledEntries.filter(e => e.type === 'sale' && e.reconciliation?.status !== 'paid');
      const payments = reconciledEntries.filter(e => e.type === 'payment');

      res.json({
        customer,
        entries: reconciledEntries,
        paidSales,
        pendingSales,
        payments,
        balance,
        dues,
        advance,
        totalSales,
        totalPayments,
      });
    } catch (err) {
      console.error('Detail error:', err);
      res.status(500).json({ error: 'जानकारी लाने में समस्या आई' });
    }
  }
);

// ── GET /api/customers/:id ────────────────────────────────────────
router.get(
  '/:id',
  [param('id').isMongoId().withMessage('गलत ग्राहक ID')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }
    try {
      const customer = await Customer.findById(req.params.id).lean();
      if (!customer) return res.status(404).json({ error: 'ग्राहक नहीं मिला' });
      res.json(customer);
    } catch (err) {
      res.status(500).json({ error: 'समस्या आई' });
    }
  }
);

// ── POST /api/customers ───────────────────────────────────────────
router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('ग्राहक का नाम जरूरी है'),
    body('village').trim().optional(),
    body('phone')
      .optional({ checkFalsy: true })
      .isMobilePhone('any')
      .withMessage('फोन नंबर सही नहीं है'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { name, village = '', phone = '' } = req.body;

    try {
      const customer = await Customer.create({ name, village, phone });
      res.status(201).json(customer);
    } catch (err) {
      console.error('Create customer error:', err);
      res.status(500).json({ error: 'ग्राहक नहीं बन सका' });
    }
  }
);

module.exports = router;
