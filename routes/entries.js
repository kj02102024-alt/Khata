const express = require('express');
const path = require('path');
const multer = require('multer');
const Entry = require('../models/Entry');
const Customer = require('../models/Customer');
const AuditLog = require('../models/AuditLog');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { applyFifoPayment, recalculateBalance } = require('../services/fifo');
const { parseEntryFromSpeech } = require('../services/speechParse');

const router = express.Router();

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Images only'));
  },
});

function resolveShopId(req, bodyShop) {
  if (req.session.user.role === 'admin') return bodyShop || req.query.shopId || 'shop1';
  return req.session.user.shopId;
}

function validateMobile(s) {
  if (!s) return true; // optional
  const digits = String(s).replace(/\D/g, '');
  return digits.length === 10 && /^[6-9]/.test(digits);
}

function normalizePhone(s) {
  if (!s) return '';
  return String(s).replace(/\D/g, '').replace(/^91/, '').slice(0, 10);
}

router.post('/parse-speech', requireAuth, (req, res) => {
  const parsed = parseEntryFromSpeech(req.body?.text || '');
  res.json({ parsed });
});

/** Today's entry count for the status bar */
router.get('/today-count', requireAuth, async (req, res) => {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const sf = req.session.user.role === 'admin' ? {} : { shopId: req.session.user.shopId };
    const count = await Entry.countDocuments({
      ...sf,
      deletedAt: null,
      status: 'approved',
      createdAt: { $gte: start },
    });
    res.json({ count });
  } catch (err) {
    console.error(err);
    res.json({ count: 0 });
  }
});

