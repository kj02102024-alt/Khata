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
  todayPayments:   'आज का पैसा',

  // ── Search screen ─────────────────────────────────────────────
  searchPlaceholder: 'नाम या गाँव लिखें…',
  searchHint:      'खोजने के लिए कम से कम 1 अक्षर लिखें',
  noResults:       'कोई ग्राहक नहीं मिला',
  newCustomer:     '+ नया ग्राहक बनाएं',
  onlyDuesFilter:  'केवल बकाया',
  allFilter:       'सभी ग्राहक',

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
  overpaid:        'अग्रिम (जमा):',
  advance:         'अग्रिम',
  dues:            'बाकी',
  totalSales:      'कुल बिक्री:',
  totalPayments:   'कुल जमा:',
  entries:         'हिसाब',
  noEntries:       'कोई हिसाब नहीं',
  addSale:         '+ बिक्री जोड़ें',
  addPayment:      '+ भुगतान जोड़ें',
  settleBtn:       '💰 पैसे मिले',
  undoLast:        'पिछला हिसाब रद्द करें',
  undoPayment:     'पिछला भुगतान रद्द करें',
  undoConfirmTitle:'पिछला हिसाब रद्द करें?',
  undoConfirmMsg:  'क्या आप पिछला हिसाब रद्द करना चाहते हैं?',
  undoPaymentConfirmMsg: 'क्या आप पिछला भुगतान रद्द करना चाहते हैं?',
  undoDone:        'हिसाब रद्द हो गया',
  noEntryToUndo:   'रद्द करने के लिए कोई हिसाब नहीं है',

  // ── Settlement screen & FIFO ──────────────────────────────────
  settlementTitle:      '💰 पैसे मिले (जमा)',
  payFull:              'पूरा चुकता',
  payFullDesc:          'पूरा बकाया हिसाब साफ करें',
  payPartial:           'कुछ पैसे मिले',
  payPartialDesc:       'आंशिक रकम दर्ज करें',
  settledSection:       'चुकता हिसाब (पुराने बिल)',
  pendingSection:       'बाकी हिसाब (बकाया बिल)',
  statusPaid:           'चुकता ✓',
  statusPartlyPaid:     'आंशिक चुकता',
  statusUnpaid:         'बाकी',
  paidAmountLabel:      'जमा:',
  remainingAmountLabel: 'बाकी:',
  currentBalanceLabel:  'मौजूदा बकाया:',

  // ── Touch Number Pad ──────────────────────────────────────────
  numPadClear:     'साफ करें',
  numPadBack:      '⌫',
  numPadDone:      'आगे बढ़ें →',

  // ── Voice Input (Web Speech API) ──────────────────────────────
  voiceBtn:        '🎤 बोलकर भरें',
  voiceListening:  '🔴 सुन रहे हैं... बोलिए',
  voiceNotSupported: 'इस ब्राउज़र में आवाज़ पहचान उपलब्ध नहीं है',
  voiceError:      'आवाज़ नहीं समझ आई, कृपया दोबारा बोलें',
  voiceSuccess:    'आवाज़ दर्ज हो गई!',

  // ── Photo Attachment ──────────────────────────────────────────
  photoBtn:        '📷 पर्ची / फोटो लें',
  photoAttached:   '✓ पर्ची फोटो जुड़ी है',
  photoRemove:     'फोटो हटाएं ✕',
  viewPhoto:       'पर्ची देखें 🔍',
  closePhoto:      'बंद करें ✕',

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
  labelReceipt:    'पर्ची / रसीद फोटो',
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

  // ── Today's screens ───────────────────────────────────────────
  todayTitle:           'आज का हिसाब',
  noTodayEntries:       'आज कोई हिसाब नहीं',
  todayPaymentsTitle:   'आज का पैसा (कुल जमा)',
  noTodayPayments:      'आज कोई भुगतान नहीं मिला',
  shop1Collections:     'दुकान १ जमा',
  shop2Collections:     'दुकान २ जमा',
  grandCollections:     'दोनों दुकानों का कुल पैसा',

  // ── Admin Mode (Pro View) ─────────────────────────────────────
  adminBadge:           'एडमिन',
  adminPanel:           '⚙️ एडमिन पैनल',
  adminOverviewTitle:   'मालिक रिपोर्ट (एडमिन)',
  adminAuditTitle:      'ऑडिट लॉग (सभी लेन-देन)',
  adminExportCsv:       '📥 एक्सेल / CSV डाउनलोड',
  adminExportJson:      '📥 पूरा JSON बैकअप',
  adminRestore:         'वापस चालू करें ↺',
  adminRestoreSuccess:  'हिसाब फिर से बहाल हो गया!',
  adminOnlyDeleted:     'केवल रद्द हिसाब',
  adminAllEntries:      'सभी हिसाब',
  adminShop1Net:        'दुकान १ शुद्ध हिसाब',
  adminShop2Net:        'दुकान २ शुद्ध हिसाब',
  adminTotalDues:       'कुल बकाया रकम',
  adminTotalCustomers:  'कुल ग्राहक',
  adminActiveEntries:   'चालू लेन-देन',
  adminDeletedCount:    'रद्द किए गए लेन-देन',

  // ── Generic field labels ──────────────────────────────────────
  rupee:           '₹',
  meters_unit:     'मीटर',
  date_label:      'दिनांक',
  note_label:      'नोट',
  shop_label:      'दुकान',
  customer_label:  'ग्राहक',
  role_label:      'पद',

  // ── Textile Categories ────────────────────────────────────────
  catLabel:            'माल की श्रेणी',
  cat_pant_shirt:      '👔 पैंट-शर्ट',
  cat_saree:           '🥻 साड़ी',
  cat_blanket_bedsheet:'🛏️ कम्बल/चादर',
  cat_suiting_shirting:'🧵 थान/कपड़ा',
  cat_readymade:       '🛍️ रेडीमेड',
  cat_other:           '📦 अन्य',

  // ── Textile Field Labels ──────────────────────────────────────
  labelQuantity:       'गिनती / पीस *',
  labelBrand:          'ब्रांड / कंपनी',
  labelRate:           'रेट (प्रति मीटर / पीस)',
  labelDueDate:        'उधार चुकाने की तारीख',
  quantityPlaceholder: 'जैसे: 2',
  brandPlaceholder:    'जैसे: Raymond, Vimal, Laxmipati',
  labelDesignNumber:   'डिजाइन नंबर',
  designNumberPlaceholder: 'जैसे: 405',
  ratePlaceholder:     'जैसे: 450',
  due7days:            '7 दिन',
  due15days:           '15 दिन',
  due1month:           '1 महीना',
  dueCustom:           'कस्टम तारीख',
  noDueDate:           'तारीख नहीं',

  // ── Floating Global Voice Assistant (FAB) ────────────────────
  fabVoiceTitle:       '🎤 बोलिए',
  fabListening:        '🔴 सुन रहे हैं…',
  fabVoiceHint:        'उदाहरण: "रमेश का लड़का मोनू, 1 लक्ष्मीपति साड़ी, डिजाइन 405, 1200 रुपये"',
  fabNotSupported:     'आवाज़ पहचान उपलब्ध नहीं',
  fabError:            'आवाज़ नहीं समझ आई',
  voiceConfirmTitle:   '✅ यह सही है?',
  voiceConfirmYes:     '✅ हाँ, सेव करें',
  voiceConfirmEdit:    '✏️ बदलें',
  voiceConfirmCancel:  '✕ रद्द करें',
  voiceNavHome:        'मुख्य पृष्ठ पर जा रहे हैं…',
  voiceNavSearch:      'ग्राहक खोज रहे हैं…',
  voiceNavToday:       'आज का हिसाब खोल रहे हैं…',
  voiceCustomerOpen:   'ग्राहक का हिसाब खोल रहे हैं…',
  voiceResolvingCustomer: 'ग्राहक मिला रहे हैं…',
  voiceEntryPrefilled: 'फॉर्म भर दिया गया, देख लें',
  voiceSpeakBalance:   'बकाया',     // used before amount in TTS
  voiceHasDues:        'का कुल बकाया',
  voiceHasAdvance:     'के अग्रिम जमा हैं',
  voiceNoDues:         'का हिसाब साफ है',
  voiceLoopListening:  '🔴 बोलिए "हाँ सही है" या "बदलो"…',
  voiceSavedDirect:    'हिसाब सफलतापूर्वक सेव हो गया!',
  voiceHearBalance:    '🔊 आवाज़ में सुनें',
  brand_label:         'ब्रांड',
  design_label:        'डिजाइन #',
  quantity_label:      'पीस',
  village_label:       'गाँव',
  dueDate_label:       'देय तारीख',

  // ── Active vs Settled (Cleared) Tabs ──────────────────────────
  tabActiveCustomers:  'बकायादार ग्राहक',
  tabSettledCustomers: 'चुकता ग्राहक (पुराना हिसाब)',
  noSettledCustomers:  'कोई चुकता ग्राहक नहीं है',
  noPendingCustomers:  'सबका हिसाब साफ है! कोई बकाया नहीं',

  // ── Homonym (Same-Name) Disambiguation ────────────────────────
  homonymTitle:        'एक ही नाम के कई ग्राहक',
  homonymPrompt:       'किस ग्राहक का खाता खोलना है? नंबर बोलें या छुएं:',
  homonymChoice1:      '1',
  homonymChoice2:      '2',
  homonymChoice3:      '3',
  micListeningExtended:'🔴 सुन रहे हैं... आराम से बोलिए...',
};
