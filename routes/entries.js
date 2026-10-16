/**
 * routes/entries.js
 *
 * All routes require a valid JWT.  req.user.shop is used for:
 *   • setting the shop field when creating an entry
 *   • setting deletedBy on undo
 *
 * POST /api/entries
 *   Add a new entry (sale or payment).
 *   The frontend shows a confirmation screen; this endpoint is only
 *   called after the user taps "हाँ, सेव करें".
 *
 * POST /api/entries/undo
 *   Soft-delete the most recent non-deleted entry created by THIS
 *   shop's login.  "Last entry" means the entry with the highest
 *   createdAt among entries where deleted === false.
 *   Never physically removes a document.
 *
 * GET  /api/entries/today
 *   All non-deleted entries created today (IST midnight to now),
 *   from any shop, newest first, with customer name populated.
 */

const express  = require('express');
const { body, validationResult } = require('express-validator');

const requireAuth = require('../middleware/auth');
const Entry       = require('../models/Entry');

const router = express.Router();
router.use(requireAuth);

// ── POST /api/entries ─────────────────────────────────────────────
const entryValidation = [
  body('customerId').isMongoId().withMessage('गलत ग्राहक ID'),
  body('type').isIn(['sale', 'payment']).withMessage('प्रकार: sale या payment'),
  body('amount')
    .isInt({ min: 1 }).withMessage('राशि कम से कम ₹1 होनी चाहिए'),
  body('date').optional().isISO8601().withMessage('दिनांक गलत है'),
  body('item').optional().trim().isLength({ max: 200 }),
  body('meters').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('note').optional().trim().isLength({ max: 500 }),
  body('photo').optional().isString(),
  // Textile fields
  body('category')
    .optional()
    .isIn(['pant_shirt', 'saree', 'blanket_bedsheet', 'suiting_shirting', 'readymade', 'other'])
    .withMessage('श्रेणी गलत है'),
  body('quantity').optional({ checkFalsy: true }).isInt({ min: 0 }),
  body('brand').optional().trim().isLength({ max: 100 }),
  body('designNumber').optional().trim().isLength({ max: 100 }),
  body('rate').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('dueDate').optional({ checkFalsy: true }).isISO8601().withMessage('देय तिथि गलत है'),
];

router.post('/', entryValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  const {
    customerId, type, amount, date,
    item = '', meters = null, note = '', photo = '',
    category = 'other', quantity = null, brand = '', designNumber = '',
    rate = null, dueDate = null,
  } = req.body;

  try {
    const entryDate = date ? new Date(date) : new Date();

    const entry = await Entry.create({
      customer:     customerId,
      shop:         req.user.shop,
      type,
      amount:       Math.round(Number(amount)),
      date:         entryDate,
      item,
      meters:       meters !== null ? Number(meters) : null,
      note,
      photo,
      category,
      quantity:     quantity !== null ? Math.round(Number(quantity)) : null,
      brand,
      designNumber,
      rate:         rate !== null ? Number(rate) : null,
      dueDate:      dueDate ? new Date(dueDate) : null,
      createdBy:    req.user.userId,
    });

    // Populate customer name so the frontend can show it immediately
    await entry.populate('customer', 'name village');

    res.status(201).json(entry);
  } catch (err) {
    console.error('Create entry error:', err);
    res.status(500).json({ error: 'हिसाब सेव नहीं हुआ' });
  }
});

// ── POST /api/entries/undo ────────────────────────────────────────
router.post('/undo', async (req, res) => {
  try {
    const query = {
      shop:    req.user.shop,
      deleted: false,
    };
    if (req.body.customerId) {
      query.customer = req.body.customerId;
    }

    const last = await Entry.findOne(query).sort({ createdAt: -1 });

    if (!last) {
      return res.status(404).json({ error: 'पिछला हिसाब नहीं मिला' });
    }

    last.deleted   = true;
    last.deletedAt = new Date();
    last.deletedBy = req.user.userId;
    await last.save();

    await last.populate('customer', 'name village');
    res.json({ message: 'हिसाब रद्द हो गया', entry: last });
  } catch (err) {
    console.error('Undo error:', err);
    res.status(500).json({ error: 'रद्द नहीं हो सका' });
  }
});

// ── POST /api/entries/undo-payment ────────────────────────────────
router.post('/undo-payment', async (req, res) => {
  try {
    const query = {
      type:    'payment',
      deleted: false,
    };
    // If specific customer or shop passed
    if (req.body.customerId) {
      query.customer = req.body.customerId;
    } else {
      query.shop = req.user.shop;
    }

    const lastPayment = await Entry.findOne(query).sort({ createdAt: -1 });

    if (!lastPayment) {
      return res.status(404).json({ error: 'रद्द करने के लिए कोई भुगतान नहीं मिला' });
    }

    lastPayment.deleted   = true;
    lastPayment.deletedAt = new Date();
    lastPayment.deletedBy = req.user.userId;
    await lastPayment.save();

    await lastPayment.populate('customer', 'name village');
    res.json({ message: 'भुगतान रद्द हो गया', entry: lastPayment });
  } catch (err) {
    console.error('Undo payment error:', err);
    res.status(500).json({ error: 'भुगतान रद्द नहीं हो सका' });
  }
});

// ── GET /api/entries/today ────────────────────────────────────────
router.get('/today', async (req, res) => {
  try {
    // Build IST midnight as a UTC Date.
    const now    = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // ms
    const istNow = new Date(now.getTime() + istOffset);

    const istMidnight = new Date(
      Date.UTC(
        istNow.getUTCFullYear(),
        istNow.getUTCMonth(),
        istNow.getUTCDate()
      ) - istOffset
    );

    const entries = await Entry.find({
      deleted:   false,
      createdAt: { $gte: istMidnight },
    })
      .sort({ createdAt: -1 })
      .populate('customer', 'name village')
      .lean();

    res.json(entries);
  } catch (err) {
    console.error('Today error:', err);
    res.status(500).json({ error: 'आज का हिसाब नहीं आया' });
  }
});

// ── GET /api/entries/today-payments ───────────────────────────────
router.get('/today-payments', async (req, res) => {
  try {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);

    const istMidnight = new Date(
      Date.UTC(
        istNow.getUTCFullYear(),
        istNow.getUTCMonth(),
        istNow.getUTCDate()
      ) - istOffset
    );

    const payments = await Entry.find({
      type:      'payment',
      deleted:   false,
      createdAt: { $gte: istMidnight },
    })
      .sort({ createdAt: -1 })
      .populate('customer', 'name village')
      .lean();

    let grandTotal = 0;
    let shop1Total = 0;
    let shop2Total = 0;
    const shop1Entries = [];
    const shop2Entries = [];

    for (const p of payments) {
      grandTotal += p.amount;
      if (p.shop === 'shop1') {
        shop1Total += p.amount;
        shop1Entries.push(p);
      } else if (p.shop === 'shop2') {
        shop2Total += p.amount;
        shop2Entries.push(p);
      }
    }

    res.json({
      grandTotal,
      shop1Total,
      shop2Total,
      shop1Entries,
      shop2Entries,
      allPayments: payments,
    });
  } catch (err) {
    console.error('Today payments error:', err);
    res.status(500).json({ error: 'आज के पैसे की जानकारी नहीं मिली' });
  }
});

module.exports = router;
