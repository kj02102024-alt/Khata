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
  [query('q').trim().notEmpty().withMessage('खोज के लिए कुछ लिखें')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const q = req.query.q.trim();

    try {
      let customers;

      if (q.length >= 2) {
        // Text index search — matches anywhere in name or village.
        customers = await Customer.find(
          { $text: { $search: q } },
          { score: { $meta: 'textScore' } }
        )
          .sort({ score: { $meta: 'textScore' } })
          .limit(20)
          .lean();
      } else {
        // Single-character: regex prefix on name (text index needs ≥2 chars)
        const re = new RegExp(q, 'i');
        customers = await Customer.find({
          $or: [{ name: re }, { village: re }],
        })
          .limit(20)
          .lean();
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

      // Balance via aggregation (sales − payments, deleted excluded)
      const [balanceResult] = await Entry.aggregate([
        { $match: { customer: customer._id, deleted: false } },
        {
          $group: {
            _id: null,
            totalSales:    { $sum: { $cond: [{ $eq: ['$type', 'sale']    }, '$amount', 0] } },
            totalPayments: { $sum: { $cond: [{ $eq: ['$type', 'payment'] }, '$amount', 0] } },
          },
        },
        {
          $project: {
            _id: 0,
            balance: { $subtract: ['$totalSales', '$totalPayments'] },
            totalSales: 1,
            totalPayments: 1,
          },
        },
      ]);

      const balance = balanceResult?.balance        ?? 0;
      const totalSales = balanceResult?.totalSales     ?? 0;
      const totalPayments = balanceResult?.totalPayments ?? 0;

      res.json({ customer, entries, balance, totalSales, totalPayments });
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