/** Create a new entry — supports multi-item body (§5) */
router.post('/', requireAuth, async (req, res) => {
  try {
    const shopId = resolveShopId(req, req.body.shopId);
    let customerId = req.body.customerId;

    // Validate mobile if provided
    if (req.body.phone && !validateMobile(req.body.phone)) {
      return res.status(400).json({ error: 'Invalid mobile', errorHi: 'मोबाइल नंबर 10 अंक का होना चाहिए (6-9 से शुरू)' });
    }

    // Resolve / create customer
    if (!customerId && req.body.customerName) {
      const name = String(req.body.customerName).trim();
      let customer = await Customer.findOne({
        shopId,
        name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
      });
      if (!customer) {
        const last = await Customer.findOne({ shopId, diaryNo: { $ne: null } }).sort({ diaryNo: -1 }).select('diaryNo');
        customer = await Customer.create({
          name,
          honorific: req.body.honorific || '',
          identifierNote: req.body.identifierNote || req.body.relationNote || '',
          relationNote: req.body.relationNote || req.body.identifierNote || '',
          village: req.body.village || '',
          phone: normalizePhone(req.body.phone || ''),
          mobile2: normalizePhone(req.body.mobile2 || ''),
          diaryNo: req.body.diaryNo || (last?.diaryNo || 0) + 1,
          shopId,
        });
      } else {
        // Update any new fields supplied
        if (req.body.village && !customer.village) customer.village = req.body.village;
        if (req.body.phone && !customer.phone) customer.phone = normalizePhone(req.body.phone);
        if (req.body.identifierNote && !customer.identifierNote) customer.identifierNote = req.body.identifierNote;
        await customer.save();
      }
      customerId = customer._id;
    }

    if (!customerId) {
      return res.status(400).json({ error: 'Customer required', errorHi: 'ग्राहक चाहिए' });
    }

    // Determine type: 'sale' = उधार, 'payment' = जमा
    const type = req.body.type === 'payment' ? 'payment' : 'sale';

    // Build items array
    let items = [];
    if (Array.isArray(req.body.items) && req.body.items.length) {
      items = req.body.items.map((it) => ({
        name: it.name || '',
        brand: it.brand || '',
        qty: Number(it.qty) || 1,
        unit: it.unit || 'पीस',
        rate: Number(it.rate) || 0,
        amount: Number(it.amount) || 0,
      }));
    }

    // Compute total amount
    let amount = Number(req.body.amount);
    if (!amount && items.length) {
      amount = items.reduce((s, it) => s + (it.amount || 0), 0);
    }
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Amount required', errorHi: 'रकम चाहिए' });
    }

    // Validate required fields per type
    if (type === 'sale') {
      const hasItem = items.length > 0 || req.body.item;
      if (!hasItem) {
        // Not a hard error — carry on with generic item
      }
    }

    const entryDate = req.body.date ? new Date(req.body.date) : new Date();
    const entryTime = req.body.entryTime ? new Date(req.body.entryTime) : entryDate;
    let dueDate = null;
    if (req.body.dueDate) {
      const d = new Date(req.body.dueDate);
      if (!isNaN(d.getTime())) dueDate = d;
    } else if (req.body.dueDateDays && Number(req.body.dueDateDays) > 0) {
      dueDate = new Date(Date.now() + Number(req.body.dueDateDays) * 86400000);
    }
    const dueDateNote = req.body.dueDateNote || '';

    const entry = await Entry.create({
      customer: customerId,
      shopId,
      type,
      items,
      category: req.body.category || (items[0]?.name || req.body.item || ''),
      item: items[0]?.name || req.body.item || '',
      brand: items[0]?.brand || req.body.brand || '',
      meters: Number(req.body.meters) || 0,
      quantity: Number(req.body.quantity) || (items[0]?.qty || 1),
      rate: Number(req.body.rate) || (items[0]?.rate || 0),
      amount,
      entryTime,
      dueDate,
      dueDateNote,
      paymentMode: req.body.paymentMode || '',
      note: req.body.note || req.body.notes || '',
      notes: req.body.notes || req.body.note || '',
      enteredVia: req.body.enteredVia || '',
      date: entryDate,
      status: req.body.status || 'approved',
      rawSpeech: req.body.rawSpeech || '',
      createdBy: req.session.user.id,
      imageUrl: req.body.imageUrl || null,
    });

    let fifo = null;
    if (type === 'payment' && entry.status === 'approved') {
      fifo = await applyFifoPayment(customerId, amount, shopId, { entryId: entry._id });
    } else if (entry.status === 'approved') {
      await recalculateBalance(customerId);
    }

    await AuditLog.create({
      action: `entry.${type}.create`,
      entityType: 'Entry',
      entityId: entry._id,
      userId: req.session.user.id,
      shopId,
      details: { amount, type, status: entry.status, enteredVia: entry.enteredVia },
    });

    const populated = await Entry.findById(entry._id).populate('customer');

    // Fetch updated customer for balance info
    const customer = await Customer.findById(customerId);
    res.status(201).json({ entry: populated, fifo, customer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save entry' });
  }
});

/** Diary photo upload → pending_admin_review */
router.post('/diary-photo', requireAuth, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Photo required', errorHi: 'फोटो चाहिए' });
    }
    const shopId = resolveShopId(req, req.body.shopId);
    const imageUrl = `/uploads/${req.file.filename}`;
    let customerId = req.body.customerId || null;

    if (!customerId && req.body.customerName) {
      const name = String(req.body.customerName).trim();
      let customer = await Customer.findOne({ shopId, name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
      if (!customer) {
        customer = await Customer.create({ name, shopId, village: req.body.village || '' });
      }
      customerId = customer._id;
    }

    if (!customerId) {
      let placeholder = await Customer.findOne({ shopId, name: 'डायरी (बिना नाम)' });
      if (!placeholder) {
        placeholder = await Customer.create({ name: 'डायरी (बिना नाम)', shopId, alias: 'diary-untagged' });
      }
      customerId = placeholder._id;
    }

    const entry = await Entry.create({
      customer: customerId,
      shopId,
      type: 'sale',
      item: req.body.item || 'डायरी एंट्री',
      amount: Number(req.body.amount) || 0,
      date: new Date(),
      imageUrl,
      status: 'pending_admin_review',
      notes: req.body.notes || '',
      enteredVia: 'diary-photo',
      createdBy: req.session.user.id,
    });

    await AuditLog.create({
      action: 'entry.diary_upload',
      entityType: 'Entry',
      entityId: entry._id,
      userId: req.session.user.id,
      shopId,
      details: { imageUrl },
    });

    const populated = await Entry.findById(entry._id).populate('customer');
    res.status(201).json({ entry: populated, messageHi: 'फोटो भेज दी — एडमिन देखेंगे' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const filter = { deletedAt: null };
    if (req.session.user.role !== 'admin') filter.shopId = req.session.user.shopId;
    else if (req.query.shopId) filter.shopId = req.query.shopId;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.customerId) filter.customer = req.query.customerId;
    if (req.query.type) filter.type = req.query.type;

    const entries = await Entry.find(filter)
      .populate('customer')
      .sort({ date: -1, createdAt: -1 })
      .limit(Number(req.query.limit) || 100);
    res.json({ entries });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed' });
  }
});

router.get('/pending-review', requireAdmin, async (req, res) => {
  try {
    const filter = { status: 'pending_admin_review', deletedAt: null };
    if (req.query.shopId) filter.shopId = req.query.shopId;
    const entries = await Entry.find(filter)
      .populate('customer')
      .sort({ createdAt: 1 });
    res.json({ entries });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed' });
  }
});

router.post('/:id/approve', requireAdmin, async (req, res) => {
  try {
    const entry = await Entry.findById(req.params.id);
    if (!entry || entry.deletedAt) return res.status(404).json({ error: 'Not found' });

    const fields = ['customer', 'category', 'item', 'brand', 'meters', 'quantity', 'rate', 'amount', 'type', 'notes', 'date'];
    for (const f of fields) {
      if (req.body[f] !== undefined && req.body[f] !== '') {
        if (['meters', 'quantity', 'rate', 'amount'].includes(f)) entry[f] = Number(req.body[f]);
        else if (f === 'date') entry.date = new Date(req.body[f]);
        else entry[f] = req.body[f];
      }
    }
    if (req.body.customerId) entry.customer = req.body.customerId;

    // New fields
    if (req.body.paymentMode) entry.paymentMode = req.body.paymentMode;
    if (req.body.entryTime) entry.entryTime = new Date(req.body.entryTime);
    if (req.body.note) entry.note = req.body.note;

    entry.status = 'approved';
    entry.reviewedBy = req.session.user.id;
    entry.reviewedAt = new Date();
    if (!entry.amount || entry.amount <= 0) {
      return res.status(400).json({ error: 'Amount must be > 0 before approve' });
    }
    await entry.save();

    if (entry.type === 'payment') {
      await applyFifoPayment(entry.customer, entry.amount, entry.shopId);
    } else {
      await recalculateBalance(entry.customer);
    }

    await AuditLog.create({
      action: 'entry.approve',
      entityType: 'Entry',
      entityId: entry._id,
      userId: req.session.user.id,
      shopId: entry.shopId,
      details: { amount: entry.amount },
    });

    const populated = await Entry.findById(entry._id).populate('customer');
    res.json({ entry: populated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Approve failed' });
  }
});

router.post('/:id/reject', requireAdmin, async (req, res) => {
  try {
    const entry = await Entry.findById(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Not found' });
    entry.status = 'rejected';
    entry.reviewedBy = req.session.user.id;
    entry.reviewedAt = new Date();
    entry.notes = [entry.notes, req.body.reason || 'Rejected'].filter(Boolean).join(' | ');
    await entry.save();
    await AuditLog.create({
      action: 'entry.reject',
      entityType: 'Entry',
      entityId: entry._id,
      userId: req.session.user.id,
      shopId: entry.shopId,
      details: { reason: req.body.reason },
    });
    res.json({ entry });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Reject failed' });
  }
});

/** Soft delete */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const entry = await Entry.findById(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Not found' });
    entry.deletedAt = new Date();
    await entry.save();
    await recalculateBalance(entry.customer);
    await AuditLog.create({
      action: 'entry.soft_delete',
      entityType: 'Entry',
      entityId: entry._id,
      userId: req.session.user.id,
      shopId: entry.shopId,
      details: {},
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Delete failed' });
  }
});

router.post('/:id/restore', requireAdmin, async (req, res) => {
  try {
    const entry = await Entry.findById(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Not found' });
    entry.deletedAt = null;
    await entry.save();
    await recalculateBalance(entry.customer);
    await AuditLog.create({
      action: 'entry.restore',
      entityType: 'Entry',
      entityId: entry._id,
      userId: req.session.user.id,
      shopId: entry.shopId,
      details: {},
    });
    res.json({ entry });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Restore failed' });
  }
});

router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const entry = await Entry.findById(req.params.id);
    if (!entry || entry.deletedAt) return res.status(404).json({ error: 'Not found' });
    const fields = ['category', 'item', 'brand', 'meters', 'quantity', 'rate', 'amount', 'notes', 'note', 'date', 'type', 'paymentMode', 'enteredVia'];
    const before = entry.toObject();
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        if (['meters', 'quantity', 'rate', 'amount'].includes(f)) entry[f] = Number(req.body[f]);
        else if (f === 'date') entry.date = new Date(req.body[f]);
        else entry[f] = req.body[f];
      }
    }
    if (req.body.items) entry.items = req.body.items;
    await entry.save();
    if (entry.status === 'approved') await recalculateBalance(entry.customer);
    await AuditLog.create({
      action: 'entry.override',
      entityType: 'Entry',
      entityId: entry._id,
      userId: req.session.user.id,
      shopId: entry.shopId,
      details: { before: { amount: before.amount }, after: { amount: entry.amount } },
    });
    res.json({ entry });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Update failed' });
  }
});

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = router;
