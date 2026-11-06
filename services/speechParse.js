/**
 * Enhanced speech parser for Khata.
 * Handles: Hindi digit words, fractional amounts (डेढ़/ढाई/सवा/साढ़े),
 * date parsing, time parsing, slot-filling for master mic, field-specific parsers.
 */

// ─── Devanagari digit normalisation ──────────────────────────────────────────
function normalizeDigits(text) {
  const map = { '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9' };
  return text.replace(/[०-९]/g, (d) => map[d] || d);
}

// ─── Hindi spoken-number → numeric value ─────────────────────────────────────
const DIGIT_WORDS_HI = {
  शून्य: 0, एक: 1, दो: 2, तीन: 3, चार: 4, पाँच: 5, पांच: 5, छह: 6, छः: 6,
  सात: 7, आठ: 8, नौ: 9, दस: 10, ग्यारह: 11, बारह: 12, तेरह: 13, चौदह: 14,
  पंद्रह: 15, सोलह: 16, सत्रह: 17, अठारह: 18, उन्नीस: 19, बीस: 20,
  इक्कीस: 21, बाईस: 22, तेईस: 23, चौबीस: 24, पच्चीस: 25, छब्बीस: 26,
  सत्ताईस: 27, अट्ठाईस: 28, उनतीस: 29, तीस: 30, इकतीस: 31, बत्तीस: 32,
  तैंतीस: 33, चौंतीस: 34, पैंतीस: 35, छत्तीस: 36, सैंतीस: 37, अड़तीस: 38,
  उनतालीस: 39, चालीस: 40, इकतालीस: 41, बयालीस: 42, तैंतालीस: 43,
  चवालीस: 44, पैंतालीस: 45, छियालीस: 46, सैंतालीस: 47, अड़तालीस: 48,
  उनचास: 49, पचास: 50, साठ: 60, सत्तर: 70, अस्सी: 80, नब्बे: 90,
  सौ: 100, हज़ार: 1000, हजार: 1000, लाख: 100000,
};

const SPECIAL_FRACTIONS = {
  'डेढ़': 1.5, 'डेढ': 1.5,
  'ढाई': 2.5, 'ढाइ': 2.5,
  'सवा': 0.25, // "सवा सौ" = 125 (needs context)
  'साढ़े': 0.5, 'साढे': 0.5, // "साढ़े तीन सौ" = 350 (needs context)
  'पौने': -0.25, // "पौने चार सौ" = 375
};

/**
 * Parse a Hindi spoken amount string to a number.
 * Examples: "डेढ़ सौ" → 150, "ढाई सौ" → 250, "सवा सौ" → 125,
 * "साढ़े तीन सौ" → 350, "दो हज़ार पाँच सौ" → 2500
 */
function parseHindiAmount(text) {
  const t = normalizeDigits(text.toLowerCase().trim());

  // Try Arabic numerals first
  const arabicMatch = t.match(/(\d+(?:\.\d+)?)/);
  // Check for special fractional words
  for (const [word, frac] of Object.entries(SPECIAL_FRACTIONS)) {
    if (t.includes(word)) {
      // "डेढ़ सौ" = 1.5 * 100 = 150
      // "ढाई हज़ार" = 2.5 * 1000 = 2500
      // "सवा सौ" = (1 + 0.25) * 100 = 125
      // "साढ़े तीन सौ" = (3 + 0.5) * 100 = 350
      const remaining = t.replace(word, '').trim();

      let multiplier = 1;
      if (remaining.includes('लाख')) multiplier = 100000;
      else if (remaining.includes('हज़ार') || remaining.includes('हजार')) multiplier = 1000;
      else if (remaining.includes('सौ')) multiplier = 100;

      let base = 0;
      // Find numeric base in remaining
      for (const [w, v] of Object.entries(DIGIT_WORDS_HI)) {
        if (remaining.includes(w) && !['सौ', 'हज़ार', 'हजार', 'लाख'].includes(w)) {
          base = v;
          break;
        }
      }
      const numMatch = remaining.match(/(\d+)/);
      if (numMatch) base = Number(numMatch[1]);

      if (word === 'डेढ़' || word === 'डेढ') return 1.5 * multiplier;
      if (word === 'ढाई' || word === 'ढाइ') return 2.5 * multiplier;
      if (word === 'सवा') return (base + 0.25) * multiplier || (1 + 0.25) * multiplier;
      if (word === 'साढ़े' || word === 'साढे') return (base + 0.5) * multiplier;
      if (word === 'पौने') return (base - 0.25) * multiplier;
    }
  }

  // Build a number from Hindi word chain
  let total = 0, current = 0;
  const words = t.split(/\s+/);
  for (const word of words) {
    const v = DIGIT_WORDS_HI[word];
    if (v === undefined) {
      const n = Number(word);
      if (!isNaN(n)) current += n;
      continue;
    }
    if (v === 100) { current = current ? current * 100 : 100; }
    else if (v === 1000) { total += (current || 1) * 1000; current = 0; }
    else if (v === 100000) { total += (current || 1) * 100000; current = 0; }
    else { current += v; }
  }
  total += current;
  if (total > 0) return total;

  // Fallback: largest numeric substring
  const nums = [...t.matchAll(/\b(\d{1,7}(?:\.\d+)?)\b/g)].map((m) => Number(m[1]));
  if (nums.length) return Math.max(...nums);
  return null;
}

