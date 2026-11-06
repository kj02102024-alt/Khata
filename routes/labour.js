const express = require('express');
const mongoose = require('mongoose');
const Labour = require('../models/Labour');
const LabourEntry = require('../models/LabourEntry');
const AuditLog = require('../models/AuditLog');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * Recalculate labour balance & ledger running balance
 */
async function recalculateLabourBalance(labourId) {
  const entries = await LabourEntry.find({ labour: labourId }).sort({ date: 1, createdAt: 1 });
  let totalEarned = 0;
  let totalPaid = 0;
  let running = 0;

  for (const entry of entries) {
    if (entry.type === 'salary_credit') {
      totalEarned += Number(entry.amount) || 0;
      running += Number(entry.amount) || 0;
    } else {
      totalPaid += Number(entry.amount) || 0;
      running -= Number(entry.amount) || 0;
    }
    entry.runningBalance = running;
    await entry.save();
  }

  const balance = totalEarned - totalPaid;
  const updatedLabour = await Labour.findByIdAndUpdate(
    labourId,
    { totalEarned, totalPaid, balance },
    { new: true }
  );

  return { totalEarned, totalPaid, balance, labour: updatedLabour };
}

// ─── GET /api/labour/metrics — Centralized metrics for Admin & Shops ─────────
router.get('/metrics', requireAuth, async (req, res) => {
  try {
    const userRole = req.session.user.role;
    const userShop = req.session.user.shopId;
    const filter = { isArchived: false };

    if (userRole === 'shopkeeper') {
      filter.shopId = userShop;
    } else if (req.query.shopId && req.query.shopId !== 'all') {
      filter.shopId = req.query.shopId;
    }

    const labours = await Labour.find(filter);
    const activeCount = labours.filter((l) => l.status === 'active').length;
    const totalPendingWage = labours.reduce((sum, l) => sum + (l.balance > 0 ? l.balance : 0), 0);
    const totalAdvanceWithLabour = labours.reduce((sum, l) => sum + (l.balance < 0 ? Math.abs(l.balance) : 0), 0);

    // Current month paid metrics
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const entryFilter = {
      type: 'payment',
      date: { $gte: startOfMonth },
    };
    if (filter.shopId) entryFilter.shopId = filter.shopId;

    const monthEntries = await LabourEntry.find(entryFilter);
    const totalPaidThisMonth = monthEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    res.json({
      activeCount,
      totalCount: labours.length,
      totalPendingWage,
      totalAdvanceWithLabour,
      totalPaidThisMonth,
      shop1Count: labours.filter((l) => l.shopId === 'shop1').length,
      shop2Count: labours.filter((l) => l.shopId === 'shop2').length,
    });
  } catch (err) {
    console.error('[Labour Metrics Error]:', err);
    res.status(500).json({ error: 'Failed to fetch labour metrics' });
  }
});

// ─── GET /api/labour — List all labours ───────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const userRole = req.session.user.role;
    const userShop = req.session.user.shopId;

    const filter = { isArchived: false };

    // Shop scoping
    if (userRole === 'shopkeeper') {
      filter.shopId = userShop;
    } else if (req.query.shopId && req.query.shopId !== 'all') {
      filter.shopId = req.query.shopId;
    }

    // Status filter
    if (req.query.status && req.query.status !== 'all') {
      filter.status = req.query.status;
    }

    // Text search query
    const q = (req.query.q || '').trim();
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } },
        { roleTitle: { $regex: q, $options: 'i' } },
      ];
    }

    const labours = await Labour.find(filter).sort({ status: 1, name: 1 });
    res.json({ labours });
  } catch (err) {
    console.error('[Labour List Error]:', err);
    res.status(500).json({ error: 'Failed to fetch labour list' });
  }
});

