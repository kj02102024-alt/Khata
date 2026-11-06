const express = require('express');
const Customer = require('../models/Customer');
const Entry = require('../models/Entry');
const AuditLog = require('../models/AuditLog');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { recalculateBalance } = require('../services/fifo');

const router = express.Router();

function shopFilter(req) {
  if (req.session.user.role === 'admin') {
    return req.query.shopId ? { shopId: req.query.shopId } : {};
  }
  return { shopId: req.session.user.shopId };
}

/** List customers */
router.get('/', requireAuth, async (req, res) => {
  try {
    const filter = { ...shopFilter(req) };
    const archived = req.query.archived === '1' || req.query.archived === 'true';
    const settled = req.query.settled === '1';
    const all = req.query.all === '1';

    if (archived || settled) {
      filter.isArchived = true;
    } else if (!all) {
      filter.isArchived = false;
      filter.balance = { $gt: 0.009 };
    }

    const q = (req.query.q || '').trim();
    if (q) {
      filter.$or = [
        { name: new RegExp(escapeRegex(q), 'i') },
        { alias: new RegExp(escapeRegex(q), 'i') },
        { village: new RegExp(escapeRegex(q), 'i') },
        { phone: new RegExp(escapeRegex(q), 'i') },
        { mobile2: new RegExp(escapeRegex(q), 'i') },
        { identifierNote: new RegExp(escapeRegex(q), 'i') },
        { relationNote: new RegExp(escapeRegex(q), 'i') },
      ];
    }
    const customers = await Customer.find(filter).sort({ name: 1 }).limit(200);
    res.json({ customers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load customers' });
  }
});

/** Autocomplete for names, villages, identifierNotes, items, brands */
router.get('/autocomplete', requireAuth, async (req, res) => {
  try {
    const sf = shopFilter(req);
    const field = req.query.field || 'name'; // name | village | identifierNote | item | brand
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) return res.json({ suggestions: [] });

    const re = new RegExp(escapeRegex(q), 'i');

    if (field === 'name') {
      const docs = await Customer.find({ ...sf, $or: [{ name: re }, { alias: re }] })
        .select('name alias honorific village identifierNote relationNote phone balance diaryNo')
        .limit(10);
      return res.json({ suggestions: docs });
    }

    if (field === 'village') {
      const docs = await Customer.distinct('village', { ...sf, village: re });
      return res.json({ suggestions: docs.filter(Boolean).slice(0, 15) });
    }

    if (field === 'identifierNote') {
      const docs = await Customer.distinct('identifierNote', { ...sf, identifierNote: re });
      const docs2 = await Customer.distinct('relationNote', { ...sf, relationNote: re });
      const all = [...new Set([...docs, ...docs2])].filter(Boolean);
      return res.json({ suggestions: all.slice(0, 10) });
    }

    if (field === 'item') {
      const Entry = require('../models/Entry');
      const docs = await Entry.distinct('item', { ...sf, item: re });
      const docs2 = await Entry.distinct('items.name', { ...sf });
      const all = [...new Set([...docs, ...docs2.filter((x) => re.test(x))])].filter(Boolean);
      return res.json({ suggestions: all.slice(0, 12) });
    }

    if (field === 'brand') {
      const Entry = require('../models/Entry');
      const docs = await Entry.distinct('brand', { ...sf, brand: re });
      const docs2 = await Entry.distinct('items.brand', { ...sf });
      const all = [...new Set([...docs, ...docs2.filter((x) => re.test(x))])].filter(Boolean);
      return res.json({ suggestions: all.slice(0, 12) });
    }

    res.json({ suggestions: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Autocomplete failed' });
  }
});

/** Lookup customer by mobile number */
router.get('/by-mobile', requireAuth, async (req, res) => {
  try {
    const sf = shopFilter(req);
    const mobile = (req.query.mobile || '').replace(/\D/g, '').replace(/^91/, '');
    if (!mobile || mobile.length < 10) return res.json({ customer: null });
    const customer = await Customer.findOne({
      ...sf,
      $or: [{ phone: mobile }, { mobile2: mobile }],
    });
    res.json({ customer: customer || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Mobile lookup failed' });
  }
});

/** Next free diary number */
router.get('/next-diary-no', requireAuth, async (req, res) => {
  try {
    const sf = shopFilter(req);
    const last = await Customer.findOne({ ...sf, diaryNo: { $ne: null } }).sort({ diaryNo: -1 }).select('diaryNo');
    res.json({ nextDiaryNo: (last?.diaryNo || 0) + 1 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed' });
  }
});

/** Resolve name → unique customer or disambiguation list */
router.post('/resolve', requireAuth, async (req, res) => {
  try {
    const { name, village, phone, identifierNote, relationNote, createIfMissing, honorific, diaryNo } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Name required', errorHi: 'नाम चाहिए' });
    }
    const shopId =
      req.session.user.role === 'admin'
        ? req.body.shopId || req.session.user.shopId
        : req.session.user.shopId;

    const nameRe = new RegExp(`^${escapeRegex(String(name).trim())}$`, 'i');
    let matches = await Customer.find({
      shopId,
      $or: [{ name: nameRe }, { alias: nameRe }],
    });

    // Partial / first-token match if exact miss
    if (!matches.length) {
      const token = String(name).trim().split(/\s+/)[0];
      matches = await Customer.find({
        shopId,
        $or: [
          { name: new RegExp(escapeRegex(token), 'i') },
          { alias: new RegExp(escapeRegex(token), 'i') },
        ],
      }).limit(10);
    }

    if (matches.length === 1) {
      return res.json({ match: 'exact', customer: matches[0] });
    }
    if (matches.length > 1) {
      return res.json({
        match: 'ambiguous',
        promptHi: 'कौन से गाँव के?',
        customers: matches,
      });
    }

    if (createIfMissing !== false) {
      const customer = await Customer.create({
        name: String(name).trim(),
        honorific: honorific || '',
        village: village || '',
        phone: phone || '',
        identifierNote: identifierNote || relationNote || '',
        relationNote: relationNote || identifierNote || '',
        shopId,
        diaryNo: diaryNo || null,
        balance: 0,
      });
      await AuditLog.create({
        action: 'customer.create',
        entityType: 'Customer',
        entityId: customer._id,
        userId: req.session.user.id,
        shopId,
        details: { name: customer.name },
      });
      return res.json({ match: 'created', customer });
    }

    res.json({ match: 'none', customers: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Resolve failed' });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Not found' });
    if (req.session.user.role !== 'admin' && customer.shopId !== req.session.user.shopId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const entries = await Entry.find({
      customer: customer._id,
      deletedAt: null,
      status: 'approved',
    }).sort({ date: -1, createdAt: -1 });
    res.json({ customer, entries });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const shopId =
      req.session.user.role === 'admin' ? req.body.shopId || 'shop1' : req.session.user.shopId;

    // Auto-assign diaryNo if not provided
    let diaryNo = req.body.diaryNo || null;
    if (!diaryNo) {
      const last = await Customer.findOne({ shopId, diaryNo: { $ne: null } }).sort({ diaryNo: -1 }).select('diaryNo');
      diaryNo = (last?.diaryNo || 0) + 1;
    }

    const customer = await Customer.create({
      name: req.body.name,
      honorific: req.body.honorific || '',
      alias: req.body.alias || '',
      village: req.body.village || '',
      phone: normalizePhone(req.body.phone || ''),
      mobile2: normalizePhone(req.body.mobile2 || ''),
      identifierNote: req.body.identifierNote || req.body.relationNote || '',
      relationNote: req.body.relationNote || req.body.identifierNote || '',
      diaryNo,
      shopId,
    });
    await AuditLog.create({
      action: 'customer.create',
      entityType: 'Customer',
      entityId: customer._id,
      userId: req.session.user.id,
      shopId,
      details: { name: customer.name },
    });
    res.status(201).json({ customer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Create failed' });
  }
});

router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Not found' });
    const fields = ['name', 'honorific', 'alias', 'village', 'phone', 'mobile2', 'identifierNote', 'relationNote', 'isArchived', 'diaryNo'];
    for (const f of fields) {
      if (req.body[f] !== undefined) customer[f] = req.body[f];
    }
    if (req.body.phone) customer.phone = normalizePhone(req.body.phone);
    if (req.body.mobile2) customer.mobile2 = normalizePhone(req.body.mobile2);
    await customer.save();
    await AuditLog.create({
      action: 'customer.update',
      entityType: 'Customer',
      entityId: customer._id,
      userId: req.session.user.id,
      shopId: customer.shopId,
      details: req.body,
    });
    res.json({ customer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Update failed' });
  }
});

router.post('/:id/recalc', requireAdmin, async (req, res) => {
  try {
    const customer = await recalculateBalance(req.params.id);
    res.json({ customer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Recalc failed' });
  }
});

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizePhone(s) {
  if (!s) return '';
  return String(s).replace(/\D/g, '').replace(/^91/, '').slice(0, 10);
}

module.exports = router;