// ─── Phone-number parser ──────────────────────────────────────────────────────
const PHONE_DIGIT_WORDS = {
  ...DIGIT_WORDS_HI,
  'डबल': 'double', 'ट्रिपल': 'triple', 'ट्रिप्पल': 'triple',
};

function parseHindiPhone(text) {
  let t = normalizeDigits(text);
  // Handle "डबल नौ" → 99, "ट्रिपल शून्य" → 000
  t = t.replace(/डबल\s+(\S+)/g, (_, w) => { const d = digitWord(w); return d !== null ? String(d) + String(d) : _; });
  t = t.replace(/ट्रिपल\s+(\S+)/g, (_, w) => { const d = digitWord(w); return d !== null ? String(d).repeat(3) : _; });
  // Replace digit words
  const result = t.replace(new RegExp(Object.keys(DIGIT_WORDS_HI).join('|'), 'g'), (w) => {
    const v = DIGIT_WORDS_HI[w];
    return v !== undefined ? String(v) : w;
  });
  // Extract only digits
  const digits = result.replace(/\D/g, '').replace(/^91/, '');
  return digits.slice(0, 10);
}

function digitWord(w) {
  const v = DIGIT_WORDS_HI[w.toLowerCase()];
  return v !== undefined ? v : (isNaN(Number(w)) ? null : Number(w));
}

// ─── Date parser ──────────────────────────────────────────────────────────────
const MONTH_NAMES_HI = {
  जनवरी: 1, फरवरी: 2, मार्च: 3, अप्रैल: 4, मई: 5, जून: 6,
  जुलाई: 7, अगस्त: 8, सितंबर: 9, अक्टूबर: 10, नवंबर: 11, दिसंबर: 12,
};

function parseHindiDate(text, refDate = new Date()) {
  const t = normalizeDigits(text.toLowerCase().trim());
  if (t.includes('आज')) return new Date(refDate);
  if (t.includes('कल')) {
    const d = new Date(refDate);
    d.setDate(d.getDate() - 1);
    return d;
  }
  if (t.includes('परसों')) {
    const d = new Date(refDate);
    d.setDate(d.getDate() - 2);
    return d;
  }

  // "16.5.26" or "16/5/26" or "16-05-2026"
  const shortDate = t.match(/(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})/);
  if (shortDate) {
    let [, day, month, year] = shortDate;
    year = Number(year) < 100 ? 2000 + Number(year) : Number(year);
    const d = new Date(year, Number(month) - 1, Number(day));
    if (!isNaN(d)) return d;
  }

  // "सोलह मई", "16 मई"
  for (const [name, m] of Object.entries(MONTH_NAMES_HI)) {
    if (t.includes(name)) {
      const dayMatch = t.match(/(\d+)/);
      let day = dayMatch ? Number(dayMatch[1]) : refDate.getDate();
      // Map Hindi digit words for day
      for (const [w, v] of Object.entries(DIGIT_WORDS_HI)) {
        if (t.includes(w)) { day = v; break; }
      }
      const d = new Date(refDate.getFullYear(), m - 1, day);
      return d;
    }
  }

  // "सोलह तारीख" → day in current month
  if (t.includes('तारीख')) {
    let day = null;
    for (const [w, v] of Object.entries(DIGIT_WORDS_HI)) {
      if (t.includes(w)) { day = v; break; }
    }
    const dayMatch = t.match(/(\d+)/);
    if (dayMatch) day = Number(dayMatch[1]);
    if (day) {
      return new Date(refDate.getFullYear(), refDate.getMonth(), day);
    }
  }

  return null;
}

