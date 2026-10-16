/**
 * public/strings.js
 *
 * ─────────────────────────────────────────────────────────────────
 * SINGLE SOURCE OF TRUTH FOR ALL TEXT IN THE APP
 * ─────────────────────────────────────────────────────────────────
 *
 * To edit any label, button text, or message shown to the user,
 * change it HERE — nowhere else.
 *
 * Loaded as a plain <script> tag before app.js so window.S is
 * available everywhere without any module bundler.
 */

window.S = {

  // ── App name & header ────────────────────────────────────────
  appName:         'खाता',
  loading:         'लोड हो रहा है…',
  error:           'कोई समस्या आई',
  tryAgain:        'दोबारा कोशिश करें',
  cancel:          'रद्द करें',
  save:            'सेव करें',
  confirm:         'पक्का करें',
  yes:             'हाँ',
  no:              'नहीं',
  back:            '← वापस',
  ok:              'ठीक है',
  search:          'खोजें',

  // ── Login screen ─────────────────────────────────────────────
  loginTitle:      'लॉगिन करें',
  usernamePlaceholder: 'यूजरनेम (shop1 या shop2)',
  pinPlaceholder:  '6-अंकी PIN',
  loginBtn:        'लॉगिन',
  loginError:      'यूजरनेम या PIN गलत है',
  loggedInAs:      'लॉगिन:',
  logout:          'लॉगआउट',

  // ── Home screen buttons ───────────────────────────────────────
  newEntry:        'नया हिसाब',
  findCustomer:    'ग्राहक खोजें',
  todayEntries:    'आज का हिसाब',

  // ── Search screen ─────────────────────────────────────────────
  searchPlaceholder: 'नाम या गाँव लिखें…',
  searchHint:      'खोजने के लिए कम से कम 1 अक्षर लिखें',
  noResults:       'कोई ग्राहक नहीं मिला',
  newCustomer:     '+ नया ग्राहक बनाएं',

  // ── New customer form ─────────────────────────────────────────
  newCustomerTitle:   'नया ग्राहक',
  customerName:       'नाम *',
  customerVillage:    'गाँव',
  customerPhone:      'फोन नंबर',
  createCustomer:     'ग्राहक बनाएं',
  customerCreated:    'ग्राहक बन गया!',
  nameRequired:       'नाम जरूरी है',

  // ── Customer detail screen ────────────────────────────────────
  balance:         'बकाया',
  balanceClear:    'हिसाब साफ है',
  owes:            'बाकी है:',
  overpaid:        'ज़्यादा दिया:',
  totalSales:      'कुल बिक्री:',
  totalPayments:   'कुल जमा:',
  entries:         'हिसाब',
  noEntries:       'कोई हिसाब नहीं',
  addSale:         '+ बिक्री जोड़ें',
  addPayment:      '+ भुगतान जोड़ें',
  undoLast:        'पिछला रद्द करें',
  undoConfirmTitle:'पिछला हिसाब रद्द करें?',
  undoConfirmMsg:  'क्या आप पिछला हिसाब रद्द करना चाहते हैं?',
  undoDone:        'हिसाब रद्द हो गया',
  noEntryToUndo:   'रद्द करने के लिए कोई हिसाब नहीं है',

  // ── Entry badges ──────────────────────────────────────────────
  sale:            'बिक्री',
  payment:         'भुगतान',
  shop1:           'दुकान १',
  shop2:           'दुकान २',

  // ── Add Entry form ────────────────────────────────────────────
  addSaleTitle:    'बिक्री जोड़ें',
  addPaymentTitle: 'भुगतान जोड़ें',
  labelAmount:     'राशि (₹) *',
  labelItem:       'कपड़ा / माल',
  labelMeters:     'मीटर',
  labelDate:       'दिनांक *',
  labelNote:       'नोट',
  amountPlaceholder: 'जैसे: 1500',
  itemPlaceholder: 'जैसे: सूती कपड़ा',
  metersPlaceholder: 'जैसे: 5.5',
  notePlaceholder:  'कोई भी जानकारी',
  next:            'आगे →',

  // ── Confirmation screen ───────────────────────────────────────
  confirmTitle:    'पक्का करें',
  confirmSave:     'हाँ, सेव करें',
  confirmCancel:   'नहीं, वापस जाएं',
  confirmSaleMsg:  'क्या आप यह बिक्री सेव करना चाहते हैं?',
  confirmPaymentMsg: 'क्या आप यह भुगतान सेव करना चाहते हैं?',
  savedSuccess:    'सेव हो गया!',

  // ── Today's entries screen ────────────────────────────────────
  todayTitle:      'आज का हिसाब',
  noTodayEntries:  'आज कोई हिसाब नहीं',

  // ── Generic field labels ──────────────────────────────────────
  rupee:           '₹',
  meters_unit:     'मीटर',
  date_label:      'दिनांक',
  note_label:      'नोट',
  shop_label:      'दुकान',
  customer_label:  'ग्राहक',
};
