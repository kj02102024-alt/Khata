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
  body('date').isISO8601().withMessage('दिनांक गलत है'),
  body('item').optional().trim().isLength({ max: 200 }),
  body('meters').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('note').optional().trim().isLength({ max: 500 }),
];

router.post('/', entryValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  const { customerId, type, amount, date, item = '', meters = null, note = '' } = req.body;

  try {
    const entry = await Entry.create({
      customer:  customerId,
      shop:      req.user.shop,
      type,
      amount:    Math.round(Number(amount)),
      date:      new Date(date),
      item,
      meters:    meters !== null ? Number(meters) : null,
      note,
      createdBy: req.user.userId,
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
    // Find the most recent non-deleted entry created by this user's shop
    const last = await Entry.findOne({
      shop:    req.user.shop,
      deleted: false,
    }).sort({ createdAt: -1 });

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

// ── GET /api/entries/today ────────────────────────────────────────
router.get('/today', async (req, res) => {
  try {
    // Build IST midnight as a UTC Date.
    // IST = UTC+5:30, so IST midnight = UTC 18:30 of the previous day.
    const now    = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // ms
    const istNow = new Date(now.getTime() + istOffset);

    // IST midnight expressed in UTC
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

module.exports = router;