// ─── Time parser ──────────────────────────────────────────────────────────────
function parseHindiTime(text) {
  const t = normalizeDigits(text.toLowerCase().trim());
  const isEvening = t.includes('शाम') || t.includes('रात');
  const isMorning = t.includes('सुबह') || t.includes('दोपहर');

  let hour = null, minute = 0, ampm = null;

  // "तीन बजे", "सवा चार बजे", "साढ़े पाँच"
  for (const [w, v] of Object.entries(DIGIT_WORDS_HI)) {
    if (t.includes(w) && v >= 1 && v <= 12) {
      if (t.includes('सवा ' + w) || t.includes('सवा' + w)) { hour = v; minute = 15; break; }
      if (t.includes('साढ़े ' + w)) { hour = v; minute = 30; break; }
      if (t.includes('पौने ' + w)) { hour = v - 1; minute = 45; break; }
      hour = v;
      break;
    }
  }

  // Numeric hour
  const numMatch = t.match(/(\d{1,2})(?::(\d{2}))?/);
  if (numMatch && hour === null) {
    hour = Number(numMatch[1]);
    minute = numMatch[2] ? Number(numMatch[2]) : minute;
  }

  if (hour === null) return null;

  if (isEvening && hour < 12) hour += 12;
  if (isMorning && hour === 12) hour = 0;

  const now = new Date();
  now.setHours(hour, minute, 0, 0);
  return now;
}

// ─── Quantity parser ──────────────────────────────────────────────────────────
function parseHindiQty(text) {
  const t = normalizeDigits(text.toLowerCase().trim());
  const UNITS = ['मीटर', 'पीस', 'जोड़ी', 'सेट'];

  // "दो मीटर", "ढाई मीटर", "आधा मीटर"
  for (const unit of UNITS) {
    if (t.includes(unit.toLowerCase())) {
      // Try special fractions
      if (t.includes('ढाई')) return { qty: 2.5, unit };
      if (t.includes('आधा') || t.includes('आधी')) return { qty: 0.5, unit };
      if (t.includes('डेढ़') || t.includes('डेढ')) return { qty: 1.5, unit };
      // Try numeric
      const numMatch = t.match(/(\d+(?:\.\d+)?)/);
      if (numMatch) return { qty: Number(numMatch[1]), unit };
      // Try word
      for (const [w, v] of Object.entries(DIGIT_WORDS_HI)) {
        if (t.includes(w) && v > 0) return { qty: v, unit };
      }
    }
  }
  return null;
}

// ─── Item / type detection ────────────────────────────────────────────────────
const ITEM_CHIPS = ['साड़ी', 'सूटिंग', 'पर्दा', 'गद्दा', 'रुई', 'कपास', 'कंबल', 'पैंट-शर्ट', 'चादर', 'तौलिया'];
const ITEM_SYNONYMS = {
  gadda: 'गद्दा', गद्दा: 'गद्दा', mattress: 'गद्दा',
  parda: 'पर्दा', पर्दा: 'पर्दा', curtain: 'पर्दा',
  saree: 'साड़ी', sari: 'साड़ी', साड़ी: 'साड़ी', साडी: 'साड़ी',
  suiting: 'सूटिंग', सूटिंग: 'सूटिंग', सूटिन: 'सूटिंग',
  blanket: 'कंबल', कंबल: 'कंबल',
  towel: 'तौलिया', तौलिया: 'तौलिया',
  sheet: 'चादर', चादर: 'चादर',
  रुई: 'रुई/कपास', कपास: 'रुई/कपास',
  'पैंट-शर्ट': 'पैंट-शर्ट', pantshirt: 'पैंट-शर्ट', pant: 'पैंट-शर्ट',
};

const BRAND_HINTS = [
  'raymond', 'रेमंड', 'bombay dyeing', 'बॉम्बे', 'welspun', 'वेलस्पन',
  'trident', 'ट्राइडेंट', 'vimal', 'विमल', 'siyaram', 'सियाराम',
];

function parseItem(text) {
  const t = text.toLowerCase();
  for (const [key, label] of Object.entries(ITEM_SYNONYMS)) {
    if (t.includes(key.toLowerCase())) return label;
  }
  return '';
}

