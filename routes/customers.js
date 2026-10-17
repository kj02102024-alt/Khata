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
        // Text index search across name, village, and alias
        customers = await Customer.find(
          { $text: { $search: q } },
          { score: { $meta: 'textScore' } }
        )
          .sort({ score: { $meta: 'textScore' } })
          .limit(30)
          .lean();

        // If text index returned 0 matches, perform regex fallback across name, village, and alias
        if (customers.length === 0) {
          const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
          customers = await Customer.find({
            $or: [{ name: re }, { village: re }, { alias: re }],
          })
            .limit(30)
            .lean();
        }
      } else {
        // Single-character: regex prefix on name, village, or alias
        const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        customers = await Customer.find({
          $or: [{ name: re }, { village: re }, { alias: re }],
        })
          .limit(30)
          .lean();
      }

      // Compute balances for these customers
      if (customers.length > 0) {
        const customerIds = customers.map(c => c._id);
        const balances = await Entry.aggregate([
          { $match: { customer: { $in: customerIds }, deleted: false, status: { $ne: 'pending_admin_approval' } } },
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

        const status = req.query.status || (req.query.pendingOnly === 'true' ? 'pending' : (req.query.settledOnly === 'true' ? 'settled' : 'all'));
        if (status === 'pending') {
          // Primary daily list: only customers with pending dues
          customers = customers.filter(c => c.balance > 0);
        } else if (status === 'settled') {
          // Settled / cleared accounts: balance zero or advance
          customers = customers.filter(c => c.balance <= 0);
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

      // All non-deleted approved entries, newest first
      const entries = await Entry.find({
        customer: req.params.id,
        deleted: false,
        status: { $ne: 'pending_admin_approval' },
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

// ── Helper: Parse relationships like "श्री संजय पटेल की बहन" or "संजय (लड़का मोनू)" ─
function parseCustomerRelation(rawText = '') {
  let text = String(rawText).trim();

  // 1. Strip common honorific prefixes: श्री, श्रीमती, पं., पंडित, मास्टर, लाला, सेठ, etc.
  text = text.replace(/^(?:श्रीमान|श्रीमती|श्री|पं\.?|पंडित|मास्टर|सेठ|लाला|डॉ\.?|dr\.?|mr\.?|mrs\.?|shri|shree)\s+/i, '').trim();

  // 2. Check if already has brackets: e.g. "संजय पटेल (बहन)" or "रमेश (लड़का मोनू)"
  const bracketMatch = text.match(/^(.*?)\s*[\(\[]([^\)\]]+)[\)\]]\s*$/);
  if (bracketMatch) {
    const parentName = bracketMatch[1].trim();
    const relTag     = bracketMatch[2].trim();
    return {
      isRelation: true,
      parentName,
      childName: relTag,
      relLabel: relTag,
      formattedName: `${parentName} (${relTag})`,
      aliases: [relTag, text],
    };
  }

  // 3. Match relations with connector: (का / की / ke / ka / ki)
  // Two forms:
  //   Form A: with child/kin name, e.g. "संजय पटेल का लड़का मोनू"
  //   Form B: without child name, e.g. "संजय पटेल की बहन", "रमेश की बहू"
  const relRegexWithKin = /^(.+?)\s+(?:का|की|के|ke|ka|ki)\s+(लड़का|लड़का|बेटा|लड़की|लड़की|बेटी|बहू|पत्नी|भाई|बहन|पोता|पोती|भतीजा|भतीजी|जीजा|साला|माता|पिता|चाचा|चाची|ताऊ|मौसी|बुआ|दामाद|ladka|beta|ladki|beti|bahu|patni|bhai|behen|sister|brother|pota|poti|bhatija)\s*(.*)$/i;

  const match = text.match(relRegexWithKin);
  if (!match) {
    return { isRelation: false, baseName: text, aliasPart: '', formattedName: text };
  }

  const parentName = match[1].trim();
  const rawRelWord = (match[2] || '').trim();
  const childName  = (match[3] || '').trim();

  // Normalize relationship label to standard Devanagari
  let relLabel = rawRelWord;
  const rw = rawRelWord.toLowerCase();
  if (/बहन|behen|sister/.test(rw)) relLabel = 'बहन';
  else if (/भाई|bhai|brother/.test(rw)) relLabel = 'भाई';
  else if (/लड़की|लड़की|ladki|beti|बेटी/.test(rw)) relLabel = 'लड़की';
  else if (/लड़का|लड़का|ladka|beta|बेटा/.test(rw)) relLabel = 'लड़का';
  else if (/बहू|bahu/.test(rw)) relLabel = 'बहू';
  else if (/पत्नी|patni|wife/.test(rw)) relLabel = 'पत्नी';
  else if (/पोता|pota/.test(rw)) relLabel = 'पोता';
  else if (/पोती|poti/.test(rw)) relLabel = 'पोती';
  else if (/भतीजा|bhatija/.test(rw)) relLabel = 'भतीजा';
  else if (/भतीजी|bhatiji/.test(rw)) relLabel = 'भतीजी';
  else if (/जीजा|jija/.test(rw)) relLabel = 'जीजा';
  else if (/साला|sala/.test(rw)) relLabel = 'साला';
  else if (/चाचा|chacha/.test(rw)) relLabel = 'चाचा';
  else if (/चाची|chachi/.test(rw)) relLabel = 'चाची';
  else if (/ताऊ|tau/.test(rw)) relLabel = 'ताऊ';
  else if (/मौसी|mausi/.test(rw)) relLabel = 'मौसी';
  else if (/बुआ|bua/.test(rw)) relLabel = 'बुआ';
  else if (/दामाद|damad/.test(rw)) relLabel = 'दामाद';

  const relTag = childName ? `${relLabel} ${childName}` : relLabel;
  const formattedName = `${parentName} (${relTag})`;

  const aliases = [relTag, text];
  if (childName) aliases.push(childName);

  return {
    isRelation: true,
    parentName,
    childName,
    relLabel,
    formattedName,
    aliases,
  };
}

// ── POST /api/customers/resolve ───────────────────────────────────
/**
 * Smart Customer Matching & Alias/Relationship Engine:
 * 1. Checks if customer already exists (by full text, parent name, alias or pet name)
 * 2. If match found: returns existing customer _id (and updates alias if needed)
 * 3. If new relation detected: formats as "रमेश (लड़का मोनू)", creates record, returns new _id
 * 4. If new standard name: creates new record, returns new _id
 */
router.post('/resolve', async (req, res) => {
  const { spokenQuery = '', village = '' } = req.body;
  const cleanSpoken = spokenQuery.trim();
  const cleanVillage = village.trim();

  if (!cleanSpoken) {
    return res.status(400).json({ error: 'ग्राहक का नाम जरूरी है' });
  }

  try {
    const relationInfo = parseCustomerRelation(cleanSpoken);

    // 1. Search for all candidate customers sharing this exact or base name / alias
    let candidates = await Customer.find({
      $or: [
        { name: cleanSpoken },
        { name: new RegExp('^' + cleanSpoken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') },
        { name: relationInfo.formattedName },
        { alias: cleanSpoken },
      ],
    }).limit(6).lean();

    // If village was explicitly provided, filter candidates by that village
    if (cleanVillage && candidates.length > 0) {
      const vFiltered = candidates.filter(
        c => c.village && c.village.toLowerCase().includes(cleanVillage.toLowerCase())
      );
      if (vFiltered.length === 1) {
        candidates = vFiltered;
      }
    }

    // 2. Homonym Disambiguation Rule: If multiple customers share the same name across villages,
    // do NOT pick blindly. Return homonym list with their balances for elderly user choice!
    if (candidates.length > 1) {
      const candidateIds = candidates.map(c => c._id);
      const balances = await Entry.aggregate([
        { $match: { customer: { $in: candidateIds }, deleted: false, status: { $ne: 'pending_admin_approval' } } },
        {
          $group: {
            _id: '$customer',
            totalSales: { $sum: { $cond: [{ $eq: ['$type', 'sale'] }, '$amount', 0] } },
            totalPayments: { $sum: { $cond: [{ $eq: ['$type', 'payment'] }, '$amount', 0] } },
          },
        },
      ]);
      const bMap = new Map();
      for (const b of balances) {
        bMap.set(String(b._id), b.totalSales - b.totalPayments);
      }
      candidates = candidates.map(c => ({
        ...c,
        balance: bMap.get(String(c._id)) || 0,
      }));

      return res.json({
        homonym: true,
        count: candidates.length,
        candidates,
        spokenQuery: cleanSpoken,
        village: cleanVillage,
      });
    }

    let existing = candidates.length === 1 ? candidates[0] : null;

    // 3. If no exact match and relationship was spoken, search by parent name or child alias
    if (!existing && relationInfo.isRelation) {
      const parentRegex = new RegExp(relationInfo.parentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const childRegex  = new RegExp(relationInfo.childName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

      // Look for parent with matching child alias, or name containing both
      existing = await Customer.findOne({
        $or: [
          { name: parentRegex, alias: childRegex },
          { name: parentRegex, name: childRegex },
          { alias: childRegex },
        ],
      });

      // If existing customer found (e.g. "Ramesh"), attach child alias if missing
      if (existing) {
        let updated = false;
        if (!existing.alias.includes(relationInfo.childName)) {
          existing.alias.push(relationInfo.childName);
          updated = true;
        }
        if (!existing.alias.includes(cleanSpoken)) {
          existing.alias.push(cleanSpoken);
          updated = true;
        }
        if (updated) await existing.save();

        return res.json({
          customer: existing,
          matched: true,
          isNew: false,
          formattedName: existing.name,
        });
      }
    }

    // 4. If existing customer found from step 1
    if (existing) {
      return res.json({
        customer: existing,
        matched: true,
        isNew: false,
        formattedName: existing.name,
      });
    }

    // 5. No match found: create new profile based on relation rule
    let newCustomerName = cleanSpoken;
    let initialAliases = [];

    if (relationInfo.isRelation) {
      // Formatted cleanly: "रमेश (लड़का मोनू)"
      newCustomerName = relationInfo.formattedName;
      initialAliases  = relationInfo.aliases;
    }

    const created = await Customer.create({
      name: newCustomerName,
      village: cleanVillage,
      alias: initialAliases,
      relationTag: relationInfo.isRelation ? (relationInfo.childName ? `${relationInfo.relLabel} ${relationInfo.childName}` : relationInfo.relLabel) : '',
    });

    return res.status(201).json({
      customer: created,
      matched: false,
      isNew: true,
      formattedName: newCustomerName,
    });
  } catch (err) {
    console.error('Resolve customer error:', err);
    res.status(500).json({ error: 'ग्राहक समाधान में समस्या आई' });
  }
});

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
    body('alias').optional(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { name, village = '', phone = '', alias = [], relationTag = '' } = req.body;
    const aliases = Array.isArray(alias) ? alias : (alias ? [String(alias)] : []);

    try {
      const customer = await Customer.create({
        name,
        village,
        phone,
        alias: aliases,
        relationTag: relationTag ? String(relationTag).trim() : '',
      });
      res.status(201).json(customer);
    } catch (err) {
      console.error('Create customer error:', err);
      res.status(500).json({ error: 'ग्राहक नहीं बन सका' });
    }
  }
);

module.exports = router;