// ─── POST /api/labour — Create new labour ────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const {
      name,
      phone,
      shopId: requestedShopId,
      roleTitle,
      wageType,
      wageAmount,
      joiningDate,
      notes,
      initialAdvance,
      initialPendingWage,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required', errorHi: 'मज़दूर का नाम ज़रूरी है' });
    }

    const userRole = req.session.user.role;
    const userShop = req.session.user.shopId;
    const shopId = userRole === 'shopkeeper' ? userShop : requestedShopId || 'shop1';

    const labour = await Labour.create({
      name: name.trim(),
      phone: (phone || '').trim(),
      shopId,
      roleTitle: (roleTitle || 'कारीगर').trim(),
      wageType: wageType === 'daily' ? 'daily' : 'monthly',
      wageAmount: Number(wageAmount) || 0,
      joiningDate: joiningDate ? new Date(joiningDate) : new Date(),
      notes: (notes || '').trim(),
      status: 'active',
    });

    // Handle initial advance if specified
    if (Number(initialAdvance) > 0) {
      await LabourEntry.create({
        labour: labour._id,
        shopId,
        type: 'payment',
        category: 'advance',
        amount: Number(initialAdvance),
        paymentMode: 'cash',
        description: 'प्रारंभिक पुराना एडवांस (Opening Advance)',
        createdBy: req.session.user.id,
      });
    }

    // Handle initial pending wage if specified
    if (Number(initialPendingWage) > 0) {
      await LabourEntry.create({
        labour: labour._id,
        shopId,
        type: 'salary_credit',
        category: 'salary',
        amount: Number(initialPendingWage),
        paymentMode: '',
        description: 'प्रारंभिक पिछला बाकी वेतन (Opening Pending Wage)',
        createdBy: req.session.user.id,
      });
    }

    // Recalculate
    const { labour: freshLabour } = await recalculateLabourBalance(labour._id);

    await AuditLog.create({
      action: 'labour.create',
      entityType: 'Labour',
      entityId: labour._id,
      userId: req.session.user.id,
      shopId,
      details: { name: labour.name, wageAmount: labour.wageAmount },
    });

    res.status(201).json({ labour: freshLabour || labour });
  } catch (err) {
    console.error('[Labour Create Error]:', err);
    res.status(500).json({ error: 'Failed to create labour profile: ' + err.message });
  }
});

// ─── GET /api/labour/:id — Labour Profile + Ledger ───────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const labour = await Labour.findById(req.params.id);
    if (!labour || labour.isArchived) {
      return res.status(404).json({ error: 'Labour not found', errorHi: 'मज़दूर रिकॉर्ड नहीं मिला' });
    }

    const entries = await LabourEntry.find({ labour: labour._id }).sort({ date: -1, createdAt: -1 });

    res.json({ labour, entries });
  } catch (err) {
    console.error('[Labour Fetch Error]:', err);
    res.status(500).json({ error: 'Failed to fetch labour details' });
  }
});

// ─── PUT /api/labour/:id — Update Labour Profile ─────────────────────────────
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const labour = await Labour.findById(req.params.id);
    if (!labour || labour.isArchived) {
      return res.status(404).json({ error: 'Labour not found', errorHi: 'मज़दूर रिकॉर्ड नहीं मिला' });
    }

    const { name, phone, roleTitle, wageType, wageAmount, joiningDate, status, notes, shopId } = req.body;

    if (name !== undefined) labour.name = name.trim();
    if (phone !== undefined) labour.phone = (phone || '').trim();
    if (roleTitle !== undefined) labour.roleTitle = (roleTitle || '').trim();
    if (wageType !== undefined) labour.wageType = wageType === 'daily' ? 'daily' : 'monthly';
    if (wageAmount !== undefined) labour.wageAmount = Number(wageAmount) || 0;
    if (joiningDate !== undefined) labour.joiningDate = new Date(joiningDate);
    if (status !== undefined) labour.status = status === 'inactive' ? 'inactive' : 'active';
    if (notes !== undefined) labour.notes = (notes || '').trim();
    if (shopId && req.session.user.role === 'admin') labour.shopId = shopId;

    await labour.save();

    await AuditLog.create({
      action: 'labour.update',
      entityType: 'Labour',
      entityId: labour._id,
      userId: req.session.user.id,
      shopId: labour.shopId,
      details: { name: labour.name },
    });

    res.json({ labour });
  } catch (err) {
    console.error('[Labour Update Error]:', err);
    res.status(500).json({ error: 'Failed to update labour profile' });
  }
});