function parseBrand(text) {
  const t = text.toLowerCase();
  for (const b of BRAND_HINTS) {
    if (t.includes(b.toLowerCase())) return b;
  }
  return '';
}

// ─── Honorific detection ──────────────────────────────────────────────────────
function parseHonorific(text) {
  const t = text.trim();
  if (t.startsWith('श्रीमती')) return { honorific: 'श्रीमती', rest: t.replace(/^श्रीमती\s*/, '') };
  if (t.startsWith('श्री')) return { honorific: 'श्री', rest: t.replace(/^श्री\s*/, '') };
  if (t.startsWith('कुमारी')) return { honorific: 'कुमारी', rest: t.replace(/^कुमारी\s*/, '') };
  return { honorific: '', rest: t };
}

// ─── Customer name parser ─────────────────────────────────────────────────────
function parseCustomerName(text) {
  const t = normalizeDigits(text).trim();
  const patterns = [
    /(?:ग्राहक|customer|नाम|name)\s+([^\d,।.]+?)(?:\s+(?:का|की|के|को|ने|को|से|में|पर|का\s+हिसाब)|$)/i,
    /^([^\d,।.]{2,40}?)\s+(?:का|की|के)\s+(?:हिसाब|खाता|गद्दा|पर्दा|साड़ी|कपड़ा|पैंट|शर्ट|daam|dam|के)/i,
    /^([अ-हa-zA-Z\s()]{2,40}?)\s+(?:\d|daam|dam|के|का)/i,
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m) {
      let name = m[1].trim().replace(/\s+/g, ' ');
      name = name.replace(/^(को|से|में)\s+/, '');
      if (name.length >= 2) return name;
    }
  }
  const beforeNum = t.split(/\d/)[0].trim();
  const words = beforeNum.split(/\s+/).filter(Boolean);
  const stop = new Set(['का', 'की', 'के', 'को', 'ने', 'से', 'में', 'पर', 'और', 'एक', 'दो', 'तीन', 'hi', 'the', 'for', 'गाँव', 'मोबाइल', 'फोन']);
  const nameWords = [];
  for (const w of words) {
    if (stop.has(w.toLowerCase())) break;
    if (ITEM_SYNONYMS[w.toLowerCase()]) break;
    if (BRAND_HINTS.some((b) => w.toLowerCase().includes(b))) break;
    nameWords.push(w);
    if (nameWords.length >= 5) break;
  }
  return nameWords.join(' ').trim();
}

// ─── Master mic slot-filling parser ──────────────────────────────────────────
/**
 * Parse a free-form Hindi sentence into form slots.
 * Returns: { name, honorific, village, phone, item, brand, qty, unit, rate, amount, type, date, time, identifierNote, note, items[] }
 */
