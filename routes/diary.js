const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const DiaryImage = require('../models/DiaryImage');
const Entry = require('../models/Entry');
const Customer = require('../models/Customer');
const AuditLog = require('../models/AuditLog');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { applyFifoPayment, recalculateBalance } = require('../services/fifo');

const router = express.Router();
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
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

function parseLooseDate(raw) {
  if (!raw) return new Date();
  const s = String(raw).trim();
  // 16.5.26 / 16/5/26 / 16-05-2026
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    return new Date(y, Number(m[2]) - 1, Number(m[1]));
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

router.post('/upload', requireAuth, upload.array('photos', 12), async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ messageHi: 'फोटो चुनें' });
    const shopId = req.session.user.role === 'admin' ? req.body.shopId || 'shop1' : req.session.user.shopId;
    const docs = [];
    for (const f of files) {
      const doc = await DiaryImage.create({
        path: `/uploads/${f.filename}`,
        shopId,
        uploadedBy: req.session.user.id,
        status: 'pending',
        customerHint: req.body.customerHint || '',
        rows: [{ type: 'credit', amount: 0, qty: 1 }],
      });
      docs.push(doc);
      await AuditLog.create({
        entityType: 'DiaryImage',
        entityId: doc._id,
        action: 'upload',
        by: req.session.user.id,
        shopId,
        after: { path: doc.path },
      });
    }
    res.status(201).json({
      images: docs,
      messageHi: 'फोटो पहुँच गई। बाकी काम हम देख लेंगे।',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ messageHi: 'फोटो नहीं गई। फिर भेजें।' });
  }
});

router.get('/', requireAuth, async (req, res) => {
  const filter = {};
  if (req.session.user.role !== 'admin') filter.shopId = req.session.user.shopId;
  else if (req.query.shopId && req.query.shopId !== 'all') filter.shopId = req.query.shopId;
  if (req.query.status) filter.status = req.query.status;
  const images = await DiaryImage.find(filter)
    .populate('uploadedBy', 'username displayNameHi displayName')
    .sort({ createdAt: -1 })
    .limit(Number(req.query.limit) || 100);
  res.json({ images });
});

router.get('/:id', requireAuth, async (req, res) => {
  const image = await DiaryImage.findById(req.params.id).populate('uploadedBy', 'username displayName');
  if (!image) return res.status(404).json({ error: 'Not found' });
  res.json({ image });
});

router.patch('/:id', requireAdmin, async (req, res) => {
  const image = await DiaryImage.findById(req.params.id);
  if (!image) return res.status(404).json({ error: 'Not found' });
  if (req.body.rows) image.rows = req.body.rows;
  if (req.body.status) image.status = req.body.status;
  if (req.body.customerHint != null) image.customerHint = req.body.customerHint;
  await image.save();
  res.json({ image });
});

router.post('/:id/approve', requireAdmin, async (req, res) => {
  try {
    const image = await DiaryImage.findById(req.params.id);
    if (!image) return res.status(404).json({ error: 'Not found' });
    const rows = req.body.rows || image.rows || [];
    if (!rows.length) return res.status(400).json({ error: 'No rows to post' });

    const created = [];
    for (const row of rows) {
      if (row.unclear) continue;
      const amount = Math.round(Number(row.amount) || 0);
      if (amount <= 0 && !row.crossedOut) continue;

      let customerId = row.customerId;
      if (!customerId && row.customerName) {
        let c = await Customer.findOne({
          shopId: image.shopId,
          name: new RegExp(`^${escapeRegex(row.customerName.trim())}$`, 'i'),
          ...(row.village ? { village: new RegExp(escapeRegex(row.village), 'i') } : {}),
        });
        if (!c) {
          c = await Customer.create({
            name: row.customerName.trim(),
            relationNote: row.relationNote || '',
            village: row.village || '',
            mobile: row.mobile || '',
            shopId: image.shopId,
          });
        }
        customerId = c._id;
      }
      if (!customerId) continue;

      const type = row.type === 'payment' ? 'payment' : 'credit';
      const entry = await Entry.create({
        customerId,
        shopId: image.shopId,
        type,
        items: [{ desc: row.item || 'डायरी', brand: row.brand || '', qty: row.qty || 1, unit: row.unit || 'piece' }],
        amount: amount || 0,
        date: parseLooseDate(row.dateRaw || row.date),
        source: 'diary',
        diaryImageId: image._id,
        crossedOut: !!row.crossedOut,
        isCleared: !!row.crossedOut || type === 'payment',
        settledAmount: row.crossedOut ? amount : 0,
        unclear: !!row.unclear,
        createdBy: req.session.user.id,
      });

      if (type === 'payment' && amount > 0) {
        await applyFifoPayment(customerId, amount, image.shopId, entry._id);
      } else {
        await recalculateBalance(customerId);
      }
      created.push(entry);
    }

    image.rows = rows;
    image.status = 'approved';
    image.reviewedBy = req.session.user.id;
    image.reviewedAt = new Date();
    await image.save();

    await AuditLog.create({
      entityType: 'DiaryImage',
      entityId: image._id,
      action: 'approve',
      by: req.session.user.id,
      shopId: image.shopId,
      after: { entries: created.length },
    });

    res.json({ image, entries: created });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Approve failed' });
  }
});

router.post('/:id/reject', requireAdmin, async (req, res) => {
  const image = await DiaryImage.findById(req.params.id);
  if (!image) return res.status(404).json({ error: 'Not found' });
  image.status = 'rejected';
  image.rejectReason = req.body.reason || '';
  image.reviewedBy = req.session.user.id;
  image.reviewedAt = new Date();
  await image.save();
  await AuditLog.create({
    entityType: 'DiaryImage',
    entityId: image._id,
    action: 'reject',
    by: req.session.user.id,
    shopId: image.shopId,
    reason: image.rejectReason,
  });
  res.json({ image });
});

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = router;