// ─── DELETE /api/labour/:id — Soft-delete Labour ─────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const labour = await Labour.findById(req.params.id);
    if (!labour) {
      return res.status(404).json({ error: 'Labour not found' });
    }

    labour.isArchived = true;
    await labour.save();

    await AuditLog.create({
      action: 'labour.delete',
      entityType: 'Labour',
      entityId: labour._id,
      userId: req.session.user.id,
      shopId: labour.shopId,
      details: { name: labour.name },
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[Labour Delete Error]:', err);
    res.status(500).json({ error: 'Failed to archive labour' });
  }
});

// ─── GET /api/labour/:id/entries — Get Passbook Entries ──────────────────────
router.get('/:id/entries', requireAuth, async (req, res) => {
  try {
    const labour = await Labour.findById(req.params.id);
    if (!labour) return res.status(404).json({ error: 'Labour not found' });

    // Recalculate to ensure absolute ledger consistency
    await recalculateLabourBalance(labour._id);

    const entries = await LabourEntry.find({ labour: labour._id }).sort({ date: -1, createdAt: -1 });
    const freshLabour = await Labour.findById(labour._id);

    res.json({ labour: freshLabour, entries });
  } catch (err) {
    console.error('[Labour Entries Error]:', err);
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
});

// ─── POST /api/labour/:id/entries — Add New Date-wise Passbook Entry ─────────
router.post('/:id/entries', requireAuth, async (req, res) => {
  try {
    const labour = await Labour.findById(req.params.id);
    if (!labour || labour.isArchived) {
      return res.status(404).json({ error: 'Labour not found', errorHi: 'मज़दूर रिकॉर्ड नहीं मिला' });
    }

    const { type, amount, category, paymentMode, date, description } = req.body;
    const numAmount = Number(amount);

    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ error: 'Valid amount required', errorHi: 'सही रकम दर्ज करें' });
    }

    const entryType = type === 'salary_credit' ? 'salary_credit' : 'payment';
    const entryDate = date ? new Date(date) : new Date();

    const entry = await LabourEntry.create({
      labour: labour._id,
      shopId: labour.shopId,
      date: isNaN(entryDate.getTime()) ? new Date() : entryDate,
      type: entryType,
      category: category || (entryType === 'salary_credit' ? 'salary' : 'advance'),
      amount: numAmount,
      paymentMode: paymentMode || (entryType === 'payment' ? 'cash' : ''),
      description: (description || '').trim(),
      createdBy: req.session.user.id,
    });

    // Recalculate Labour running balance
    const { labour: freshLabour } = await recalculateLabourBalance(labour._id);

    await AuditLog.create({
      action: 'labour.entry.create',
      entityType: 'LabourEntry',
      entityId: entry._id,
      userId: req.session.user.id,
      shopId: labour.shopId,
      details: {
        labourName: labour.name,
        type: entryType,
        amount: numAmount,
        category: entry.category,
      },
    });

    res.status(201).json({ entry, labour: freshLabour });
  } catch (err) {
    console.error('[Labour Entry Create Error]:', err);
    res.status(500).json({ error: 'Failed to add ledger entry: ' + err.message });
  }
});

// ─── DELETE /api/labour/:id/entries/:entryId — Delete Passbook Entry ──────────
router.delete('/:id/entries/:entryId', requireAuth, async (req, res) => {
  try {
    const entry = await LabourEntry.findOne({ _id: req.params.entryId, labour: req.params.id });
    if (!entry) {
      return res.status(404).json({ error: 'Entry not found', errorHi: 'एंट्री नहीं मिली' });
    }

    const labourId = entry.labour;
    await entry.deleteOne();

    const { labour: freshLabour } = await recalculateLabourBalance(labourId);

    await AuditLog.create({
      action: 'labour.entry.delete',
      entityType: 'LabourEntry',
      entityId: req.params.entryId,
      userId: req.session.user.id,
      shopId: entry.shopId,
      details: { amount: entry.amount, type: entry.type },
    });

    res.json({ ok: true, labour: freshLabour });
  } catch (err) {
    console.error('[Labour Entry Delete Error]:', err);
    res.status(500).json({ error: 'Failed to delete ledger entry' });
  }
});

module.exports = router;
module.exports.recalculateLabourBalance = recalculateLabourBalance;
