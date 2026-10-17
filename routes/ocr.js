/**
 * routes/ocr.js
 *
 * AI OCR Upload & Admin Verification Queue
 *
 * Endpoints:
 *   POST /api/ocr/upload        – Staff uploads a diary-page photo.
 *                                 Multer saves the file; OCR extraction
 *                                 runs async; Entry is created with
 *                                 status='pending_admin_approval'.
 *
 *   GET  /api/ocr/queue         – Admin: list all pending-approval entries.
 *
 *   POST /api/ocr/approve/:id   – Admin: mark entry as 'approved', optionally
 *                                 override OCR-extracted fields.
 *
 *   POST /api/ocr/reject/:id    – Admin: soft-delete the entry (reject OCR).
 *
 * NOTE: This file requires the `multer` package.
 *   Install it with:  npm install multer@^1.4.5-lts.1
 *
 * ── Wiring in real OCR ───────────────────────────────────────────────────
 * Replace the body of extractOcrData() below with one of:
 *
 *  A) Tesseract.js (local, free):
 *     const Tesseract = require('tesseract.js');
 *     const { data } = await Tesseract.recognize(imagePath, 'hin+eng');
 *     // parse data.text for amounts, names, items …
 *
 *  B) Google Cloud Vision (cloud, paid):
 *     const vision = require('@google-cloud/vision');
 *     const client = new vision.ImageAnnotatorClient();
 *     const [result] = await client.textDetection(imagePath);
 *     const text = result.textAnnotations[0].description;
 *     // parse text …
 *
 *  C) LLaVA / Ollama (local multimodal LLM):
 *     const { Ollama } = require('ollama');
 *     const ollama = new Ollama({ host: 'http://localhost:11434' });
 *     const img = fs.readFileSync(imagePath).toString('base64');
 *     const resp = await ollama.generate({
 *       model: 'llava', prompt: 'Extract: customer name, item, amount (rupees)',
 *       images: [img],
 *     });
 *     // parse resp.response JSON …
 *
 *  In all cases, return the same structured object shape defined below so
 *  that the rest of this route continues to work without modification.
 * ─────────────────────────────────────────────────────────────────────────
 */

const path    = require('path');
const fs      = require('fs');
const express = require('express');
const multer  = require('multer');

const requireAuth                    = require('../middleware/auth');
const { requireAdmin }               = require('../middleware/auth');
const Customer                       = require('../models/Customer');
const Entry                          = require('../models/Entry');

const router = express.Router();