function parseMasterSpeech(raw) {
  const text = (raw || '').trim();
  if (!text) return { ok: false, error: 'empty' };

  const t = normalizeDigits(text);
  const result = {
    ok: false,
    name: '', honorific: '', village: '', phone: '',
    identifierNote: '', item: '', brand: '',
    qty: null, unit: '', rate: 0, amount: 0,
    type: 'sale', date: new Date(), time: new Date(),
    note: '', items: [], rawSpeech: text,
  };

  // Type detection
  if (/जमा/.test(t)) result.type = 'payment';
  else if (/उधार|दिए|दिया/.test(t)) result.type = 'sale';

  // Village cue: "गाँव सोनौरा", "पता …"
  const villageMatch = t.match(/(?:गाँव|गांव|पता)\s+([^\s,।,।0-9]+)/);
  if (villageMatch) result.village = villageMatch[1].trim();

  // Mobile cue: "मोबाइल", "नंबर", "फोन"
  const mobileMatch = t.match(/(?:मोबाइल|नंबर|फोन)\s+([\u0966-\u096F\d\s]+)/);
  if (mobileMatch) result.phone = parseHindiPhone(mobileMatch[1]);

  // Brand cue: "ब्रांड रेमंड", "कंपनी …"
  const brandMatch = t.match(/(?:ब्रांड|brand|कंपनी)\s+([^\s,।]+)/);
  if (brandMatch) result.brand = brandMatch[1].trim();
  else result.brand = parseBrand(text);

  // Rate cue: "रेट दो सौ", "दाम 200", "कीमत …"
  const rateCueMatch = t.match(/(?:रेट|दाम|कीमत|दाम|rate)\s+([\u0966-\u096F\d\sअ-ह]+?)(?:\s|,|।|$)/);
  if (rateCueMatch) result.rate = parseHindiAmount(rateCueMatch[1]) || 0;

  // Amount cue: "कुल", "रकम", "रुपये"
  const amtCueMatch = t.match(/(?:कुल|रकम|total)\s+([\u0966-\u096F\d\sअ-ह]+?)(?:\s+रुपये|,|।|$)/);
  const rupeesMatch = t.match(/([\u0966-\u096F\d\sअ-ह]+?)\s+रुपये/);
  if (amtCueMatch) result.amount = parseHindiAmount(amtCueMatch[1]) || 0;
  else if (rupeesMatch) result.amount = parseHindiAmount(rupeesMatch[1]) || 0;

  // Quantity from unit cue
  const qtyResult = parseHindiQty(t);
  if (qtyResult) { result.qty = qtyResult.qty; result.unit = qtyResult.unit; }

  // Item
  result.item = parseItem(text);

  // Date
  const parsedDate = parseHindiDate(text);
  if (parsedDate) result.date = parsedDate;

  // Time
  const parsedTime = parseHindiTime(text);
  if (parsedTime) result.time = parsedTime;

  // Name + honorific (first chunk before village / mobile cue)
  const { honorific, rest: afterHonorific } = parseHonorific(t.replace(/(?:गाँव|गांव|मोबाइल|नंबर|फोन).*$/s, '').trim());
  result.honorific = honorific;

  // Identifier note: "की बहन", "झोला वाले", "गन्ना वाले"
  const idMatch = afterHonorific.match(/([^\s,।]+(?:\s+[^\s,।]+)*?)\s+की\s+(बहन|माँ|पत्नी|बेटी|दादी|नानी)/);
  const tagMatch = afterHonorific.match(/(झोला वाले|गन्ना वाले|मोटे वाले)/);
  if (idMatch) result.identifierNote = idMatch[0].trim();
  else if (tagMatch) result.identifierNote = tagMatch[1].trim();

  // Name extraction (cleaned)
  let nameChunk = afterHonorific
    .replace(result.identifierNote, '')
    .replace(/(?:गाँव|गांव|पता|मोबाइल|नंबर|फोन|ब्रांड|brand|कंपनी|रेट|दाम|कीमत|कुल|रकम|रुपये|उधार|जमा|तारीख|समय).*$/s, '')
    .trim();
  result.name = parseCustomerName(nameChunk) || nameChunk;

  // If amount still zero, try bare number approach
  if (!result.amount) {
    const nums = [...t.matchAll(/\b(\d{2,}(?:\.\d+)?)\b/g)].map((m) => Number(m[1]));
    if (nums.length) result.amount = Math.max(...nums);
  }

  // Build items array
  if (result.item || result.qty) {
    result.items = [{
      name: result.item || 'सामान',
      brand: result.brand,
      qty: result.qty || 1,
      unit: result.unit || 'पीस',
      rate: result.rate,
      amount: result.amount,
    }];
  }

  result.ok = Boolean(result.name && result.amount > 0);
  return result;
}

// ─── Original entry parser (kept for backward compat) ─────────────────────────
function parseEntryFromSpeech(raw) {
  return parseMasterSpeech(raw);
}

function isAffirmative(text) {
  const t = (text || '').toLowerCase().trim();
  const yes = ['हाँ', 'हां', 'haa', 'haan', 'han', 'yes', 'सही', 'सही है', 'ठीक', 'ठीक है', 'ok', 'okay', 'जी', 'जी हाँ', 'bilkul', 'बिल्कुल'];
  return yes.some((y) => t.includes(y));
}

function isNegative(text) {
  const t = (text || '').toLowerCase().trim();
  const no = ['नहीं', 'नही', 'nahi', 'no', 'गलत', 'रद्द', 'cancel', 'मत'];
  return no.some((n) => t.includes(n));
}

module.exports = {
  parseEntryFromSpeech,
  parseMasterSpeech,
  parseHindiAmount,
  parseHindiPhone,
  parseHindiDate,
  parseHindiTime,
  parseHindiQty,
  parseHonorific,
  parseItem,
  parseBrand,
  isAffirmative,
  isNegative,
  ITEM_SYNONYMS,
  ITEM_CHIPS,
  BRAND_HINTS,
};