// ── Multer disk storage ───────────────────────────────────────────
// Files land in  <project-root>/uploads/  with a timestamp prefix
// so concurrent uploads never clash.
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.join(__dirname, '..', 'uploads'));
  },
  filename: (_req, file, cb) => {
    const ext  = path.extname(file.originalname) || '.jpg';
    const name = `diary_${Date.now()}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB max
  fileFilter: (_req, file, cb) => {
    // Accept common image MIME types only
    if (/^image\/(jpeg|png|gif|webp|heic|heif)$/i.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('केवल image फ़ाइल अपलोड करें (JPEG, PNG, WebP)'));
    }
  },
});

// ── Smart-mock OCR extraction ─────────────────────────────────────
/**
 * extractOcrData(imagePath) → Promise<Object>
 *
 * CURRENT IMPLEMENTATION: Smart mock that returns a placeholder
 * structure.  Replace with real OCR (see file header comment).
 *
 * The returned object shape must always contain:
 *   customerName {string}  – extracted name or ''
 *   item         {string}  – product name / category or ''
 *   amount       {number|null} – rupee amount parsed from image
 *   date         {string}  – ISO date string
 *   confidence   {number}  – 0–1 confidence score
 *   rawText      {string}  – full text returned by OCR engine
 *   note         {string}  – any extra note / flag
 */
async function extractOcrData(imagePath) {
  // TODO: replace mock with Tesseract / Google Vision / LLaVA call (see header)

  // Read basic file stats so the mock at least reflects a real file was saved
  let fileSizeKb = 0;
  try {
    const stat = fs.statSync(imagePath);
    fileSizeKb  = Math.round(stat.size / 1024);
  } catch (_) {
    // file stat failure is non-fatal for the mock
  }

  return {
    customerName: '',                   // extracted or ''
    item:         '',                   // e.g. 'साड़ी', 'पैंट-शर्ट'
    amount:       null,                 // number or null
    date:         new Date().toISOString(),
    confidence:   0.0,                  // 0–1
    rawText:      `OCR पढ़ा जा रहा है... (AI integration pending) | file: ${path.basename(imagePath)} | size: ${fileSizeKb} KB`,
    note:         'Manual review required',
  };
}

// ── POST /api/ocr/upload ──────────────────────────────────────────
/**
 * Accepts multipart/form-data with:
 *   diaryPhoto   (required) – image file
 *   customerName (optional) – pre-filled name from UI / voice
 *   customerId   (optional) – Mongo ObjectId of already-resolved customer
 *
 * Flow:
 *   1. Multer saves the file to uploads/
 *   2. extractOcrData() analyses the image (mock/AI)
 *   3. Resolve customer (by id → by name-search → auto-create)
 *   4. Create Entry with status='pending_admin_approval'
 *   5. Return the created entry to the client
 */
router.post(
  '/upload',
  requireAuth,
  upload.single('diaryPhoto'),
  async (req, res) => {
    // multer error handling (fileFilter rejections arrive as req.fileValidationError)
    if (!req.file) {
      return res.status(400).json({ error: 'डायरी फोटो अपलोड जरूरी है (diaryPhoto field)' });
    }

    const imagePath    = req.file.path;
    const imageUrl     = '/uploads/' + req.file.filename; // relative URL served as static
    const customerName = (req.body.customerName || '').trim();
    const customerId   = (req.body.customerId   || '').trim();

    try {
      // 1. Run OCR (or smart mock)
      const ocrData = await extractOcrData(imagePath);

      // 2. Resolve customer ─────────────────────────────────────
      let customer = null;

      if (customerId) {
        // Caller already resolved a customer
        customer = await Customer.findById(customerId).lean();
      }

      if (!customer && customerName) {
        // Try to find by exact name
        customer = await Customer.findOne({ name: customerName }).lean();
      }

      if (!customer && ocrData.customerName) {
        // Use OCR-extracted name as fallback
        customer = await Customer.findOne({ name: ocrData.customerName }).lean();
      }

      if (!customer) {
        // Auto-create a placeholder customer so the entry has a valid ref.
        // Admin can correct the name during approval.
        const nameToUse = customerName || ocrData.customerName || 'OCR ग्राहक (अज्ञात)';
        customer = await Customer.create({
          name:    nameToUse,
          village: '',
        });
      }

      // 3. Determine amount (OCR result, minimum 1 to pass schema validation)
      const amount = (ocrData.amount && ocrData.amount >= 1)
        ? Math.round(ocrData.amount)
        : 1;

      // 4. Create Entry pending admin approval
      const entry = await Entry.create({
        customer:         customer._id,
        shop:             req.user.shop,
        type:             'sale',
        amount,
        item:             ocrData.item || '',
        note:             ocrData.note || '',
        imageUrl,
        ocrExtractedData: ocrData,
        status:           'pending_admin_approval',
        createdBy:        req.user.userId,
      });

      res.status(201).json({
        message:  'फोटो अपलोड हो गई, एडमिन अप्रूवल के लिए भेजी गई',
        entry,
        customer,
        ocrData,
      });
    } catch (err) {
      console.error('OCR upload error:', err);
      res.status(500).json({ error: 'OCR अपलोड में समस्या आई: ' + err.message });
    }
  }
);

// ── GET /api/ocr/queue ────────────────────────────────────────────
/**
 * Admin-only: returns all entries awaiting approval, newest first.
 * Populates customer name and village so the UI can display them.
 */
router.get('/queue', requireAuth, requireAdmin, async (req, res) => {
  try {
    const entries = await Entry.find({
      status:  'pending_admin_approval',
      deleted: false,
    })
      .sort({ createdAt: -1 })
      .populate('customer', 'name village phone')
      .lean();

    res.json(entries);
  } catch (err) {
    console.error('OCR queue error:', err);
    res.status(500).json({ error: 'OCR queue लोड करने में समस्या आई' });
  }
});

// ── POST /api/ocr/approve/:id ─────────────────────────────────────
/**
 * Admin-only: approve a pending entry.
 *
 * Optional body fields (all override OCR-extracted values):
 *   amount       {number}
 *   item         {string}
 *   customerName {string}  – if provided, rename the customer record
 *   note         {string}
 */
router.post('/approve/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const entry = await Entry.findById(req.params.id);
    if (!entry) {
      return res.status(404).json({ error: 'Entry नहीं मिली' });
    }
    if (entry.deleted) {
      return res.status(400).json({ error: 'यह entry हटाई जा चुकी है' });
    }

    // Apply overrides from request body
    if (req.body.amount !== undefined) {
      const amt = Number(req.body.amount);
      if (isNaN(amt) || amt < 1) {
        return res.status(400).json({ error: 'राशि कम से कम ₹1 होनी चाहिए' });
      }
      entry.amount = amt;
    }
    if (req.body.item         !== undefined) entry.item = String(req.body.item).trim();
    if (req.body.note         !== undefined) entry.note = String(req.body.note).trim();

    // Optionally rename the auto-created placeholder customer
    if (req.body.customerName) {
      const newName = String(req.body.customerName).trim();
      if (newName) {
        await Customer.findByIdAndUpdate(entry.customer, { name: newName });
      }
    }

    entry.status = 'approved';
    await entry.save();

    const updated = await Entry.findById(entry._id)
      .populate('customer', 'name village')
      .lean();

    res.json({ message: 'Entry अप्रूव हो गई', entry: updated });
  } catch (err) {
    console.error('OCR approve error:', err);
    res.status(500).json({ error: 'Entry अप्रूव करने में समस्या आई' });
  }
});

// ── POST /api/ocr/reject/:id ──────────────────────────────────────
/**
 * Admin-only: reject (soft-delete) a pending OCR entry.
 * The uploaded image file remains on disk for audit purposes.
 */
router.post('/reject/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const entry = await Entry.findById(req.params.id);
    if (!entry) {
      return res.status(404).json({ error: 'Entry नहीं मिली' });
    }
    if (entry.deleted) {
      return res.status(400).json({ error: 'यह entry पहले से हटाई जा चुकी है' });
    }

    // Soft-delete — consistent with the undo-entry pattern used elsewhere
    entry.deleted   = true;
    entry.deletedAt = new Date();
    entry.deletedBy = req.user.userId;
    await entry.save();

    res.json({ message: 'Entry अस्वीकार कर दी गई (हटाई गई)', entryId: entry._id });
  } catch (err) {
    console.error('OCR reject error:', err);
    res.status(500).json({ error: 'Entry अस्वीकार करने में समस्या आई' });
  }
});

module.exports = router;
