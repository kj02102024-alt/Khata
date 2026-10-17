/**
 * public/app.js
 *
 * Single-Page Application for Khata PWA.
 *
 * Features:
 *   • Mobile-first, high-contrast, large touch targets for elderly shopkeepers
 *   • Payment Settlement & FIFO Reconciliation:
 *       - "💰 पैसे मिले" button
 *       - "पूरा चुकता" (pay full balance) & "कुछ पैसे मिले" (touch number pad)
 *       - Confirmation card: "<name> ने ₹X दिए. बाकी ₹Y"
 *       - Collapsible "चुकता" section with faded, strikethrough styling
 *       - Pending sales & dues view
 *       - Undo latest payment & "आज का पैसा" (today's collections by shop)
 *   • Role-Based Access Control:
 *       - Shopkeeper Mode: Simple, focused view with large buttons
 *       - Admin Mode (Pro View): Audit log with soft-delete restores,
 *         cross-shop reporting, and CSV/JSON data export
 *   • Senior Shopkeeper Accessibility:
 *       - Web Speech API (Hindi voice search and voice form fill)
 *       - Camera attachment (<input capture="environment">) with Canvas compression
 *   • Offline PWA Shell with Service Worker
 */

// ── Wait for DOM ready ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);

// ── Global App State ──────────────────────────────────────────────
const state = {
  screen:     'login',   // current screen name
  token:      null,
  user:       null,      // { shop, displayName, username, role }
  data:       {},        // screen-specific payload
  searchFilter: 'all',   // 'all' | 'dues'
  numPadValue: '',       // accumulator for touch number pad
  activePhoto: null,     // base64 data URL for receipt photo
  adminTab:   'overview', // 'overview' | 'ocr' | 'audit' | 'export'
  adminLang:  localStorage.getItem('khata_admin_lang') || 'hi', // 'hi' | 'en'
  theme:      localStorage.getItem('khata_theme') || 'dark',     // 'dark' | 'light'
};

/** Bilingual translation resolver for Pro Admin Portal */
function A(key) {
  const dict = state.adminLang === 'en' ? (window.ADMIN_EN || {}) : (window.ADMIN_HI || {});
  return dict[key] || (window.ADMIN_HI && window.ADMIN_HI[key]) || S[key] || key;
}

// ── Voice Assistant globals ────────────────────────────────────────
let fabMicEl = null;
let voiceOverlayEl = null;
let globalRecognition = null; // SpeechRecognition instance (reused)
let globalRecognitionActive = false;

// ── DOM references ─────────────────────────────────────────────────
let mainEl, headerTitleEl, headerSubEl, logoutBtn, adminNavBtn;

// ── Init ──────────────────────────────────────────────────────────
function init() {
  if (state.theme === 'light') {
    document.body.classList.add('light-theme');
  }
  mainEl        = document.getElementById('main');
  headerTitleEl = document.getElementById('header-title');
  headerSubEl   = document.getElementById('header-sub');
  logoutBtn     = document.getElementById('btn-logout');
  adminNavBtn   = document.getElementById('btn-admin-nav');
  fabMicEl      = document.getElementById('fab-mic');
  voiceOverlayEl = document.getElementById('voice-overlay');

  logoutBtn.textContent = S.logout;
  logoutBtn.addEventListener('click', logout);

  if (adminNavBtn) {
    adminNavBtn.textContent = S.adminPanel;
    adminNavBtn.addEventListener('click', () => {
      if (state.screen === 'admin') {
        navigate('home');
      } else {
        navigate('admin');
      }
    });
  }

  // Setup Photo Modal close button
  const photoModal = document.getElementById('photo-modal');
  const photoModalClose = document.getElementById('photo-modal-close');
  if (photoModalClose && photoModal) {
    photoModalClose.addEventListener('click', () => {
      photoModal.style.display = 'none';
    });
    photoModal.addEventListener('click', (e) => {
      if (e.target === photoModal) photoModal.style.display = 'none';
    });
  }

  // ── Floating Voice Assistant FAB ─────────────────────────────
  setupGlobalVoiceAssistant();

  // ── Voice Overlay close button ───────────────────────────────
  const voClose = document.getElementById('vo-close');
  if (voClose) voClose.addEventListener('click', closeVoiceOverlay);

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(console.warn);
  }

  // Restore session from localStorage
  const saved = localStorage.getItem('khata_session');
  if (saved) {
    try {
      const session = JSON.parse(saved);
      state.token = session.token;
      state.user  = session.user;
      navigate('home');
      return;
    } catch (_) { /* invalid session data, fall through to login */ }
  }

  render();
}

// ── Navigation ────────────────────────────────────────────────────
function navigate(screen, data = {}) {
  state.screen = screen;
  state.data   = data;
  state.activePhoto = null; // reset photo on screen transition
  render();
}

// ── Render Dispatcher ─────────────────────────────────────────────
function render() {
  // Update Header
  headerTitleEl.textContent = S.appName;
  if (state.user) {
    const roleBadge = state.user.role === 'admin' ? ` [${S.adminBadge}]` : '';
    headerSubEl.textContent = `${S.loggedInAs} ${state.user.displayName || state.user.username}${roleBadge}`;
    logoutBtn.style.display = 'block';

    if (adminNavBtn) {
      if (state.user.role === 'admin') {
        adminNavBtn.style.display = 'block';
        adminNavBtn.textContent = state.screen === 'admin' ? S.appName : S.adminPanel;
      } else {
        adminNavBtn.style.display = 'none';
      }
    }
  } else {
    headerSubEl.textContent = '';
    logoutBtn.style.display = 'none';
    if (adminNavBtn) adminNavBtn.style.display = 'none';
  }

  // Clear main content
  mainEl.innerHTML = '';

  switch (state.screen) {
    case 'login':          return renderLogin();
    case 'home':           return renderHome();
    case 'search':         return renderSearch();
    case 'newCustomer':    return renderNewCustomer();
    case 'customerDetail': return renderCustomerDetail();
    case 'settlement':     return renderSettlement();
    case 'confirmPayment': return renderConfirmPayment();
    case 'addEntry':       return renderAddEntry();
    case 'confirmEntry':   return renderConfirmEntry();
    case 'today':          return renderToday();
    case 'todayPayments':  return renderTodayPayments();
    case 'admin':          return renderAdmin();
    case 'diaryUpload':    return renderDiaryUpload();
    default:               return renderHome();
  }
}

// ═══════════════════════════════════════════════════════════════════
// SCREEN: Login
// ═══════════════════════════════════════════════════════════════════
function renderLogin() {
  mainEl.innerHTML = `
    <div class="login-box screen">
      <div class="login-title">${S.appName}</div>

      <div class="form-group">
        <label for="inp-username">${S.loginTitle}</label>
        <input id="inp-username" type="text"
               placeholder="${S.usernamePlaceholder}"
               autocomplete="username"
               autocapitalize="none" />
      </div>

      <div class="form-group">
        <label for="inp-pin">PIN</label>
        <input id="inp-pin" type="password" inputmode="numeric"
               placeholder="${S.pinPlaceholder}"
               maxlength="8"
               autocomplete="current-password" />
      </div>

      <div id="login-error" style="color:#ef5350;font-size:1rem;margin-bottom:12px;display:none"></div>

      <button class="btn btn-primary" id="btn-login">${S.loginBtn}</button>
    </div>
  `;

  document.getElementById('btn-login').addEventListener('click', doLogin);
  document.getElementById('inp-pin').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLogin();
  });
}

async function doLogin() {
  const username = document.getElementById('inp-username').value.trim();
  const pin      = document.getElementById('inp-pin').value.trim();
  const errEl    = document.getElementById('login-error');
  const btn      = document.getElementById('btn-login');

  errEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = S.loading;

  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body:   { username, pin },
      noAuth: true,
    });

    state.token = data.token;
    state.user  = {
      shop:        data.shop,
      displayName: data.displayName,
      username:    username,
      role:        data.role || 'shopkeeper',
    };

    localStorage.setItem('khata_session', JSON.stringify({
      token: state.token,
      user:  state.user,
    }));

    navigate('home');
  } catch (err) {
    errEl.textContent    = err.message || S.loginError;
    errEl.style.display  = 'block';
    btn.disabled         = false;
    btn.textContent      = S.loginBtn;
  }
}

function logout() {
  state.token  = null;
  state.user   = null;
  localStorage.removeItem('khata_session');
  navigate('login');
}

// ═══════════════════════════════════════════════════════════════════
// SCREEN: Home — Dual Mode
//   Shopkeeper role → Ultra-Simple 3-Button Interface (90px+ targets)
//   Admin role      → Full Pro Dashboard Grid
// ═══════════════════════════════════════════════════════════════════
function renderHome() {
  const isAdmin = state.user?.role === 'admin';

  if (!isAdmin) {
    // ── SHOPKEEPER MODE: 3 Giant Buttons (100% Devanagari, High Contrast) ──
    mainEl.innerHTML = `
      <div class="screen">
        <div class="shopkeeper-grid">

          <!-- Button 1: 🎤 बोलकर हिसाब लिखें (Voice-First Entry) -->
          <button class="shopkeeper-btn shopkeeper-btn-voice" id="btn-sk-voice">
            <span class="shopkeeper-btn-icon">🎤</span>
            <span>${S.shopkeeperVoiceEntry}</span>
          </button>

          <!-- Button 2: 🔍 ग्राहक खोजें (Active Customer Directory) -->
          <button class="shopkeeper-btn shopkeeper-btn-search" id="btn-sk-search">
            <span class="shopkeeper-btn-icon">🔍</span>
            <span>${S.shopkeeperFindCustomer}</span>
          </button>

          <!-- Button 3: 📷 पुरानी डायरी की फोटो भेजें (OCR Diary Upload) -->
          <button class="shopkeeper-btn shopkeeper-btn-diary" id="btn-sk-diary">
            <span class="shopkeeper-btn-icon">📷</span>
            <span>${S.shopkeeperDiaryPhoto}</span>
          </button>

        </div>
      </div>
    `;

    // Button 1: Trigger the global floating voice assistant (FAB)
    document.getElementById('btn-sk-voice').addEventListener('click', () => {
      if (fabMicEl) fabMicEl.click();
    });

    // Button 2: Open customer directory (shows pending-dues tab by default)
    document.getElementById('btn-sk-search').addEventListener('click', () => {
      state.searchTab = 'pending';
      navigate('search', { mode: 'view' });
    });

    // Button 3: Open diary photo upload flow
    document.getElementById('btn-sk-diary').addEventListener('click', () => {
      navigate('diaryUpload');
    });

    return;
  }

  // ── ADMIN MODE: Full Pro Dashboard Grid ──────────────────────────
  mainEl.innerHTML = `
    <div class="screen">
      <div class="home-grid">
        <button class="home-btn home-btn-new" id="btn-new-entry">📝 ${S.newEntry}</button>
        <button class="home-btn home-btn-search" id="btn-search">🔍 ${S.findCustomer}</button>
        <button class="home-btn home-btn-today" id="btn-today">📋 ${S.todayEntries}</button>
        <button class="home-btn" id="btn-today-payments" style="background:#00796b;color:#fff;">💰 ${S.todayPayments}</button>
        <button class="home-btn" id="btn-home-admin" style="background:#512da8;color:#fff;margin-top:8px;">
          ⚙️ ${S.adminPanel}
        </button>
      </div>
    </div>
  `;

  document.getElementById('btn-new-entry').addEventListener('click', () => navigate('search', { mode: 'addEntry' }));
  document.getElementById('btn-search').addEventListener('click',    () => navigate('search', { mode: 'view' }));
  document.getElementById('btn-today').addEventListener('click',     () => navigate('today'));
  document.getElementById('btn-today-payments').addEventListener('click', () => navigate('todayPayments'));
  document.getElementById('btn-home-admin').addEventListener('click', () => navigate('admin'));
}



// ═══════════════════════════════════════════════════════════════════
// SCREEN: Search Customers (With Voice Input & Dues Filter)
// ═══════════════════════════════════════════════════════════════════
function renderSearch() {
  const mode = state.data.mode || 'view'; // 'view' | 'addEntry'

  mainEl.innerHTML = `
    <div class="screen">
      <div class="page-title">🔍 ${S.findCustomer}</div>

      <!-- Voice Toolbar -->
      <div class="voice-toolbar">
        <button class="btn-voice" id="btn-voice-search">
          <span>🎤</span> <span id="voice-search-label">${S.voiceBtn}</span>
        </button>
        <span id="voice-search-status" class="voice-status-text"></span>
      </div>

      <!-- Search Input -->
      <div class="search-wrapper">
        <input id="search-input" class="search-input" type="search"
               placeholder="${S.searchPlaceholder}"
               autocomplete="off" />
        <span class="search-icon">🔍</span>
      </div>

      <!-- Active vs Settled Customer Tabs -->
      <div class="customer-tabs">
        <button class="customer-tab ${(!state.searchTab || state.searchTab === 'pending') ? 'active' : ''}" id="tab-pending">
          ⏳ ${S.tabActiveCustomers}
        </button>
        <button class="customer-tab ${state.searchTab === 'settled' ? 'active' : ''}" id="tab-settled">
          ✓ ${S.tabSettledCustomers}
        </button>
      </div>

      <div id="search-results"></div>

      <button class="btn btn-ghost mt-16" id="btn-new-customer" style="min-height:64px;font-size:1.15rem">
        ➕ ${S.newCustomer}
      </button>

      <button class="btn btn-secondary mt-16" id="btn-back">${S.back}</button>
    </div>
  `;

  const input       = document.getElementById('search-input');
  const results     = document.getElementById('search-results');
  const tabPending  = document.getElementById('tab-pending');
  const tabSettled  = document.getElementById('tab-settled');
  const voiceBtn    = document.getElementById('btn-voice-search');
  const voiceStatus = document.getElementById('voice-search-status');

  state.searchTab = state.searchTab || 'pending';

  // Trigger search function
  const triggerSearch = () => {
    const q = input.value.trim();
    results.innerHTML = `<div class="spinner"></div>`;
    doSearch(q, results, mode, state.searchTab);
  };

  let debounceTimer;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(triggerSearch, 300);
  });

  tabPending.addEventListener('click', () => {
    state.searchTab = 'pending';
    tabPending.classList.add('active');
    tabSettled.classList.remove('active');
    triggerSearch();
  });

  tabSettled.addEventListener('click', () => {
    state.searchTab = 'settled';
    tabSettled.classList.add('active');
    tabPending.classList.remove('active');
    triggerSearch();
  });

  // Voice Search setup (Web Speech API)
  setupVoiceRecognition({
    buttonEl: voiceBtn,
    statusEl: voiceStatus,
    onResult: (transcript) => {
      input.value = transcript;
      triggerSearch();
      showToast(`${S.voiceSuccess}: "${transcript}"`);
    },
  });

  document.getElementById('btn-new-customer').addEventListener('click',
    () => navigate('newCustomer', { returnMode: mode }));
  document.getElementById('btn-back').addEventListener('click', () => navigate('home'));

  // Initial load
  triggerSearch();
  setTimeout(() => input.focus(), 100);
}

async function doSearch(q, container, mode, status = 'pending') {
  try {
    const url = `/api/customers/search?q=${encodeURIComponent(q)}&status=${status}`;
    const customers = await api(url);

    if (!customers.length) {
      const emptyMsg = status === 'pending'
        ? (q ? S.noResults : S.noPendingCustomers)
        : (q ? S.noResults : S.noSettledCustomers);
      container.innerHTML = `<p class="empty-state" style="font-size:1.15rem;padding:24px">${emptyMsg}</p>`;
      return;
    }

    container.innerHTML = customers.map((c) => {
      let balanceBadge = '';
      if (c.balance > 0) {
        balanceBadge = `<span class="badge badge-unpaid" style="font-weight:900;font-size:1.05rem;background:#d32f2f;color:#fff;padding:4px 12px;border-radius:20px;">${S.dues}: ₹${c.balance.toLocaleString('hi-IN')}</span>`;
      } else if (c.balance < 0) {
        balanceBadge = `<span class="badge badge-advance">${S.advance}: ₹${Math.abs(c.balance).toLocaleString('hi-IN')}</span>`;
      } else {
        balanceBadge = `<span class="badge badge-paid">${S.balanceClear}</span>`;
      }

      return `
        <div class="customer-row" data-id="${c._id}" data-mode="${mode}" style="min-height:84px;padding:16px">
          <div>
            <div class="customer-name" style="font-size:1.35rem;font-weight:900;${c.balance > 0 ? 'color:#ff5252;' : ''}">
              ${esc(c.name)}${c.relationTag ? ` <span style="font-weight:400;font-size:1.05rem;color:var(--text-muted)">(${esc(c.relationTag)})</span>` : ''}
            </div>
            <div class="customer-village" style="font-size:1.05rem;margin-top:4px">
              ${c.village ? `📍 ${esc(c.village)}` : ''}
              ${c.phone ? ` · 📞 ${esc(c.phone)}` : ''}
            </div>
            <div style="margin-top:8px">${balanceBadge}</div>
          </div>
          <span style="font-size:2rem;color:var(--text-muted)">›</span>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.customer-row').forEach((row) => {
      row.addEventListener('click', () => {
        const id = row.dataset.id;
        const name = row.querySelector('.customer-name').textContent;
        if (row.dataset.mode === 'addEntry') {
          navigate('addEntry', { customerId: id, customerName: name });
        } else {
          navigate('customerDetail', { customerId: id });
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
}

// ═══════════════════════════════════════════════════════════════════
// SCREEN: New Customer
// ═══════════════════════════════════════════════════════════════════
function renderNewCustomer() {
  mainEl.innerHTML = `
    <div class="screen">
      <div class="page-title">${S.newCustomerTitle}</div>

      <div class="voice-toolbar">
        <button class="btn-voice" id="btn-voice-nc">
          <span>🎤</span> <span>${S.voiceBtn}</span>
        </button>
        <span id="voice-nc-status" class="voice-status-text"></span>
      </div>

      <div class="form-group">
        <label>${S.customerName}</label>
        <input id="nc-name" type="text" placeholder="जैसे: रमेश"
               autocomplete="off" />
      </div>
      <div class="form-group">
        <label>संबंध / उपनाम (वैकल्पिक)</label>
        <input id="nc-relation" type="text" placeholder="जैसे: लड़का मोनू, पंच, मास्टर जी"
               autocomplete="off" />
      </div>
      <div class="form-group">
        <label>${S.customerVillage}</label>
        <input id="nc-village" type="text" placeholder="जैसे: मनोहरपुर"
               autocomplete="off" />
      </div>
      <div class="form-group">
        <label>${S.customerPhone}</label>
        <input id="nc-phone" type="tel" placeholder="जैसे: 9876543210" />
      </div>

      <div id="nc-error" style="color:#ef5350;font-size:1rem;margin-bottom:12px;display:none"></div>

      <div class="gap-12">
        <button class="btn btn-primary" id="btn-create-customer">${S.createCustomer}</button>
        <button class="btn btn-secondary" id="btn-back">${S.back}</button>
      </div>
    </div>
  `;

  setupVoiceRecognition({
    buttonEl: document.getElementById('btn-voice-nc'),
    statusEl: document.getElementById('voice-nc-status'),
    onResult: (transcript) => {
      // If contains phone number digits
      const digits = transcript.replace(/\D/g, '');
      if (digits.length >= 10) {
        document.getElementById('nc-phone').value = digits.slice(-10);
      } else {
        document.getElementById('nc-name').value = transcript;
      }
      showToast(`${S.voiceSuccess}: "${transcript}"`);
    },
  });

  document.getElementById('btn-create-customer').addEventListener('click', doCreateCustomer);
  document.getElementById('btn-back').addEventListener('click', () =>
    navigate('search', { mode: state.data.returnMode || 'view' }));
}

async function doCreateCustomer() {
  const name        = document.getElementById('nc-name').value.trim();
  const relationTag = document.getElementById('nc-relation')?.value.trim() || '';
  const village     = document.getElementById('nc-village').value.trim();
  const phone       = document.getElementById('nc-phone').value.trim();
  const errEl       = document.getElementById('nc-error');
  const btn         = document.getElementById('btn-create-customer');

  if (!name) {
    errEl.textContent   = S.nameRequired;
    errEl.style.display = 'block';
    return;
  }

  errEl.style.display = 'none';
  btn.disabled        = true;
  btn.textContent     = S.loading;

  try {
    const customer = await api('/api/customers', {
      method: 'POST',
      body:   { name, relationTag, village, phone },
    });

    showToast(S.customerCreated);

    const returnMode = state.data.returnMode || 'view';
    if (returnMode === 'addEntry') {
      navigate('addEntry', { customerId: customer._id, customerName: customer.name });
    } else {
      navigate('customerDetail', { customerId: customer._id });
    }
  } catch (err) {
    errEl.textContent   = err.message;
    errEl.style.display = 'block';
    btn.disabled        = false;
    btn.textContent     = S.createCustomer;
  }
}

// ═══════════════════════════════════════════════════════════════════
// SCREEN: Customer Detail with FIFO Reconciliation & "💰 पैसे मिले"
// ═══════════════════════════════════════════════════════════════════
function renderCustomerDetail() {
  mainEl.innerHTML = `<div class="spinner"></div>`;

  api(`/api/customers/${state.data.customerId}/detail`)
    .then((data) => showCustomerDetail(data))
    .catch((err) => {
      mainEl.innerHTML = `<p class="empty-state">${err.message}</p>`;
    });
}

function showCustomerDetail(data) {
  const { customer, entries, paidSales, pendingSales, payments, balance, dues, advance, totalSales, totalPayments } = data;

  const balanceClass = balance > 0 ? 'positive' : balance < 0 ? 'negative' : 'zero';
  const balanceLabel = balance > 0
    ? S.owes
    : balance < 0
      ? S.overpaid
      : S.balanceClear;

  mainEl.innerHTML = `
    <div class="screen">
      <button class="btn btn-secondary btn-sm mb-16" id="btn-back">${S.back}</button>

      <div class="customer-header">
        <div class="customer-detail-name">${esc(customer.name)}</div>
        <div class="customer-detail-sub">
          ${customer.village ? `📍 ${esc(customer.village)}` : ''}
          ${customer.phone   ? ` · 📞 ${esc(customer.phone)}` : ''}
        </div>
      </div>

      <!-- Huge Balance Display -->
      <div class="balance-box">
        <div class="balance-label">${S.balance}</div>
        <div class="balance-amount ${balanceClass}">
          ${balance === 0 ? S.balanceClear : `${S.rupee}${Math.abs(balance).toLocaleString('hi-IN')}`}
        </div>
        <div class="balance-label" style="margin-top:6px;font-size:1.1rem;font-weight:700">
          ${balanceLabel}
        </div>
        <div class="balance-sub">
          ${S.totalSales} ${S.rupee}${totalSales.toLocaleString('hi-IN')} &nbsp;|&nbsp;
          ${S.totalPayments} ${S.rupee}${totalPayments.toLocaleString('hi-IN')}
        </div>
        <div>
          <button class="btn-hear-balance" id="btn-hear-balance" type="button">
            ${S.voiceHearBalance}
          </button>
        </div>
      </div>

      <!-- Prominent Green Settlement Button -->
      <button class="btn btn-settle" id="btn-settle">${S.settleBtn}</button>

      <!-- Action Row -->
      <div class="action-row">
        <button class="btn btn-primary btn-sm" id="btn-add-sale">${S.addSale}</button>
        <button class="btn btn-ghost btn-sm" id="btn-add-payment">${S.addPayment}</button>
      </div>

      <!-- Undo Actions Row -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px">
        <button class="btn btn-danger btn-sm" id="btn-undo-payment">${S.undoPayment}</button>
        <button class="btn btn-secondary btn-sm" id="btn-undo-last">${S.undoLast}</button>
      </div>

      <!-- Active / Pending Sales (बाकी बिल) -->
      <div class="page-title" style="font-size:1.25rem;margin-bottom:12px;color:#ffa726">
        ⏳ ${S.pendingSection} (${pendingSales.length})
      </div>

      ${pendingSales.length === 0
        ? `<div class="card text-center" style="color:#81c784;font-size:1.1rem;padding:20px">
             ✓ कोई बाकी बिल नहीं है!
           </div>`
        : pendingSales.map((e) => renderSaleItem(e, false)).join('')
      }

      <!-- Collapsible Paid / Settled Sales (चुकता बिल) with Strikethrough -->
      ${paidSales.length > 0 ? `
        <details class="settled-section">
          <summary>
            ✓ ${S.settledSection} (${paidSales.length} बिल) ▼
          </summary>
          <div style="margin-top:12px">
            ${paidSales.map((e) => renderSaleItem(e, true)).join('')}
          </div>
        </details>
      ` : ''}

      <!-- Recent Payments Section -->
      <div class="page-title" style="font-size:1.25rem;margin-top:28px;margin-bottom:12px;color:#66bb6a">
        💰 जमा भुगतान (${payments.length})
      </div>

      ${payments.length === 0
        ? `<p class="empty-state" style="margin-top:20px">${S.noEntries}</p>`
        : payments.map((e) => renderPaymentItem(e)).join('')
      }
    </div>
  `;

  document.getElementById('btn-back').addEventListener('click', () => navigate('home'));

  // Read balance aloud helper
  const triggerBalanceSpeech = () => {
    let balanceText = '';
    if (balance > 0) {
      balanceText = `${customer.name} का कुल बाकी ${balance.toLocaleString('hi-IN')} रुपये है।`;
    } else if (balance < 0) {
      balanceText = `${customer.name} के ${Math.abs(balance).toLocaleString('hi-IN')} रुपये अग्रिम जमा हैं।`;
    } else {
      balanceText = `${customer.name} का हिसाब साफ है।`;
    }
    speakHindi(balanceText);
  };

  const hearBalanceBtn = document.getElementById('btn-hear-balance');
  if (hearBalanceBtn) {
    hearBalanceBtn.addEventListener('click', triggerBalanceSpeech);
  }

  // If opened via voice command, speak the balance automatically!
  if (state.data.speakBalanceOnLoad) {
    state.data.speakBalanceOnLoad = false;
    setTimeout(triggerBalanceSpeech, 350);
  }

  // Settlement button opens the two settlement options
  document.getElementById('btn-settle').addEventListener('click', () => {
    navigate('settlement', {
      customerId:   customer._id,
      customerName: customer.name,
      balance:      balance,
      dues:         dues,
      advance:      advance,
    });
  });

  document.getElementById('btn-add-sale').addEventListener('click', () =>
    navigate('addEntry', { customerId: customer._id, customerName: customer.name, type: 'sale' }));
  document.getElementById('btn-add-payment').addEventListener('click', () =>
    navigate('addEntry', { customerId: customer._id, customerName: customer.name, type: 'payment' }));

  document.getElementById('btn-undo-payment').addEventListener('click', () => confirmUndoPayment(customer._id));
  document.getElementById('btn-undo-last').addEventListener('click', () => confirmUndoEntry(customer._id));

  // Attach photo viewer triggers
  attachPhotoClickEvents();
}

function renderSaleItem(e, isSettled) {
  const shopLabel = e.shop === 'shop1' ? S.shop1 : S.shop2;
  const dateStr   = formatDate(e.date);
  const recon     = e.reconciliation || { status: 'unpaid', paidAmount: 0, remainingAmount: e.amount };

  let statusBadge = '';
  if (isSettled || recon.status === 'paid') {
    statusBadge = `<span class="badge badge-paid">${S.statusPaid}</span>`;
  } else if (recon.status === 'partly_paid') {
    statusBadge = `<span class="badge badge-partly">${S.statusPartlyPaid} (बाकी ₹${recon.remainingAmount.toLocaleString('hi-IN')})</span>`;
  } else {
    statusBadge = `<span class="badge badge-unpaid">${S.statusUnpaid} ₹${e.amount.toLocaleString('hi-IN')}</span>`;
  }

  const itemClass = isSettled ? 'entry-item sale paid-sale' : recon.status === 'partly_paid' ? 'entry-item sale partly-paid-sale' : 'entry-item sale';

  const catLabelMap = {
    pant_shirt: S.cat_pant_shirt, saree: S.cat_saree,
    blanket_bedsheet: S.cat_blanket_bedsheet,
    suiting_shirting: S.cat_suiting_shirting,
    readymade: S.cat_readymade, other: S.cat_other,
  };

  return `
    <div class="${itemClass}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          ${statusBadge}
          <span class="badge badge-${e.shop}">${shopLabel}</span>
          ${e.category && e.category !== 'other' ? `
            <span class="badge-cat badge-cat-${e.category}">
              ${esc(catLabelMap[e.category] || e.category)}
            </span>
          ` : ''}
        </div>
        <div class="entry-amount">${S.rupee}${Number(e.amount).toLocaleString('hi-IN')}</div>
      </div>

      <div class="entry-meta">
        ${dateStr}
        ${e.item         ? ` · <strong>${esc(e.item)}</strong>` : ''}
        ${e.brand        ? ` · 🏷️ <strong>${esc(e.brand)}</strong>` : ''}
        ${e.designNumber ? ` · 🎨 <strong>#${esc(e.designNumber)}</strong>` : ''}
        ${e.meters       ? ` · 📏 ${e.meters} ${S.meters_unit}`   : ''}
        ${e.quantity     ? ` · 🔢 ${e.quantity} पीस`              : ''}
        ${e.rate         ? ` · @ ₹${e.rate}`                      : ''}
        ${e.dueDate      ? `<br><span style="color:#ffb74d">📅 देय: ${formatDate(e.dueDate)}</span>` : ''}
        ${e.note         ? `<br><span style="color:#b0bec5">📝 ${esc(e.note)}</span>` : ''}
      </div>

      ${recon.status === 'partly_paid' && !isSettled ? `
        <div style="font-size:0.85rem;color:#ffb74d;margin-top:6px;font-weight:700">
          ${S.paidAmountLabel} ₹${recon.paidAmount.toLocaleString('hi-IN')} | ${S.remainingAmountLabel} ₹${recon.remainingAmount.toLocaleString('hi-IN')}
        </div>
      ` : ''}

      ${e.photo ? `
        <div class="receipt-thumbnail-badge" data-photo="${esc(e.photo)}">
          📷 ${S.viewPhoto}
        </div>
      ` : ''}
    </div>
  `;
}

function renderPaymentItem(e) {
  const shopLabel = e.shop === 'shop1' ? S.shop1 : S.shop2;
  const dateStr   = formatDate(e.date);

  return `
    <div class="entry-item payment">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <span class="badge badge-payment">${S.payment} ✓</span>
          <span class="badge badge-${e.shop}">${shopLabel}</span>
        </div>
        <div class="entry-amount" style="color:#66bb6a">${S.rupee}${Number(e.amount).toLocaleString('hi-IN')}</div>
      </div>
      <div class="entry-meta">
        ${dateStr}
        ${e.note ? ` · <span style="color:#b0bec5">📝 ${esc(e.note)}</span>` : ''}
      </div>
      ${e.photo ? `
        <div class="receipt-thumbnail-badge" data-photo="${esc(e.photo)}">
          📷 ${S.viewPhoto}
        </div>
      ` : ''}
    </div>
  `;
}

async function confirmUndoPayment(customerId) {
  if (!confirm(S.undoPaymentConfirmMsg)) return;
  try {
    await api('/api/entries/undo-payment', { method: 'POST', body: { customerId } });
    showToast(S.undoDone);
    navigate('customerDetail', { customerId });
  } catch (err) {
    showToast(err.message || S.error);
  }
}

async function confirmUndoEntry(customerId) {
  if (!confirm(S.undoConfirmMsg)) return;
  try {
    await api('/api/entries/undo', { method: 'POST', body: { customerId } });
    showToast(S.undoDone);
    navigate('customerDetail', { customerId });
  } catch (err) {
    showToast(err.message || S.noEntryToUndo);
  }
}

function attachPhotoClickEvents() {
  document.querySelectorAll('.receipt-thumbnail-badge').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const photoSrc = btn.dataset.photo;
      if (photoSrc) {
        const modal = document.getElementById('photo-modal');
        const modalImg = document.getElementById('photo-modal-img');
        modalImg.src = photoSrc;
        modal.style.display = 'flex';
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════════
// SCREEN: Settlement Options & Large Touch Number Pad
// ═══════════════════════════════════════════════════════════════════
function renderSettlement() {
  const { customerId, customerName, dues, advance, balance } = state.data;
  state.numPadValue = '';

  mainEl.innerHTML = `
    <div class="screen">
      <button class="btn btn-secondary btn-sm mb-16" id="btn-back">${S.back}</button>
      <div class="page-title">${S.settlementTitle}</div>

      <!-- Customer & Dues Header -->
      <div class="card mb-16">
        <div style="font-size:1.3rem;font-weight:900">👤 ${esc(customerName)}</div>
        <div style="font-size:1.1rem;margin-top:6px;color:#ffa726">
          ${S.currentBalanceLabel} <strong>${dues > 0 ? `₹${dues.toLocaleString('hi-IN')}` : S.balanceClear}</strong>
          ${advance > 0 ? ` (${S.advance}: ₹${advance.toLocaleString('hi-IN')})` : ''}
        </div>
      </div>

      <!-- Two Large Settlement Options -->
      <div class="settlement-options-grid" id="settlement-choices">

        <!-- Option 1: पूरा चुकता -->
        <div class="settlement-card-btn full-pay" id="opt-full-pay">
          <div class="settlement-card-title">✅ ${S.payFull} (₹${dues.toLocaleString('hi-IN')})</div>
          <div class="settlement-card-sub">${S.payFullDesc}</div>
        </div>

        <!-- Option 2: कुछ पैसे मिले (आंशिक भुगतान) -->
        <div class="settlement-card-btn" id="opt-partial-pay">
          <div class="settlement-card-title">🔢 ${S.payPartial}</div>
          <div class="settlement-card-sub">${S.payPartialDesc}</div>
        </div>
      </div>

      <!-- Touch Number Pad Container (Shown when Partial chosen) -->
      <div id="numpad-container" style="display:none;margin-top:20px;">
        <div class="numpad-display-box">
          <div class="numpad-display-label">${S.paidReceived}</div>
          <div class="numpad-display-value" id="numpad-val">₹0</div>
        </div>

        <div class="numpad-grid">
          <button class="numpad-btn" data-val="1">1</button>
          <button class="numpad-btn" data-val="2">2</button>
          <button class="numpad-btn" data-val="3">3</button>
          <button class="numpad-btn" data-val="4">4</button>
          <button class="numpad-btn" data-val="5">5</button>
          <button class="numpad-btn" data-val="6">6</button>
          <button class="numpad-btn" data-val="7">7</button>
          <button class="numpad-btn" data-val="8">8</button>
          <button class="numpad-btn" data-val="9">9</button>
          <button class="numpad-btn btn-fn" id="np-clear">${S.numPadClear}</button>
          <button class="numpad-btn" data-val="0">0</button>
          <button class="numpad-btn btn-fn" id="np-back">${S.numPadBack}</button>
        </div>

        <button class="btn btn-primary" id="btn-numpad-done">${S.numPadDone}</button>
      </div>
    </div>
  `;

  document.getElementById('btn-back').addEventListener('click', () =>
    navigate('customerDetail', { customerId }));

  // Option 1: Full settlement
  document.getElementById('opt-full-pay').addEventListener('click', () => {
    if (dues <= 0) {
      showToast('बाकी हिसाब पहले से शून्य है!');
      return;
    }
    proceedToConfirmation(dues);
  });

  // Option 2: Partial settlement -> reveals Touch Number Pad
  const numPadContainer = document.getElementById('numpad-container');
  const numPadVal = document.getElementById('numpad-val');

  document.getElementById('opt-partial-pay').addEventListener('click', () => {
    document.getElementById('settlement-choices').style.display = 'none';
    numPadContainer.style.display = 'block';
  });

  // Number pad button handlers
  document.querySelectorAll('.numpad-btn[data-val]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const digit = btn.dataset.val;
      if (state.numPadValue === '0') state.numPadValue = '';
      if (state.numPadValue.length < 7) { // limit to reasonable max length
        state.numPadValue += digit;
        numPadVal.textContent = `₹${Number(state.numPadValue).toLocaleString('hi-IN')}`;
      }
    });
  });

  document.getElementById('np-clear').addEventListener('click', () => {
    state.numPadValue = '';
    numPadVal.textContent = '₹0';
  });

  document.getElementById('np-back').addEventListener('click', () => {
    state.numPadValue = state.numPadValue.slice(0, -1);
    numPadVal.textContent = state.numPadValue ? `₹${Number(state.numPadValue).toLocaleString('hi-IN')}` : '₹0';
  });

  document.getElementById('btn-numpad-done').addEventListener('click', () => {
    const amt = parseInt(state.numPadValue, 10);
    if (!amt || amt <= 0) {
      showToast('कृपया राशि दर्ज करें');
      return;
    }
    proceedToConfirmation(amt);
  });

  function proceedToConfirmation(amount) {
    navigate('confirmPayment', {
      customerId,
      customerName,
      dues,
      amount,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════
// SCREEN: Settlement Confirmation Card (<name> ने ₹X दिए. बाकी ₹Y)
// ═══════════════════════════════════════════════════════════════════
function renderConfirmPayment() {
  const { customerId, customerName, dues, amount } = state.data;
  const newBalance = dues - amount;

  let balanceText = '';
  if (newBalance > 0) {
    balanceText = `बाकी ₹${newBalance.toLocaleString('hi-IN')}`;
  } else if (newBalance === 0) {
    balanceText = 'हिसाब पूरा साफ!';
  } else {
    balanceText = `अग्रिम ₹${Math.abs(newBalance).toLocaleString('hi-IN')}`;
  }

  mainEl.innerHTML = `
    <div class="screen">
      <div class="page-title">${S.confirmTitle}</div>

      <!-- Confirmation Card -->
      <div class="confirm-box" style="border-color:#66bb6a">
        <div style="font-size:1.4rem;font-weight:900;text-align:center;color:#66bb6a;margin-bottom:12px">
          ${esc(customerName)} ने ₹${amount.toLocaleString('hi-IN')} दिए
        </div>
        <div style="font-size:1.6rem;font-weight:900;text-align:center;color:#fff;margin-bottom:16px">
          ${balanceText}
        </div>

        <div class="confirm-row">
          <span class="confirm-key">${S.customer_label}</span>
          <span class="confirm-value">${esc(customerName)}</span>
        </div>
        <div class="confirm-row">
          <span class="confirm-key">${S.paidReceived}</span>
          <span class="confirm-value" style="color:#66bb6a">₹${amount.toLocaleString('hi-IN')}</span>
        </div>
        <div class="confirm-row">
          <span class="confirm-key">${S.date_label}</span>
          <span class="confirm-value">
            <input type="date" id="inp-pay-date" style="font-size:1rem;padding:6px;width:auto;" />
          </span>
        </div>
        <div class="confirm-row">
          <span class="confirm-key">${S.shop_label}</span>
          <span class="confirm-value">${state.user?.shop === 'shop1' ? S.shop1 : S.shop2}</span>
        </div>
        <div class="form-group mt-16">
          <label>${S.labelNote}</label>
          <input type="text" id="inp-pay-note" placeholder="जैसे: ऑनलाइन / नकद" />
        </div>

        <!-- Receipt Camera Section -->
        <div class="photo-box">
          <input type="file" id="inp-pay-photo-file" accept="image/*" capture="environment" style="display:none" />
          <button class="btn-photo" type="button" id="btn-pay-trigger-photo">
            ${S.photoBtn}
          </button>
          <div id="pay-photo-preview" class="photo-preview-card" style="display:none">
            <img id="pay-photo-img" class="photo-preview-img" src="" alt="रसीद" />
            <button class="photo-remove-btn" id="btn-pay-remove-photo" title="${S.photoRemove}">✕</button>
          </div>
        </div>
      </div>

      <div class="gap-12 mt-24">
        <button class="btn btn-primary" id="btn-confirm-save-pay">${S.confirmSave}</button>
        <button class="btn btn-secondary" id="btn-confirm-cancel-pay">${S.confirmCancel}</button>
      </div>
    </div>
  `;

  // Default date
  document.getElementById('inp-pay-date').value = todayISO();

  // Photo receipt handler
  const photoInput = document.getElementById('inp-pay-photo-file');
  const triggerBtn = document.getElementById('btn-pay-trigger-photo');
  const previewBox = document.getElementById('pay-photo-preview');
  const previewImg = document.getElementById('pay-photo-img');
  const removeBtn  = document.getElementById('btn-pay-remove-photo');

  triggerBtn.addEventListener('click', () => photoInput.click());

  photoInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      showToast('फोटो लोड हो रही है…');
      state.activePhoto = await compressImageFile(file);
      previewImg.src = state.activePhoto;
      previewBox.style.display = 'flex';
      triggerBtn.textContent = S.photoAttached;
    } catch (err) {
      showToast('फोटो लोड नहीं हो सकी');
    }
  });

  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    state.activePhoto = null;
    photoInput.value = '';
    previewBox.style.display = 'none';
    triggerBtn.textContent = S.photoBtn;
  });

  document.getElementById('btn-confirm-cancel-pay').addEventListener('click', () =>
    navigate('settlement', { customerId, customerName, dues }));

  document.getElementById('btn-confirm-save-pay').addEventListener('click', async () => {
    const saveBtn = document.getElementById('btn-confirm-save-pay');
    saveBtn.disabled = true;
    saveBtn.textContent = S.loading;

    const date = document.getElementById('inp-pay-date').value || todayISO();
    const note = document.getElementById('inp-pay-note').value.trim();

    try {
      await api('/api/entries', {
        method: 'POST',
        body: {
          customerId,
          type:   'payment',
          amount,
          date,
          note,
          photo:  state.activePhoto || '',
        },
      });

      showToast(S.savedSuccess);
      navigate('customerDetail', { customerId });
    } catch (err) {
      showToast(err.message || S.error);
      saveBtn.disabled = false;
      saveBtn.textContent = S.confirmSave;
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
// SCREEN: Add Entry (Sales & Payments with Voice & Camera)
// ═══════════════════════════════════════════════════════════════════
const CATEGORIES = [
  { key: 'pant_shirt',       label: () => S.cat_pant_shirt },
  { key: 'saree',            label: () => S.cat_saree },
  { key: 'blanket_bedsheet', label: () => S.cat_blanket_bedsheet },
  { key: 'suiting_shirting', label: () => S.cat_suiting_shirting },
  { key: 'readymade',        label: () => S.cat_readymade },
  { key: 'other',            label: () => S.cat_other },
];

// categories that use meters measurement
const METER_CATS  = new Set(['pant_shirt', 'suiting_shirting', 'other']);
// categories that use piece count
const PIECE_CATS  = new Set(['saree', 'blanket_bedsheet', 'readymade']);

function renderAddEntry() {
  const { customerId, customerName, type: preType, prefill } = state.data;
  const isSale = (preType || 'sale') === 'sale';

  mainEl.innerHTML = `
    <div class="screen">
      <div class="page-title">${isSale ? S.addSaleTitle : S.addPaymentTitle}</div>
      <div class="card mb-16" style="font-size:1.1rem">👤 ${esc(customerName || '')}</div>

      <!-- Voice input toolbar -->
      <div class="voice-toolbar">
        <button class="btn-voice" id="btn-voice-entry">
          <span>🎤</span> <span id="voice-entry-label">${S.voiceBtn}</span>
        </button>
        <span id="voice-entry-status" class="voice-status-text"></span>
      </div>

      <!-- Type selector (if not preset) -->
      ${!preType ? `
      <div class="form-group">
        <label>${S.sale} / ${S.payment}</label>
        <select id="inp-type">
          <option value="sale">${S.sale}</option>
          <option value="payment">${S.payment}</option>
        </select>
      </div>` : `<input type="hidden" id="inp-type" value="${preType}" />`}

      <!-- ── Sale-only fields ─────────────────────────────────── -->
      <div id="sale-fields">

        <!-- Category grid -->
        <div class="form-group">
          <label>${S.catLabel}</label>
          <div class="category-grid" id="category-grid">
            ${CATEGORIES.map(c => `
              <button class="category-btn${(prefill?.category || 'other') === c.key ? ' selected' : ''}"
                      data-cat="${c.key}" type="button">
                ${c.label()}
              </button>`).join('')}
          </div>
          <input type="hidden" id="inp-category" value="${prefill?.category || 'other'}" />
        </div>

        <div class="form-group">
          <label>${S.labelItem}</label>
          <input id="inp-item" type="text" placeholder="${S.itemPlaceholder}"
                 value="${esc(prefill?.item || '')}" />
        </div>

        <!-- Brand -->
        <div class="form-group">
          <label>${S.labelBrand}</label>
          <input id="inp-brand" type="text" placeholder="${S.brandPlaceholder}"
                 value="${esc(prefill?.brand || '')}" />
        </div>

        <!-- Meters (shown for cloth categories) -->
        <div class="form-group" id="meters-group">
          <label>${S.labelMeters}</label>
          <input id="inp-meters" type="number" inputmode="decimal"
                 placeholder="${S.metersPlaceholder}" min="0" step="0.25"
                 value="${prefill?.meters || ''}" />
        </div>

        <!-- Rate per meter/piece -->
        <div class="form-group">
          <label>${S.labelRate}</label>
          <input id="inp-rate" type="number" inputmode="numeric"
                 placeholder="${S.ratePlaceholder}" min="0"
                 value="${prefill?.rate || ''}" />
        </div>

        <!-- Quantity (shown for piece categories) -->
        <div class="form-group" id="quantity-group">
          <label>${S.labelQuantity}</label>
          <input id="inp-quantity" type="number" inputmode="numeric"
                 placeholder="${S.quantityPlaceholder}" min="1" step="1"
                 value="${prefill?.quantity || ''}" />
        </div>

        <!-- Design Number (shown for saree/blanket/readymade) -->
        <div class="form-group" id="design-number-group">
          <label>${S.labelDesignNumber}</label>
          <input id="inp-design-number" type="text"
                 placeholder="${S.designNumberPlaceholder}"
                 value="${esc(prefill?.designNumber || '')}" />
        </div>

        <!-- Due date shortcuts -->
        <div class="form-group">
          <label>${S.labelDueDate}</label>
          <div class="due-date-row" id="due-date-row">
            <button class="due-date-chip selected" data-due="none" type="button">${S.noDueDate}</button>
            <button class="due-date-chip" data-due="7"   type="button">${S.due7days}</button>
            <button class="due-date-chip" data-due="15"  type="button">${S.due15days}</button>
            <button class="due-date-chip" data-due="30"  type="button">${S.due1month}</button>
            <button class="due-date-chip" data-due="custom" type="button">${S.dueCustom}</button>
          </div>
          <input id="inp-due-date" type="date" style="display:none;margin-top:8px;" />
          <input type="hidden" id="inp-due-date-value" value="" />
        </div>

      </div><!-- /sale-fields -->

      <div class="form-group">
        <label>${S.labelAmount}</label>
        <input id="inp-amount" type="number" inputmode="numeric"
               placeholder="${S.amountPlaceholder}" min="1"
               value="${prefill?.amount || ''}" />
      </div>

      <div class="form-group" ${state.user?.role !== 'admin' ? 'style="display:none"' : ''}>
        <label>${S.labelDate}</label>
        <input id="inp-date" type="date" />
      </div>

      <div class="form-group">
        <label>${S.labelNote}</label>
        <textarea id="inp-note" placeholder="${S.notePlaceholder}">${esc(prefill?.note || '')}</textarea>
      </div>

      <!-- Camera Receipt Attachment -->
      <div class="form-group">
        <label>${S.labelReceipt}</label>
        <input type="file" id="inp-entry-photo-file" accept="image/*" capture="environment" style="display:none" />
        <button class="btn-photo" type="button" id="btn-entry-trigger-photo">
          ${S.photoBtn}
        </button>
        <div id="entry-photo-preview" class="photo-preview-card" style="display:none">
          <img id="entry-photo-img" class="photo-preview-img" src="" alt="रसीद" />
          <button class="photo-remove-btn" id="btn-entry-remove-photo" title="${S.photoRemove}">✕</button>
        </div>
      </div>

      <div id="ae-error" style="color:#ef5350;font-size:1rem;margin-bottom:12px;display:none"></div>

      <div class="gap-12">
        <button class="btn btn-primary" id="btn-next">${S.next}</button>
        <button class="btn btn-secondary" id="btn-back">${S.back}</button>
      </div>
    </div>
  `;

  document.getElementById('inp-date').value = todayISO();

  // ── Category grid wiring ──────────────────────────────────────
  const catGrid = document.getElementById('category-grid');
  catGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cat]');
    if (!btn) return;
    catGrid.querySelectorAll('.category-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    document.getElementById('inp-category').value = btn.dataset.cat;
    updateMeasurementFields(btn.dataset.cat);
  });
  // Show correct measurement fields on load
  updateMeasurementFields(document.getElementById('inp-category').value);

  // ── Due-date chip wiring ──────────────────────────────────────
  const dueRow = document.getElementById('due-date-row');
  const dueDateInput = document.getElementById('inp-due-date');
  const dueDateValue = document.getElementById('inp-due-date-value');

  dueRow.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-due]');
    if (!chip) return;
    dueRow.querySelectorAll('.due-date-chip').forEach(c => c.classList.remove('selected'));
    chip.classList.add('selected');
    const due = chip.dataset.due;
    if (due === 'none') {
      dueDateInput.style.display = 'none';
      dueDateValue.value = '';
    } else if (due === 'custom') {
      dueDateInput.style.display = 'block';
      dueDateInput.value = '';
      dueDateValue.value = '';
    } else {
      dueDateInput.style.display = 'none';
      const d = new Date();
      d.setDate(d.getDate() + Number(due));
      dueDateValue.value = d.toISOString().slice(0, 10);
    }
  });
  dueDateInput.addEventListener('change', () => {
    dueDateValue.value = dueDateInput.value;
  });

  // ── Voice recognition parser for Add Entry ───────────────────
  setupVoiceRecognition({
    buttonEl: document.getElementById('btn-voice-entry'),
    statusEl: document.getElementById('voice-entry-status'),
    onResult: (transcript) => {
      parseVoiceIntoEntryFields(transcript);
    },
  });

  // ── Photo receipt handler ─────────────────────────────────────
  const photoInput = document.getElementById('inp-entry-photo-file');
  const triggerBtn = document.getElementById('btn-entry-trigger-photo');
  const previewBox = document.getElementById('entry-photo-preview');
  const previewImg = document.getElementById('entry-photo-img');
  const removeBtn  = document.getElementById('btn-entry-remove-photo');

  triggerBtn.addEventListener('click', () => photoInput.click());

  photoInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      showToast('फोटो लोड हो रही है…');
      state.activePhoto = await compressImageFile(file);
      previewImg.src = state.activePhoto;
      previewBox.style.display = 'flex';
      triggerBtn.textContent = S.photoAttached;
    } catch (err) {
      showToast('फोटो लोड नहीं हो सकी');
    }
  });

  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    state.activePhoto = null;
    photoInput.value = '';
    previewBox.style.display = 'none';
    triggerBtn.textContent = S.photoBtn;
  });

  // Toggle sale-only fields on type switch
  const typeEl = document.getElementById('inp-type');
  if (typeEl.tagName === 'SELECT') {
    typeEl.addEventListener('change', toggleSaleFields);
    toggleSaleFields();
  }

  document.getElementById('btn-next').addEventListener('click', prepareConfirmation);
  document.getElementById('btn-back').addEventListener('click', () =>
    navigate('customerDetail', { customerId }));
}

/** Show meters or quantity & design number depending on selected category */
function updateMeasurementFields(cat) {
  const metersGrp   = document.getElementById('meters-group');
  const quantityGrp = document.getElementById('quantity-group');
  const designGrp   = document.getElementById('design-number-group');
  if (!metersGrp || !quantityGrp) return;

  if (METER_CATS.has(cat)) {
    metersGrp.style.display   = '';
    quantityGrp.style.display = 'none';
    if (designGrp) designGrp.style.display = 'none';
  } else if (PIECE_CATS.has(cat)) {
    metersGrp.style.display   = 'none';
    quantityGrp.style.display = '';
    if (designGrp) designGrp.style.display = '';
  } else {
    // 'other' or unknown — show neither (item + note suffice)
    metersGrp.style.display   = 'none';
    quantityGrp.style.display = 'none';
    if (designGrp) designGrp.style.display = 'none';
  }
}

function toggleSaleFields() {
  const type = document.getElementById('inp-type').value;
  document.getElementById('sale-fields').style.display = type === 'sale' ? '' : 'none';
}

/** Fill entry form fields from a voice transcript string using NLP textile parser */
function parseVoiceIntoEntryFields(transcript) {
  showToast(`${S.voiceSuccess}: "${transcript}"`);
  const parsed = parseSpokenTextileSentence(transcript);

  if (parsed.amount) {
    const el = document.getElementById('inp-amount');
    if (el) el.value = parsed.amount;
  }
  if (parsed.meters) {
    const el = document.getElementById('inp-meters');
    if (el) el.value = parsed.meters;
  }
  if (parsed.quantity) {
    const el = document.getElementById('inp-quantity');
    if (el) el.value = parsed.quantity;
  }
  if (parsed.brand) {
    const el = document.getElementById('inp-brand');
    if (el) el.value = parsed.brand;
  }
  if (parsed.designNumber) {
    const el = document.getElementById('inp-design-number');
    if (el) el.value = parsed.designNumber;
  }
  if (parsed.rate) {
    const el = document.getElementById('inp-rate');
    if (el) el.value = parsed.rate;
  }
  if (parsed.item) {
    const el = document.getElementById('inp-item');
    if (el) el.value = parsed.item;
  }
  if (parsed.category) {
    const el = document.getElementById('inp-category');
    if (el) el.value = parsed.category;
    document.querySelectorAll('.category-btn').forEach(b => {
      b.classList.toggle('selected', b.dataset.cat === parsed.category);
    });
    updateMeasurementFields(parsed.category);
  }
}

function prepareConfirmation() {
  const errEl        = document.getElementById('ae-error');
  const type         = document.getElementById('inp-type').value;
  const amount       = document.getElementById('inp-amount').value.trim();
  const item         = document.getElementById('inp-item')?.value.trim()         || '';
  const meters       = document.getElementById('inp-meters')?.value.trim()       || '';
  const date         = document.getElementById('inp-date')?.value                || todayISO();
  const note         = document.getElementById('inp-note')?.value.trim()         || '';
  const category     = document.getElementById('inp-category')?.value            || 'other';
  const brand        = document.getElementById('inp-brand')?.value.trim()        || '';
  const designNumber = document.getElementById('inp-design-number')?.value.trim() || '';
  const rate         = document.getElementById('inp-rate')?.value.trim()         || '';
  const quantity     = document.getElementById('inp-quantity')?.value.trim()     || '';
  const dueDate      = document.getElementById('inp-due-date-value')?.value      || '';

  errEl.style.display = 'none';

  if (!amount || isNaN(amount) || Number(amount) < 1) {
    errEl.textContent   = 'राशि सही नहीं है (कम से कम ₹1)';
    errEl.style.display = 'block';
    return;
  }

  navigate('confirmEntry', {
    ...state.data,
    type,
    amount:       Math.round(Number(amount)),
    item,
    meters:       meters       ? Number(meters)   : null,
    date,
    note,
    photo:        state.activePhoto || '',
    category,
    brand,
    designNumber,
    rate:         rate         ? Number(rate)     : null,
    quantity:     quantity     ? Math.round(Number(quantity)) : null,
    dueDate:      dueDate      || null,
  });
}

// ═══════════════════════════════════════════════════════════════════
// SCREEN: Confirm Entry (Sales Confirmation)
// ═══════════════════════════════════════════════════════════════════
function renderConfirmEntry() {
  const d = state.data;
  const isSale = d.type === 'sale';
  const catKey  = d.category || 'other';
  const catLabelMap = {
    pant_shirt: S.cat_pant_shirt, saree: S.cat_saree,
    blanket_bedsheet: S.cat_blanket_bedsheet,
    suiting_shirting: S.cat_suiting_shirting,
    readymade: S.cat_readymade, other: S.cat_other,
  };

  mainEl.innerHTML = `
    <div class="screen">
      <div class="page-title">${S.confirmTitle}</div>

      <div class="confirm-box">
        <div class="confirm-amount">${S.rupee}${Number(d.amount).toLocaleString('hi-IN')}</div>

        <div class="confirm-row">
          <span class="confirm-key">${S.customer_label}</span>
          <span class="confirm-value">${esc(d.customerName || '')}</span>
        </div>
        <div class="confirm-row">
          <span class="confirm-key">प्रकार</span>
          <span class="confirm-value">${isSale ? S.sale : S.payment}</span>
        </div>
        ${isSale ? `
        <div class="confirm-row">
          <span class="confirm-key">${S.catLabel}</span>
          <span class="confirm-value">${esc(catLabelMap[catKey] || catKey)}</span>
        </div>` : ''}
        ${d.item ? `
        <div class="confirm-row">
          <span class="confirm-key">${S.labelItem}</span>
          <span class="confirm-value">${esc(d.item)}</span>
        </div>` : ''}
        ${d.brand ? `
        <div class="confirm-row">
          <span class="confirm-key">${S.labelBrand}</span>
          <span class="confirm-value">${esc(d.brand)}</span>
        </div>` : ''}
        ${d.designNumber ? `
        <div class="confirm-row">
          <span class="confirm-key">${S.labelDesignNumber}</span>
          <span class="confirm-value">#${esc(d.designNumber)}</span>
        </div>` : ''}
        ${d.meters ? `
        <div class="confirm-row">
          <span class="confirm-key">${S.labelMeters}</span>
          <span class="confirm-value">${d.meters} ${S.meters_unit}</span>
        </div>` : ''}
        ${d.quantity ? `
        <div class="confirm-row">
          <span class="confirm-key">${S.labelQuantity}</span>
          <span class="confirm-value">${d.quantity} पीस</span>
        </div>` : ''}
        ${d.rate ? `
        <div class="confirm-row">
          <span class="confirm-key">${S.labelRate}</span>
          <span class="confirm-value">${S.rupee}${d.rate}</span>
        </div>` : ''}
        <div class="confirm-row">
          <span class="confirm-key">${S.date_label}</span>
          <span class="confirm-value">${formatDate(d.date)}</span>
        </div>
        ${d.dueDate ? `
        <div class="confirm-row">
          <span class="confirm-key">${S.labelDueDate}</span>
          <span class="confirm-value">${formatDate(d.dueDate)}</span>
        </div>` : ''}
        <div class="confirm-row">
          <span class="confirm-key">${S.shop_label}</span>
          <span class="confirm-value">${state.user?.shop === 'shop1' ? S.shop1 : S.shop2}</span>
        </div>
        ${d.note ? `
        <div class="confirm-row">
          <span class="confirm-key">${S.note_label}</span>
          <span class="confirm-value">${esc(d.note)}</span>
        </div>` : ''}

        ${d.photo ? `
          <div style="margin-top:12px;text-align:center">
            <img src="${esc(d.photo)}" style="max-height:160px;border-radius:6px;border:1px solid #fff;" alt="रसीद" />
          </div>
        ` : ''}
      </div>

      <p class="text-center mb-16" style="font-size:1.1rem;color:#b0bec5">
        ${isSale ? S.confirmSaleMsg : S.confirmPaymentMsg}
      </p>

      <div class="gap-12">
        <button class="btn btn-primary" id="btn-confirm-save">${S.confirmSave}</button>
        <button class="btn btn-secondary" id="btn-confirm-back">${S.confirmCancel}</button>
      </div>
    </div>
  `;

  document.getElementById('btn-confirm-save').addEventListener('click', doSaveEntry);
  document.getElementById('btn-confirm-back').addEventListener('click', () =>
    navigate('addEntry', state.data));
}

async function doSaveEntry() {
  const btn = document.getElementById('btn-confirm-save');
  btn.disabled    = true;
  btn.textContent = S.loading;

  const d = state.data;

  try {
    await api('/api/entries', {
      method: 'POST',
      body: {
        customerId:   d.customerId,
        type:         d.type,
        amount:       d.amount,
        item:         d.item         || '',
        meters:       d.meters       || null,
        date:         d.date         || todayISO(),
        note:         d.note         || '',
        photo:        d.photo        || '',
        category:     d.category     || 'other',
        brand:        d.brand        || '',
        designNumber: d.designNumber || '',
        rate:         d.rate         || null,
        quantity:     d.quantity     || null,
        dueDate:      d.dueDate      || null,
      },
    });

    showToast(S.savedSuccess);
    // Play success chime if audio is available
    playSuccessChime();
    navigate('customerDetail', { customerId: d.customerId });
  } catch (err) {
    showToast(err.message || S.error);
    btn.disabled    = false;
    btn.textContent = S.confirmSave;
  }
}

/** Short audible success chime via Web Audio API */
function playSuccessChime() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1046, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch (_) { /* audio not available */ }
}

// ═══════════════════════════════════════════════════════════════════
// SCREEN: Today's Entries (Sales & Payments Combined)
// ═══════════════════════════════════════════════════════════════════
function renderToday() {
  mainEl.innerHTML = `<div class="spinner"></div>`;

  api('/api/entries/today')
    .then((entries) => {
      if (!entries.length) {
        mainEl.innerHTML = `
          <div class="screen">
            <div class="page-title">${S.todayTitle}</div>
            <p class="empty-state">${S.noTodayEntries}</p>
            <button class="btn btn-secondary mt-24" id="btn-back">${S.back}</button>
          </div>`;
        document.getElementById('btn-back').addEventListener('click', () => navigate('home'));
        return;
      }

      let totalSales = 0, totalPayments = 0;
      entries.forEach((e) => {
        if (e.type === 'sale')    totalSales    += e.amount;
        if (e.type === 'payment') totalPayments += e.amount;
      });

      mainEl.innerHTML = `
        <div class="screen">
          <button class="btn btn-secondary btn-sm mb-16" id="btn-back">${S.back}</button>
          <div class="page-title">${S.todayTitle}</div>

          <div class="balance-box" style="margin-bottom:20px">
            <div class="balance-sub">
              ${S.totalSales} <strong>${S.rupee}${totalSales.toLocaleString('hi-IN')}</strong>
              &nbsp;|&nbsp;
              ${S.totalPayments} <strong>${S.rupee}${totalPayments.toLocaleString('hi-IN')}</strong>
            </div>
          </div>

          ${entries.map((e) => `
            <div class="entry-item ${e.type}">
              <div style="display:flex;justify-content:space-between">
                <div>
                  <span class="badge badge-${e.type}">${e.type === 'sale' ? S.sale : S.payment}</span>
                  <span class="badge badge-${e.shop}">${e.shop === 'shop1' ? S.shop1 : S.shop2}</span>
                </div>
                <div class="entry-amount">${S.rupee}${Number(e.amount).toLocaleString('hi-IN')}</div>
              </div>
              <div class="entry-meta">
                <strong>${esc(e.customer?.name || '')}</strong>
                ${e.customer?.village ? ` · 📍${esc(e.customer.village)}` : ''}
                ${e.brand        ? ` · 🏷️ <strong>${esc(e.brand)}</strong>` : ''}
                ${e.designNumber ? ` · 🎨 <strong>#${esc(e.designNumber)}</strong>` : ''}
                ${e.item         ? ` · ${esc(e.item)}` : ''}
                ${e.meters       ? ` · ${e.meters} ${S.meters_unit}` : ''}
                ${e.quantity     ? ` · ${e.quantity} पीस` : ''}
                ${e.note         ? `<br><span style="color:#90a4ae">📝 ${esc(e.note)}</span>` : ''}
              </div>
              ${e.photo ? `
                <div class="receipt-thumbnail-badge" data-photo="${esc(e.photo)}">
                  📷 ${S.viewPhoto}
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      `;

      document.getElementById('btn-back').addEventListener('click', () => navigate('home'));
      attachPhotoClickEvents();
    })
    .catch((err) => {
      mainEl.innerHTML = `<p class="empty-state">${err.message}</p>`;
    });
}

// ═══════════════════════════════════════════════════════════════════
// SCREEN: Today's Payments Collected Grouped by Shop ("आज का पैसा")
// ═══════════════════════════════════════════════════════════════════
function renderTodayPayments() {
  mainEl.innerHTML = `<div class="spinner"></div>`;

  api('/api/entries/today-payments')
    .then((data) => {
      const { grandTotal, shop1Total, shop2Total, shop1Entries, shop2Entries, allPayments } = data;

      mainEl.innerHTML = `
        <div class="screen">
          <button class="btn btn-secondary btn-sm mb-16" id="btn-back">${S.back}</button>
          <div class="page-title">${S.todayPaymentsTitle}</div>

          <!-- Grand Collections Box -->
          <div class="balance-box" style="border-color:#66bb6a;margin-bottom:20px;">
            <div class="balance-label">${S.grandCollections}</div>
            <div class="balance-amount zero" style="font-size:3rem">
              ${S.rupee}${grandTotal.toLocaleString('hi-IN')}
            </div>
          </div>

          <!-- Shop 1 & Shop 2 Breakdown Cards -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
            <div class="card" style="border-top:4px solid #1565c0;text-align:center">
              <div style="font-size:0.95rem;color:var(--text-muted)">${S.shop1Collections}</div>
              <div style="font-size:1.6rem;font-weight:900;color:#90caf9;margin-top:4px">
                ${S.rupee}${shop1Total.toLocaleString('hi-IN')}
              </div>
              <div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px">
                ${shop1Entries.length} भुगतान
              </div>
            </div>

            <div class="card" style="border-top:4px solid #6a1b9a;text-align:center">
              <div style="font-size:0.95rem;color:var(--text-muted)">${S.shop2Collections}</div>
              <div style="font-size:1.6rem;font-weight:900;color:#ce93d8;margin-top:4px">
                ${S.rupee}${shop2Total.toLocaleString('hi-IN')}
              </div>
              <div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px">
                ${shop2Entries.length} भुगतान
              </div>
            </div>
          </div>

          <!-- Payments Timeline -->
          <div class="page-title" style="font-size:1.2rem;margin-bottom:12px">सभी प्राप्त भुगतान</div>

          ${allPayments.length === 0
            ? `<p class="empty-state">${S.noTodayPayments}</p>`
            : allPayments.map((p) => `
              <div class="entry-item payment">
                <div style="display:flex;justify-content:space-between">
                  <div>
                    <span class="badge badge-payment">${S.payment}</span>
                    <span class="badge badge-${p.shop}">${p.shop === 'shop1' ? S.shop1 : S.shop2}</span>
                  </div>
                  <div class="entry-amount" style="color:#66bb6a">${S.rupee}${Number(p.amount).toLocaleString('hi-IN')}</div>
                </div>
                <div class="entry-meta">
                  <strong>${esc(p.customer?.name || '')}</strong>
                  ${p.customer?.village ? ` · 📍 ${esc(p.customer.village)}` : ''}
                  ${p.note ? `<br><span style="color:#b0bec5">📝 ${esc(p.note)}</span>` : ''}
                </div>
                ${p.photo ? `
                  <div class="receipt-thumbnail-badge" data-photo="${esc(p.photo)}">
                    📷 ${S.viewPhoto}
                  </div>
                ` : ''}
              </div>
            `).join('')
          }
        </div>
      `;

      document.getElementById('btn-back').addEventListener('click', () => navigate('home'));
      attachPhotoClickEvents();
    })
    .catch((err) => {
      mainEl.innerHTML = `<p class="empty-state">${err.message}</p>`;
    });
}

// ═══════════════════════════════════════════════════════════════════
// SCREEN: Admin Mode (Pro View: Audit Log, Cross-Shop KPI, Data Export)
// ═══════════════════════════════════════════════════════════════════
async function renderAdmin() {
  if (state.user?.role !== 'admin') {
    showToast(state.adminLang === 'en' ? 'Admin access only' : 'केवल एडमिन को अनुमति है');
    return navigate('home');
  }

  mainEl.innerHTML = `<div class="spinner"></div>`;

  try {
    const overview = await api('/api/admin/overview');
    const ocrPendingCount = overview.pendingOcrCount || 0;

    mainEl.innerHTML = `
      <div class="screen">
        <!-- Top Toolbar with Back, Theme, and Language Switcher -->
        <div class="admin-toolbar-row">
          <button class="btn btn-secondary btn-sm" id="btn-admin-back">${A('back')}</button>
          <div style="display:flex;gap:8px;align-items:center;">
            <button class="admin-ctrl-btn" id="btn-admin-theme" title="Toggle Theme">
              ${state.theme === 'light' ? A('themeDark') : A('themeLight')}
            </button>
            <button class="admin-ctrl-btn" id="btn-admin-lang" title="Toggle Language">
              ${A('langSwitch')}
            </button>
          </div>
        </div>

        <div class="page-title">${A('adminOverviewTitle')}</div>

        <!-- Admin Tab Switcher -->
        <div class="filter-pills" style="margin-bottom:20px;display:flex;flex-wrap:wrap;gap:8px;">
          <button class="pill-btn ${state.adminTab === 'overview' ? 'active' : ''}" id="tab-overview">
            ${A('adminTabOverview')}
          </button>
          <button class="pill-btn ${state.adminTab === 'ocr' ? 'active' : ''}" id="tab-ocr">
            ${A('adminTabOcr')}${ocrPendingCount > 0 ? `<span class="admin-ocr-count-badge">${ocrPendingCount}</span>` : ''}
          </button>
          <button class="pill-btn ${state.adminTab === 'audit' ? 'active' : ''}" id="tab-audit">
            ${A('adminTabAudit')}
          </button>
          <button class="pill-btn ${state.adminTab === 'export' ? 'active' : ''}" id="tab-export">
            ${A('adminTabExport')}
          </button>
        </div>

        <div id="admin-tab-content"></div>
      </div>
    `;

    document.getElementById('btn-admin-back').addEventListener('click', () => navigate('home'));

    document.getElementById('btn-admin-lang').addEventListener('click', () => {
      state.adminLang = state.adminLang === 'en' ? 'hi' : 'en';
      localStorage.setItem('khata_admin_lang', state.adminLang);
      renderAdmin();
    });

    document.getElementById('btn-admin-theme').addEventListener('click', () => {
      state.theme = state.theme === 'light' ? 'dark' : 'light';
      localStorage.setItem('khata_theme', state.theme);
      if (state.theme === 'light') {
        document.body.classList.add('light-theme');
      } else {
        document.body.classList.remove('light-theme');
      }
      renderAdmin();
    });

    const tabOverview = document.getElementById('tab-overview');
    const tabOcr      = document.getElementById('tab-ocr');
    const tabAudit    = document.getElementById('tab-audit');
    const tabExport   = document.getElementById('tab-export');

    tabOverview.addEventListener('click', () => {
      state.adminTab = 'overview';
      renderAdmin();
    });
    tabOcr.addEventListener('click', () => {
      state.adminTab = 'ocr';
      renderAdmin();
    });
    tabAudit.addEventListener('click', () => {
      state.adminTab = 'audit';
      renderAdmin();
    });
    tabExport.addEventListener('click', () => {
      state.adminTab = 'export';
      renderAdmin();
    });

    const contentEl = document.getElementById('admin-tab-content');

    if (state.adminTab === 'overview') {
      renderAdminOverviewTab(contentEl, overview);
    } else if (state.adminTab === 'ocr') {
      await renderAdminOcrQueueTab(contentEl);
    } else if (state.adminTab === 'audit') {
      await renderAdminAuditTab(contentEl);
    } else if (state.adminTab === 'export') {
      renderAdminExportTab(contentEl);
    }

  } catch (err) {
    mainEl.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
}

function renderAdminOverviewTab(container, r) {
  container.innerHTML = `
    <!-- Grand Total Balance -->
    <div class="admin-header-card">
      <div style="font-size:1rem;color:#ce93d8;text-transform:uppercase">${A('adminTotalDues')}</div>
      <div style="font-size:2.8rem;font-weight:900;color:#fff;margin-top:6px">
        ₹${r.grand.balance.toLocaleString('hi-IN')}
      </div>
      <div style="font-size:0.95rem;color:#e1bee7;margin-top:6px">
        ${A('grandSales')}: ₹${r.grand.sales.toLocaleString('hi-IN')} &nbsp;|&nbsp; ${A('grandPayments')}: ₹${r.grand.payments.toLocaleString('hi-IN')}
      </div>
    </div>

    <!-- Cross-Shop Comparison Grid -->
    <div class="admin-stats-grid">
      <div class="admin-stat-card" style="border-top:4px solid #1565c0">
        <div class="admin-stat-title">${A('shop1Net')}</div>
        <div class="admin-stat-num" style="color:#90caf9">₹${r.shop1.balance.toLocaleString('hi-IN')}</div>
        <div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px">
          ${A('grandSales')}: ₹${r.shop1.sales.toLocaleString('hi-IN')}<br>
          ${A('grandPayments')}: ₹${r.shop1.payments.toLocaleString('hi-IN')}
        </div>
      </div>

      <div class="admin-stat-card" style="border-top:4px solid #6a1b9a">
        <div class="admin-stat-title">${A('shop2Net')}</div>
        <div class="admin-stat-num" style="color:#ce93d8">₹${r.shop2.balance.toLocaleString('hi-IN')}</div>
        <div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px">
          ${A('grandSales')}: ₹${r.shop2.sales.toLocaleString('hi-IN')}<br>
          ${A('grandPayments')}: ₹${r.shop2.payments.toLocaleString('hi-IN')}
        </div>
      </div>

      <div class="admin-stat-card" id="card-ocr-queue" style="border-top:4px solid #ff9800;cursor:pointer">
        <div class="admin-stat-title">🤖 ${A('adminTabOcr')}</div>
        <div class="admin-stat-num" style="color:#ffb74d">${r.pendingOcrCount || 0}</div>
        <div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px">
          ${state.adminLang === 'en' ? 'Photos awaiting verification' : 'सत्यापन हेतु लंबित फोटो'}
        </div>
      </div>

      <div class="admin-stat-card">
        <div class="admin-stat-title">${A('totalCustomers')}</div>
        <div class="admin-stat-num">${r.totalCustomers}</div>
      </div>

      <div class="admin-stat-card">
        <div class="admin-stat-title">${A('deletedEntries')}</div>
        <div class="admin-stat-num" style="color:#ef5350">${r.deletedEntriesCount}</div>
      </div>
    </div>
  `;

  const ocrCard = container.querySelector('#card-ocr-queue');
  if (ocrCard) {
    ocrCard.addEventListener('click', () => {
      state.adminTab = 'ocr';
      renderAdmin();
    });
  }
}

async function renderAdminAuditTab(container) {
  container.innerHTML = `<div class="spinner"></div>`;

  try {
    const allEntries = await api('/api/admin/audit-log');

    container.innerHTML = `
      <div class="page-title" style="font-size:1.2rem;margin-bottom:14px">${A('auditTitle')}</div>

      <!-- Search & Filters Bar -->
      <div class="admin-search-bar">
        <input type="text" class="admin-search-input" id="audit-search" placeholder="${A('searchPlaceholder')}" />
        <select class="admin-filter-select" id="audit-filter-type">
          <option value="all">${A('filterAll')}</option>
          <option value="sale">${A('filterSales')}</option>
          <option value="payment">${A('filterPayments')}</option>
          <option value="deleted">${A('filterDeleted')}</option>
        </select>
        <select class="admin-filter-select" id="audit-filter-shop">
          <option value="all">${A('filterAllShops')}</option>
          <option value="shop1">${A('shop1')}</option>
          <option value="shop2">${A('shop2')}</option>
        </select>
      </div>

      <!-- Structured Data Table Container -->
      <div class="admin-table-container">
        <table class="admin-table">
          <thead>
            <tr>
              <th>${A('colDate')}</th>
              <th>${A('colShop')}</th>
              <th>${A('colType')}</th>
              <th>${A('colCustomer')}</th>
              <th>${A('colDetails')}</th>
              <th style="text-align:right">${A('colAmount')}</th>
              <th>${A('colUser')}</th>
              <th style="text-align:center">${A('colActions')}</th>
            </tr>
          </thead>
          <tbody id="audit-table-body"></tbody>
        </table>
      </div>
    `;

    const searchInput = container.querySelector('#audit-search');
    const filterType  = container.querySelector('#audit-filter-type');
    const filterShop  = container.querySelector('#audit-filter-shop');
    const tableBody   = container.querySelector('#audit-table-body');

    const renderRows = () => {
      const q = searchInput.value.trim().toLowerCase();
      const fType = filterType.value;
      const fShop = filterShop.value;

      const filtered = allEntries.filter(e => {
        // Shop filter
        if (fShop !== 'all' && e.shop !== fShop) return false;

        // Type filter
        if (fType === 'deleted' && !e.deleted) return false;
        if (fType === 'sale' && (e.type !== 'sale' || e.deleted)) return false;
        if (fType === 'payment' && (e.type !== 'payment' || e.deleted)) return false;

        // Search query
        if (q) {
          const custName = (e.customer?.name || '').toLowerCase();
          const custVillage = (e.customer?.village || '').toLowerCase();
          const custRel = (e.customer?.relationTag || '').toLowerCase();
          const itemText = (e.item || '').toLowerCase();
          const brandText = (e.brand || '').toLowerCase();
          const noteText = (e.note || '').toLowerCase();
          const amtText = String(e.amount);

          if (!custName.includes(q) &&
              !custVillage.includes(q) &&
              !custRel.includes(q) &&
              !itemText.includes(q) &&
              !brandText.includes(q) &&
              !noteText.includes(q) &&
              !amtText.includes(q)) {
            return false;
          }
        }
        return true;
      });

      if (filtered.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted);font-size:1.05rem">
              ${A('noAuditRecords')}
            </td>
          </tr>
        `;
        return;
      }

      tableBody.innerHTML = filtered.map(e => {
        const detailsParts = [];
        if (e.item) detailsParts.push(esc(e.item));
        else if (e.category) detailsParts.push(esc(e.category));
        if (e.brand) detailsParts.push(`<span style="color:#90caf9">🏷️ ${esc(e.brand)}</span>`);
        if (e.quantity) detailsParts.push(`${e.quantity} ${e.unitType || 'piece'}`);
        if (e.meters) detailsParts.push(`${e.meters} m`);
        if (e.rate) detailsParts.push(`@₹${e.rate}`);
        if (e.note) detailsParts.push(`<span style="color:var(--text-muted);font-style:italic">"${esc(e.note)}"</span>`);

        const detailsHtml = detailsParts.length > 0 ? detailsParts.join(' · ') : '—';
        const isDeleted = e.deleted;

        return `
          <tr class="${isDeleted ? 'row-deleted' : ''}">
            <td style="font-size:0.85rem;white-space:nowrap">
              ${formatDate(e.createdAt)}
              ${isDeleted ? `<br><small style="color:#ef5350">${formatDate(e.deletedAt)}</small>` : ''}
            </td>
            <td>
              <span class="badge badge-${e.shop}">${e.shop === 'shop1' ? A('shop1') : A('shop2')}</span>
            </td>
            <td>
              <span class="badge badge-${e.type}">${e.type === 'sale' ? A('sale') : A('payment')}</span>
              ${isDeleted ? `<span class="badge" style="background:#b71c1c;color:#fff;margin-left:4px">${A('statusDeleted')}</span>` : ''}
            </td>
            <td>
              <strong>${esc(e.customer?.name || '—')}</strong>
              ${e.customer?.relationTag ? `<span style="font-size:0.85rem;color:var(--text-muted)"> (${esc(e.customer.relationTag)})</span>` : ''}
              ${e.customer?.village ? `<br><small style="color:var(--text-muted)">📍 ${esc(e.customer.village)}</small>` : ''}
            </td>
            <td style="font-size:0.9rem">${detailsHtml}</td>
            <td style="text-align:right;font-weight:900;font-size:1.1rem;${e.type === 'sale' ? 'color:#ffb74d;' : 'color:#81c784;'}">
              ₹${Number(e.amount).toLocaleString('hi-IN')}
            </td>
            <td style="font-size:0.85rem;color:var(--text-muted)">
              ${esc(e.createdBy?.displayName || e.createdBy?.username || '—')}
            </td>
            <td style="text-align:center;white-space:nowrap">
              ${isDeleted ? `
                <button class="btn btn-secondary btn-sm btn-restore" data-id="${e._id}" style="padding:4px 10px;font-size:0.8rem">
                  ${A('restoreBtn')}
                </button>
              ` : ''}
              ${e.photo ? `
                <button class="btn btn-secondary btn-sm receipt-thumbnail-badge" data-photo="${esc(e.photo)}" style="padding:4px 8px;font-size:0.8rem;margin-left:4px">
                  📷 ${A('viewReceipt')}
                </button>
              ` : ''}
            </td>
          </tr>
        `;
      }).join('');

      // Wire restore buttons
      tableBody.querySelectorAll('.btn-restore').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          if (!confirm(A('restoreConfirm'))) return;
          try {
            btn.disabled = true;
            await api(`/api/admin/restore-entry/${id}`, { method: 'POST' });
            showToast(A('restoreSuccess'));
            await renderAdminAuditTab(container);
          } catch (err) {
            showToast(err.message || S.error);
            btn.disabled = false;
          }
        });
      });

      attachPhotoClickEvents();
    };

    searchInput.addEventListener('input', renderRows);
    filterType.addEventListener('change', renderRows);
    filterShop.addEventListener('change', renderRows);

    renderRows();

  } catch (err) {
    container.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
}

function renderAdminExportTab(container) {
  container.innerHTML = `
    <div class="card mb-16" style="padding:24px">
      <div style="font-size:1.3rem;font-weight:900;margin-bottom:8px">📥 ${A('exportTitle')}</div>
      <p style="color:var(--text-muted);margin-bottom:20px;font-size:0.95rem">
        ${A('exportDesc')}
      </p>

      <div class="gap-12">
        <a href="/api/admin/export?format=csv" class="btn btn-primary" download style="text-decoration:none;display:flex;align-items:center;justify-content:center;">
          ${A('btnExportCsv')}
        </a>
        <a href="/api/admin/export?format=json" class="btn btn-secondary" download style="text-decoration:none;display:flex;align-items:center;justify-content:center;">
          ${A('btnExportJson')}
        </a>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════════
// Web Speech API Integration (Hindi Speech-to-Text)
// ═══════════════════════════════════════════════════════════════════
function setupVoiceRecognition({ buttonEl, statusEl, onResult }) {
  if (!buttonEl) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    buttonEl.style.opacity = '0.5';
    buttonEl.title = S.voiceNotSupported;
    buttonEl.addEventListener('click', () => showToast(S.voiceNotSupported));
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'hi-IN'; // Hindi (India)
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  let isListening = false;

  buttonEl.addEventListener('click', () => {
    if (isListening) {
      recognition.stop();
      return;
    }
    try {
      recognition.start();
    } catch (_) { /* already started */ }
  });

  recognition.onstart = () => {
    isListening = true;
    buttonEl.classList.add('listening');
    if (statusEl) statusEl.textContent = S.voiceListening;
  };

  recognition.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript || '';
    if (transcript.trim()) {
      onResult(transcript.trim());
    }
  };

  recognition.onerror = (event) => {
    console.warn('Speech error:', event.error);
    if (statusEl) statusEl.textContent = '';
    showToast(S.voiceError);
  };

  recognition.onend = () => {
    isListening = false;
    buttonEl.classList.remove('listening');
    if (statusEl) statusEl.textContent = '';
  };
}

// ═══════════════════════════════════════════════════════════════════
// Camera & Image Compression via Canvas
// ═══════════════════════════════════════════════════════════════════
function compressImageFile(file, maxWidth = 800, maxHeight = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Output as lightweight JPEG data URL
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ═══════════════════════════════════════════════════════════════════
// API Helper
// ═══════════════════════════════════════════════════════════════════
async function api(path, { method = 'GET', body, noAuth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (!noAuth && state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && !noAuth) {
    logout();
    throw new Error(S.loginError);
  }

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || S.error);
  }
  return json;
}

// ═══════════════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════════════

/** Escape HTML to prevent XSS */
function esc(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Format ISO date to DD/MM/YYYY in IST */
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('hi-IN', {
    day:      '2-digit',
    month:    '2-digit',
    year:     'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

/** Today's date as YYYY-MM-DD for date inputs */
function todayISO() {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const y   = ist.getFullYear();
  const m   = String(ist.getMonth() + 1).padStart(2, '0');
  const d   = String(ist.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Show temporary toast notification */
function showToast(msg, duration = 3000) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

// ═══════════════════════════════════════════════════════════════════
// GLOBAL FLOATING VOICE ASSISTANT (Permanent FAB & Hands-Free Loop)
// ═══════════════════════════════════════════════════════════════════

/** Convert Devanagari numerals ०-९ to standard 0-9 */
function normalizeDevanagariNumbers(str = '') {
  const deva = ['०','१','२','३','४','५','६','७','८','९'];
  return String(str).replace(/[०-९]/g, (ch) => deva.indexOf(ch));
}

/** Subtle audio chime when mic FAB is tapped to start listening */
function playMicBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(520, ctx.currentTime);
    osc.frequency.setValueAtTime(680, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.22);
  } catch (_) { /* audio context unavailable */ }
}

/**
 * Sets up the permanent floating mic FAB button.
 * When tapped → plays beep → opens full-screen overlay → listens → parses intent
 */
function setupGlobalVoiceAssistant() {
  if (!fabMicEl) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    fabMicEl.style.opacity = '0.4';
    fabMicEl.title = S.fabNotSupported;
    fabMicEl.addEventListener('click', () => showToast(S.fabNotSupported));
    return;
  }

  // Create SpeechRecognition instance with continuous listening for elderly speech pauses
  globalRecognition = new SpeechRecognition();
  globalRecognition.lang             = 'hi-IN';
  globalRecognition.interimResults   = true;  // show partial transcript live
  globalRecognition.maxAlternatives  = 1;
  globalRecognition.continuous       = true;  // continuous listening to prevent premature cut-off

  let silenceTimer = null;
  let accumulatedFinalText = '';
  let lastInterimText = '';

  const resetSilenceTimer = () => {
    if (silenceTimer) clearTimeout(silenceTimer);
    // 3.2-second timeout: gives elderly shopkeepers enough time to pause and think without cut-off
    silenceTimer = setTimeout(() => {
      finishSpeechSession();
    }, 3200);
  };

  const finishSpeechSession = () => {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
    const fullText = (accumulatedFinalText + ' ' + lastInterimText).trim();
    try { globalRecognition.stop(); } catch (_) {}
    globalRecognitionActive = false;
    if (fabMicEl) fabMicEl.classList.remove('listening');

    if (fullText) {
      const voTranscript = document.getElementById('vo-transcript');
      if (voTranscript) voTranscript.textContent = `"${fullText}"`;
      handleGlobalIntent(fullText);
    } else {
      const voHint = document.getElementById('vo-hint');
      if (voHint) voHint.textContent = S.fabError;
      setTimeout(closeVoiceOverlay, 1800);
    }
  };

  fabMicEl.addEventListener('click', () => {
    if (globalRecognitionActive) {
      // Tap while listening finalizes immediately
      finishSpeechSession();
    } else {
      accumulatedFinalText = '';
      lastInterimText = '';
      playMicBeep();
      openVoiceOverlay();
    }
  });

  globalRecognition.onstart = () => {
    globalRecognitionActive = true;
    accumulatedFinalText = '';
    lastInterimText = '';
    fabMicEl.classList.add('listening');
    const voTitle = document.getElementById('vo-title');
    if (voTitle) voTitle.textContent = S.fabListening;
    const voHint = document.getElementById('vo-hint');
    if (voHint) voHint.textContent = S.micListeningExtended;
    resetSilenceTimer();
  };

  globalRecognition.onresult = (event) => {
    let interim = '';
    let finals = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      if (res.isFinal) {
        finals += res[0].transcript + ' ';
      } else {
        interim += res[0].transcript;
      }
    }

    if (finals) accumulatedFinalText += finals;
    lastInterimText = interim;

    const currentDisplay = (accumulatedFinalText + ' ' + interim).trim();
    const voTranscript = document.getElementById('vo-transcript');
    if (voTranscript) voTranscript.textContent = `"${currentDisplay}"`;

    const voHint = document.getElementById('vo-hint');
    if (voHint) voHint.textContent = S.micListeningExtended;

    // Reset silence timer on every spoken word/chunk
    resetSilenceTimer();
  };

  globalRecognition.onerror = (event) => {
    console.warn('Global speech error:', event.error);
    if (event.error === 'no-speech') {
      // Ignore initial no-speech in continuous mode, let silence timer govern timeout
      return;
    }
    if (silenceTimer) clearTimeout(silenceTimer);
    const voTitle = document.getElementById('vo-title');
    if (voTitle) voTitle.textContent = S.fabError;
    setTimeout(closeVoiceOverlay, 1800);
  };

  globalRecognition.onend = () => {
    globalRecognitionActive = false;
    if (fabMicEl) fabMicEl.classList.remove('listening');
  };
}

function openVoiceOverlay() {
  if (!voiceOverlayEl) return;
  // Clear previous state
  const voTitle      = document.getElementById('vo-title');
  const voTranscript = document.getElementById('vo-transcript');
  const voHint       = document.getElementById('vo-hint');
  const voConfirm    = document.getElementById('vo-confirm-area');
  if (voTitle)      voTitle.textContent      = S.fabVoiceTitle;
  if (voTranscript) voTranscript.textContent = '';
  if (voHint)       voHint.textContent       = S.fabVoiceHint;
  if (voConfirm)    voConfirm.innerHTML      = '';

  voiceOverlayEl.classList.remove('hidden');
  try { globalRecognition.start(); } catch (_) { /* already started */ }
}

function closeVoiceOverlay() {
  if (!voiceOverlayEl) return;
  voiceOverlayEl.classList.add('hidden');
  try { globalRecognition.stop(); } catch (_) {}
  if (window.confirmRecognition) {
    try { window.confirmRecognition.stop(); } catch (_) {}
  }
  if (window.homonymRecognition) {
    try { window.homonymRecognition.stop(); } catch (_) {}
  }
  if (window.speechSynthesis) {
    try { window.speechSynthesis.cancel(); } catch (_) {}
  }
  globalRecognitionActive = false;
  if (fabMicEl) fabMicEl.classList.remove('listening');
}

/**
 * Advanced Spoken Hindi NLP Parser for Textile & Handloom Business:
 * 100% Dynamic & Open text: No rigid restriction on brands, items, or categories.
 * Parses multi-attribute sentences such as:
 * - "Ramesh ka ladka Monu, gaon Manoharpur, 1 Laxmipati saree, design number 405, daam 1200 rupaye"
 * - "सुरेश कुंडा 6.5 मीटर अरविंद कपड़ा रेट 200 कुल 1300 रुपये"
 * - "मोहन लाल कमल छाप गड्डा 2 पीस 3500 टका"
 */
function parseSpokenTextileSentence(rawTranscript) {
  let text = normalizeDevanagariNumbers(rawTranscript).trim();

  // 1. Village Extraction: e.g. "गांव मनोहरपुर", "gaon Manoharpur", "ग्राम कुंडा"
  let village = '';
  const villageMatch = text.match(/(?:गांव|गाँव|गाव|ग्राम|निवासी|वार्ड|gaon|gram|ward)\s+([^\s,]+)/i);
  if (villageMatch) {
    village = villageMatch[1].trim();
    text = text.replace(villageMatch[0], ' ');
  }

  // 2. Design / Article Number Extraction
  let designNumber = '';
  const designMatch = text.match(/(?:design\s*number|design\s*no\.?|design|डिजाइन\s*नंबर|डिजाइन\s*नं\.?|डिजाइन|डीजाइन|आर्टिकल|article\s*no\.?)\s*(?:#|no\.?)?\s*([a-zA-Z0-9\-_]+)/i);
  if (designMatch) {
    designNumber = designMatch[1].trim();
    text = text.replace(designMatch[0], ' ');
  }

  // 3. Meters / Gaj / Length Units (Cloth cuts)
  let meters = null;
  let unitType = 'piece';
  const meterMatch = text.match(/(\d+(\.\d+)?)\s*(?:मीटर|meter|mtr|लम्बाई|lambai|m\b)/i);
  const gajMatch   = text.match(/(\d+(\.\d+)?)\s*(?:गज|gaj)/i);
  if (meterMatch) {
    meters = meterMatch[1];
    unitType = 'meter';
    text = text.replace(meterMatch[0], ' ');
  } else if (gajMatch) {
    meters = gajMatch[1];
    unitType = 'gaj';
    text = text.replace(gajMatch[0], ' ');
  }

  // 4. Quantity & Count Units (nag, piece, thān, jodi, etc.)
  let quantity = null;
  const qtyMatch = text.match(/(\d+)\s*(?:पीस|piece|pieces|नग|nag|थान|than|thān|जोड़ी|जोड़ी|jodi|सेट|set|गिनती|ginaati|किलो|kilo|kg|पौ|pau)/i);
  if (qtyMatch) {
    quantity = qtyMatch[1];
    if (!meters) {
      const uWord = qtyMatch[0].replace(qtyMatch[1], '').trim().toLowerCase();
      if (/थान|than|thān/.test(uWord)) unitType = 'than';
      else if (/नग|nag/.test(uWord)) unitType = 'nag';
      else if (/जोड़ी|जोड़ी|jodi/.test(uWord)) unitType = 'jodi';
      else if (/किलो|kilo|kg/.test(uWord)) unitType = 'kg';
      else unitType = 'piece';
    }
    text = text.replace(qtyMatch[0], ' ');
  }

  // 5. Price / Amount Extraction with broad Hindi synonyms:
  // daam, keemat, rupaye, paise, rate, rs, rupya, kitne ka, टका, मूल्य, भाव, दर
  let amount = null;
  let rate = null;

  // Rate check: e.g. "rate 250" or "रेट 250" or "भाव 250"
  const rateMatch = text.match(/(?:रेट|भाव|दर|rate)\s*(\d[\d,]*)/i);
  if (rateMatch) {
    rate = rateMatch[1].replace(',', '');
    text = text.replace(rateMatch[0], ' ');
  }

  // Amount extraction
  const amountMatch = text.match(/(?:दाम|कीमत|मूल्य|रुपये?|रुपया|पैसे?|टका|daam|keemat|moolya|price|rupaye?|rupya|rs\.?|₹)\s*(\d[\d,]*)/i)
                   || text.match(/(\d[\d,]*)\s*(?:रुपये?|रुपया|पैसे?|टका|rupaye?|rupya|rs\.?|₹|दाम|कीमत)/i);
  if (amountMatch) {
    amount = (amountMatch[1] || amountMatch[0]).match(/\d[\d,]*/)[0].replace(',', '');
    text = text.replace(amountMatch[0], ' ');
  }

  // 6. Brand / Mill / Company Extraction
  let brand = '';
  // Explicit brand/chap/marka/mill keyword:
  // e.g. "ब्रांड लक्ष्मीपति", "विमल छाप", "रेमंड मार्का", "बॉम्बे डाइंग कंपनी", "कमल छाप"
  const chapMatch = text.match(/(?:ब्रांड|brand|कंपनी|company|मिल|mill|छाप|chap|मार्का|marka|naam)\s+([a-zA-Z\u0900-\u097F]+)/i)
                 || text.match(/([a-zA-Z\u0900-\u097F]+)\s+(?:छाप|chap|मार्का|marka|ब्रांड|brand|मिल|mill|कंपनी|company)/i);
  if (chapMatch) {
    brand = chapMatch[1].trim();
    text = text.replace(chapMatch[0], ' ');
  } else {
    // Known textile mills dictionary
    const knownBrands = [
      { key: /लक्ष्मीपति|laxmipati/i, val: 'लक्ष्मीपति' },
      { key: /बॉम्बे\s*डाइंग|bombay\s*dyeing/i, val: 'बॉम्बे डाइंग' },
      { key: /रेमंड|raymond/i, val: 'रेमंड' },
      { key: /विमल|vimal/i, val: 'विमल' },
      { key: /अरविंद|arvind/i, val: 'अरविंद' },
      { key: /सियाराम|siyaram/i, val: 'सियाराम' },
      { key: /वर्धमान|vardhman/i, val: 'वर्धमान' },
      { key: /सुभाष|subhash/i, val: 'सुभाष' },
      { key: /विशाल|vishal/i, val: 'विशाल' },
      { key: /ग्वालियर|gwalior/i, val: 'ग्वालियर' },
      { key: /मफतलाल|mafatlal/i, val: 'मफतलाल' },
      { key: /दिग्विजय|digvijay/i, val: 'दिग्विजय' },
      { key: /ग्रेसिम|grasim/i, val: 'ग्रेसिम' },
      { key: /वेलस्पन|welspun/i, val: 'वेलस्पन' },
      { key: /ओसवाल|oswal/i, val: 'ओसवाल' },
      { key: /रूचि|रुचि|ruchi/i, val: 'रुचि' },
      { key: /स्पर्श|sparsh/i, val: 'स्पर्श' },
    ];
    for (const b of knownBrands) {
      if (b.key.test(text)) {
        brand = b.val;
        text = text.replace(b.key, ' ');
        break;
      }
    }
  }

  // 7. Dynamic Category & Product / Item Extraction (Open Handloom & Textile)
  let category = '';
  let item = '';
  const textileProducts = [
    { key: /साड़ी|साड़ी|साडी|saree|sari/i, cat: 'साड़ी', item: 'साड़ी' },
    { key: /पैंट[\s\-]*शर्ट|pant[\s\-]*shirt|सूट[\s\-]*कपड़ा|कुर्ता[\s\-]*पायजामा/i, cat: 'पैंट-शर्ट', item: 'पैंट-शर्ट' },
    { key: /पैंट|pant|trouser/i, cat: 'पैंट-शर्ट', item: 'पैंट' },
    { key: /शर्ट|shirt/i, cat: 'पैंट-शर्ट', item: 'शर्ट' },
    { key: /चादर|bedsheet|बेडशीट/i, cat: 'चादर/कम्बल', item: 'चादर' },
    { key: /कम्बल|कंबल|blanket|रजाई|खेश/i, cat: 'चादर/कम्बल', item: 'कम्बल' },
    { key: /तौलिया|gamchha|गमछा|towel/i, cat: 'चादर/कम्बल', item: 'तौलिया' },
    { key: /पर्दा|पर्दे|curtain|parda/i, cat: 'पर्दा/होम', item: 'पर्दा' },
    { key: /गड्डा|गद्दे|mattress|gadde|gadda/i, cat: 'गड्डा/बिस्तर', item: 'गड्डा' },
    { key: /तकिया|pillow|तकिया\s*कवर/i, cat: 'गड्डा/बिस्तर', item: 'तकिया कवर' },
    { key: /मच्छरदानी|mosquito\s*net/i, cat: 'चादर/कम्बल', item: 'मच्छरदानी' },
    { key: /चटाई|mat/i, cat: 'चादर/कम्बल', item: 'चटाई' },
    { key: /सूती\s*थान|थान\s*कपड़ा|थान|suiting|shirting|सूटिंग|शर्टिंग/i, cat: 'थान/कपड़ा', item: 'थान कपड़ा' },
    { key: /कॉटन\s*रोल|cotton\s*roll|कॉटन|cotton|लठ्ठा|मलमल|पोपलीन|अस्तर/i, cat: 'थान/कपड़ा', item: 'कॉटन कपड़ा' },
    { key: /रेडीमेड|readymade|बनियान|अंडरवियर|टी[\s\-]*शर्ट/i, cat: 'रेडीमेड', item: 'रेडीमेड' },
  ];

  for (const prod of textileProducts) {
    if (prod.key.test(text)) {
      category = prod.cat;
      item     = prod.item;
      text     = text.replace(prod.key, ' ');
      break;
    }
  }

  // 8. If quantity not found but leading digit before product existed:
  // e.g. "1 साड़ी"
  if (!quantity && !meters) {
    const lonelyNum = text.match(/\b([1-9]\d?)\b/);
    if (lonelyNum && Number(lonelyNum[1]) <= 50) {
      quantity = lonelyNum[1];
      text = text.replace(lonelyNum[0], ' ');
    }
  }

  // 9. If amount still not set, look for remaining number (often total price)
  if (!amount) {
    const remainingNums = text.match(/\d+/g);
    if (remainingNums && remainingNums.length > 0) {
      amount = remainingNums[remainingNums.length - 1];
      text = text.replace(amount, ' ');
    }
  }

  // If rate and meters/quantity are present, but no amount: amount = rate * (meters || quantity)
  if (!amount && rate) {
    if (meters) amount = String(Math.round(Number(rate) * Number(meters)));
    else if (quantity) amount = String(Math.round(Number(rate) * Number(quantity)));
    else amount = rate;
  }

  // 10. Clean Customer Query
  let customerText = text
    .replace(/[,\-–—|।!?;:]/g, ' ')
    .replace(/\b(?:को|ko|ke liye|ने|ne|का|ki|ke|वाला|wali)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!customerText && rawTranscript.includes(',')) {
    customerText = rawTranscript.split(',')[0].trim();
  }

  // Default category and item if none detected
  if (!category) category = 'अन्य';
  if (!item && brand) item = brand;
  if (!item) item = category;

  return {
    customerQuery: customerText,
    village,
    amount,
    rate,
    meters,
    unitType,
    quantity,
    brand,
    designNumber,
    category,
    item,
  };
}

/**
 * Main intent dispatcher for global voice assistant:
 * 1. NAVIGATE   — "wapas", "ghar", "aaj", "hisab"
 * 2. SEARCH     — "... ka hisab" / "... dhundo" / "Ramesh Manoharpur"
 * 3. ADD SALE   — Multi-attribute NLP parser + smart customer resolution with homonym picker
 */
async function handleGlobalIntent(rawTranscript) {
  const normalized = normalizeDevanagariNumbers(rawTranscript);
  const lc = normalized.toLowerCase().trim();

  // ── 1. Navigation intents ────────────────────────────────────
  if (/wapas|वापस/.test(lc)) {
    speakHindi(S.voiceNavHome);
    closeVoiceOverlay();
    navigate('home');
    return;
  }
  if (/ghar|घर|home|होम/.test(lc)) {
    speakHindi(S.voiceNavHome);
    closeVoiceOverlay();
    navigate('home');
    return;
  }
  if (/aaj.*(bikri|हिसाब|hisab|sale)|आज का/.test(lc)) {
    speakHindi(S.voiceNavToday);
    closeVoiceOverlay();
    navigate('today');
    return;
  }
  if (/search|khojo|खोजो|ग्राहक/.test(lc)) {
    speakHindi(S.voiceNavSearch);
    closeVoiceOverlay();
    navigate('search');
    return;
  }

  // ── 2. Check Customer lookup intent explicitly ──────────────
  // e.g. "Ramesh ka hisab dikhao" or "Ramesh ka hisab"
  const hisabMatch = normalized.match(/^(.+?)\s+(?:का|के|की)\s+(?:हिसाब|hisab|ledger|बहीखाता|bikri|बिक्री)(?:\s+.*)?$/i);
  if (hisabMatch) {
    const query = hisabMatch[1].trim();
    showVoiceConfirmSearching(query);
    try {
      const results = await api(`/api/customers/search?q=${encodeURIComponent(query)}`);
      if (results.length === 0) {
        speakHindi(`${query} नाम का कोई ग्राहक नहीं मिला`);
        setTimeout(closeVoiceOverlay, 2200);
        return;
      }
      if (results.length > 1) {
        // Homonym Disambiguation: Multiple customers match!
        renderHomonymPicker({
          title: S.homonymTitle,
          prompt: S.homonymPrompt,
          candidates: results.slice(0, 4),
          spokenName: query,
          onSelect: (selectedCustomer) => {
            closeVoiceOverlay();
            navigate('customerDetail', { customerId: selectedCustomer._id, speakBalanceOnLoad: true });
          },
        });
        return;
      }
      const customer = results[0];
      closeVoiceOverlay();
      navigate('customerDetail', { customerId: customer._id, speakBalanceOnLoad: true });
    } catch (e) {
      showToast(S.error);
      setTimeout(closeVoiceOverlay, 1500);
    }
    return;
  }

  // ── 3. Multi-Attribute Textile Sale Entry Intent ─────────────
  // e.g. "Ramesh ka ladka Monu, gaon Manoharpur, 1 Laxmipati saree, design number 405, daam 1200 rupaye"
  const parsed = parseSpokenTextileSentence(rawTranscript);

  if (parsed.customerQuery && (parsed.amount || parsed.category !== 'अन्य' || parsed.brand || parsed.designNumber)) {
    if (!parsed.amount) {
      speakHindi(`राशि समझ नहीं आई, कृपया दोबारा बोलें`);
      const voHint = document.getElementById('vo-hint');
      if (voHint) voHint.textContent = 'राशि (रुपये) स्पष्ट बोलें';
      setTimeout(closeVoiceOverlay, 2400);
      return;
    }

    const voTitle = document.getElementById('vo-title');
    if (voTitle) voTitle.textContent = S.voiceResolvingCustomer;

    try {
      // Smart customer resolution: matches existing or cleanly formats new relation
      const res = await api('/api/customers/resolve', {
        method: 'POST',
        body: {
          spokenQuery: parsed.customerQuery,
          village: parsed.village,
        },
      });

      // Homonym Disambiguation Rule:
      if (res.homonym && res.candidates?.length > 1) {
        renderHomonymPicker({
          title: S.homonymTitle,
          prompt: S.homonymPrompt,
          candidates: res.candidates,
          spokenName: parsed.customerQuery,
          onSelect: (selectedCustomer) => {
            showVoiceConfirm({
              customer:     selectedCustomer,
              amount:       parsed.amount,
              meters:       parsed.meters,
              unitType:     parsed.unitType,
              quantity:     parsed.quantity,
              category:     parsed.category,
              item:         parsed.item,
              brand:        parsed.brand,
              designNumber: parsed.designNumber,
            });
          },
        });
        return;
      }

      const customer = res.customer;
      // Launch Interactive Voice Confirmation Loop
      showVoiceConfirm({
        customer,
        amount:       parsed.amount,
        meters:       parsed.meters,
        unitType:     parsed.unitType,
        quantity:     parsed.quantity,
        category:     parsed.category,
        item:         parsed.item,
        brand:        parsed.brand,
        designNumber: parsed.designNumber,
      });
      return;
    } catch (err) {
      console.warn('Customer resolution error:', err);
      showToast(S.error);
      setTimeout(closeVoiceOverlay, 1500);
      return;
    }
  }

  // ── 4. Fallback: Search Customer Database ────────────────────
  const query = normalized.replace(/(का|के|की|हिसाब|दिखाओ|खोलें|खोलो|देखना)/g, '').trim();
  if (query) {
    showVoiceConfirmSearching(query);
    try {
      const results = await api(`/api/customers/search?q=${encodeURIComponent(query)}`);
      if (results.length === 0) {
        speakHindi(`${query} नाम का कोई ग्राहक नहीं मिला`);
        setTimeout(closeVoiceOverlay, 2200);
        return;
      }
      if (results.length > 1) {
        // Homonym Disambiguation: Multiple customers match!
        renderHomonymPicker({
          title: S.homonymTitle,
          prompt: S.homonymPrompt,
          candidates: results.slice(0, 4),
          spokenName: query,
          onSelect: (selectedCustomer) => {
            closeVoiceOverlay();
            navigate('customerDetail', { customerId: selectedCustomer._id, speakBalanceOnLoad: true });
          },
        });
        return;
      }
      const customer = results[0];
      closeVoiceOverlay();
      navigate('customerDetail', { customerId: customer._id, speakBalanceOnLoad: true });
    } catch (e) {
      showToast(S.error);
      setTimeout(closeVoiceOverlay, 1500);
    }
    return;
  }

  // ── 5. Unrecognized ──────────────────────────────────────────
  const voHint = document.getElementById('vo-hint');
  if (voHint) voHint.textContent = S.voiceError;
  speakHindi(S.fabError);
  setTimeout(closeVoiceOverlay, 2000);
}

/** Show "Searching for <name>…" state in voice overlay */
function showVoiceConfirmSearching(name) {
  const voTitle = document.getElementById('vo-title');
  const voHint  = document.getElementById('vo-hint');
  if (voTitle) voTitle.textContent = `"${name}" खोज रहे हैं…`;
  if (voHint)  voHint.textContent  = '';
}

/**
 * Homonym (Same-Name) Disambiguation Picker:
 * Displays massive numbered touch targets (88px+ buttons, high-contrast) and
 * speaks aloud in Hindi: "किस रमेश का खाता खोलना है? एक या दो?"
 * Supports selecting via touch or voice ("1", "2", "पहला", "दूसरा").
 */
function renderHomonymPicker({ title, prompt, candidates, spokenName, onSelect }) {
  const voConfirm = document.getElementById('vo-confirm-area');
  const voTitle   = document.getElementById('vo-title');
  const voHint    = document.getElementById('vo-hint');
  if (!voConfirm) return;

  if (voTitle) voTitle.textContent = title || S.homonymTitle;
  if (voHint)  voHint.textContent  = '';

  voConfirm.innerHTML = `
    <div class="homonym-picker-box">
      <div class="homonym-header">${prompt || S.homonymPrompt}</div>
      <div class="homonym-list">
        ${candidates.map((c, idx) => {
          const num = idx + 1;
          let balHtml = '';
          if (c.balance > 0) {
            balHtml = `<span style="color:#ffb74d;font-weight:700"> · बाकी ₹${c.balance.toLocaleString('hi-IN')}</span>`;
          } else if (c.balance < 0) {
            balHtml = `<span style="color:#81c784;font-weight:700"> · अग्रिम ₹${Math.abs(c.balance).toLocaleString('hi-IN')}</span>`;
          } else {
            balHtml = `<span style="color:#b0bec5"> · हिसाब साफ</span>`;
          }

          return `
            <button class="homonym-btn" data-index="${idx}" type="button">
              <span class="homonym-index-badge">${num}</span>
              <div class="homonym-info">
                <div class="homonym-name">${esc(c.name)}</div>
                <div class="homonym-sub">
                  ${c.village ? `📍 ${esc(c.village)}` : 'गाँव दर्ज नहीं'}
                  ${c.phone ? ` · 📞 ${esc(c.phone)}` : ''}
                  ${balHtml}
                </div>
              </div>
              <span style="font-size:1.8rem;color:var(--primary);margin-left:8px">›</span>
            </button>
          `;
        }).join('')}
      </div>
      <div style="font-size:1.05rem;color:#80cbc4;margin-top:16px;text-align:center;font-weight:700" id="homonym-voice-status">
        🔴 नंबर बोलें (1, 2) या स्क्रीन पर छुएं
      </div>
    </div>
  `;

  // Attach touch listeners
  voConfirm.querySelectorAll('.homonym-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (window.homonymRecognition) {
        try { window.homonymRecognition.stop(); } catch (_) {}
      }
      const idx = Number(btn.dataset.index);
      const chosen = candidates[idx];
      if (chosen) onSelect(chosen);
    });
  });

  // Build spoken question: e.g. "किस रमेश का खाता खोलना है? एक या दो?"
  let question = `किस ${spokenName || 'ग्राहक'} का खाता खोलना है? `;
  if (candidates.length === 2) {
    question += `एक या दो?`;
  } else {
    question += `नंबर एक, दो या तीन बोलें?`;
  }

  speakHindi(question, () => {
    startHomonymVoiceListener(candidates, onSelect);
  });
}

/**
 * Listens for user response during Homonym Disambiguation:
 * Supports "1", "2", "3", "एक", "दो", "तीन", "पहला", "दूसरा", or village name.
 */
function startHomonymVoiceListener(candidates, onSelect) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  if (window.homonymRecognition) {
    try { window.homonymRecognition.stop(); } catch (_) {}
  }

  const rec = new SpeechRecognition();
  window.homonymRecognition = rec;
  rec.lang            = 'hi-IN';
  rec.interimResults  = false;
  rec.maxAlternatives = 1;

  rec.onresult = (event) => {
    const raw = normalizeDevanagariNumbers(event.results?.[0]?.[0]?.transcript || '').trim();
    const lc = raw.toLowerCase();

    // Check numbers 1, 2, 3, 4 or ordinal/cardinal words
    let chosenIdx = -1;
    if (/\b1\b|एक|पहला|one|first/i.test(lc)) chosenIdx = 0;
    else if (/\b2\b|दो|दूसरा|two|second/i.test(lc)) chosenIdx = 1;
    else if (/\b3\b|तीन|तीसरा|three|third/i.test(lc)) chosenIdx = 2;
    else if (/\b4\b|चार|चौथा|four|fourth/i.test(lc)) chosenIdx = 3;

    // Check if user spoke a candidate village name
    if (chosenIdx === -1) {
      for (let i = 0; i < candidates.length; i++) {
        if (candidates[i].village && lc.includes(candidates[i].village.toLowerCase())) {
          chosenIdx = i;
          break;
        }
      }
    }

    if (chosenIdx >= 0 && candidates[chosenIdx]) {
      try { rec.stop(); } catch (_) {}
      onSelect(candidates[chosenIdx]);
      return;
    }

    // Cancel command
    if (/रद्द|कैंसिल|बंद|cancel/i.test(lc)) {
      closeVoiceOverlay();
      return;
    }

    // Re-prompt
    const statusEl = document.getElementById('homonym-voice-status');
    if (statusEl) statusEl.textContent = 'कृपया 1 या 2 बोलें…';
    setTimeout(() => {
      try { rec.start(); } catch (_) {}
    }, 600);
  };

  rec.onerror = () => {
    if (!voiceOverlayEl.classList.contains('hidden')) {
      setTimeout(() => {
        try { rec.start(); } catch (_) {}
      }, 1200);
    }
  };

  try { rec.start(); } catch (_) {}
}

/**
 * Full-Screen Voice Confirmation & Interactive Control Loop (Hands-Free):
 * App speaks aloud in clear Hindi:
 * "ग्राहक: रमेश (लड़का मोनू), गांव: मनोहरपुर। 1 साड़ी, ब्रांड: लक्ष्मीपति, डिजाइन नंबर: 405, मूल्य: 1200 रुपये। क्या यह सही है? बोलिए 'हाँ सही है' या 'बदलो'।"
 *
 * Intelligent Mid-Sentence Field Correction:
 * - "1200 नहीं 1500 दाम है" -> Updates Amount to 1500, re-reads aloud, and waits for final "हाँ".
 * - "लक्ष्मीपति नहीं बॉम्बे डाइंग है" -> Updates Brand, re-reads aloud, and waits for final "हाँ".
 * - "साड़ी नहीं पर्दा है" -> Updates Product/Item, re-reads aloud, and waits for final "हाँ".
 * - "हाँ" / "सही है" / "ठीक है" -> Saves entry automatically & plays success chime.
 */
function showVoiceConfirm(entryData) {
  let { customer, amount, meters, quantity, category, item, brand, designNumber, unitType } = entryData;

  const voConfirm = document.getElementById('vo-confirm-area');
  const voTitle   = document.getElementById('vo-title');
  const voHint    = document.getElementById('vo-hint');
  if (!voConfirm) return;

  if (voTitle) voTitle.textContent = S.voiceConfirmTitle;
  if (voHint)  voHint.textContent  = '';

  const renderCard = () => {
    voConfirm.innerHTML = `
      <div class="voice-confirm-card">
        <div class="voice-confirm-row">
          <span class="voice-confirm-key">${S.customer_label}</span>
          <span style="font-weight:900;font-size:1.2rem">${esc(customer.name)}</span>
        </div>
        ${customer.village ? `
        <div class="voice-confirm-row">
          <span class="voice-confirm-key">${S.village_label}</span>
          <span style="font-weight:700">📍 ${esc(customer.village)}</span>
        </div>` : ''}
        <div class="voice-confirm-row">
          <span class="voice-confirm-key">${S.catLabel}</span>
          <span style="font-weight:800;color:#ffb74d">${esc(item || category || 'माल')}</span>
        </div>
        ${brand ? `<div class="voice-confirm-row">
          <span class="voice-confirm-key">${S.labelBrand}</span>
          <span>🏷️ ${esc(brand)}</span>
        </div>` : ''}
        ${designNumber ? `<div class="voice-confirm-row">
          <span class="voice-confirm-key">${S.labelDesignNumber}</span>
          <span style="font-weight:700;color:#ffb74d">#${esc(designNumber)}</span>
        </div>` : ''}
        ${meters ? `<div class="voice-confirm-row">
          <span class="voice-confirm-key">${S.labelMeters}</span>
          <span>${meters} ${unitType === 'gaj' ? 'गज' : S.meters_unit}</span>
        </div>` : ''}
        ${quantity ? `<div class="voice-confirm-row">
          <span class="voice-confirm-key">${S.labelQuantity}</span>
          <span>${quantity} पीस</span>
        </div>` : ''}
        <div class="voice-confirm-row">
          <span class="voice-confirm-key">${S.labelAmount}</span>
          <span style="font-size:1.7rem;font-weight:900;color:var(--primary)">${S.rupee}${Number(amount).toLocaleString('hi-IN')}</span>
        </div>
      </div>

      <div style="font-size:1.05rem;color:#80cbc4;margin-bottom:16px;font-weight:700" id="vc-loop-status">
        ${S.voiceLoopListening}
      </div>

      <div class="voice-confirm-actions">
        <button class="btn btn-primary" id="vc-confirm" style="font-size:1.2rem;padding:18px;min-height:72px">${S.voiceConfirmYes}</button>
        <button class="btn btn-secondary" id="vc-edit" style="min-height:64px">${S.voiceConfirmEdit}</button>
        <button class="voice-overlay-close" id="vc-cancel">${S.voiceConfirmCancel}</button>
      </div>
    `;

    document.getElementById('vc-confirm').addEventListener('click', () => executeDirectSave());
    document.getElementById('vc-edit').addEventListener('click', () => {
      closeVoiceOverlay();
      navigate('addEntry', {
        customerId:   customer._id,
        customerName: customer.name,
        type:         'sale',
        prefill: { amount, meters, quantity, category, item, brand, designNumber, unitType },
      });
    });
    document.getElementById('vc-cancel').addEventListener('click', closeVoiceOverlay);
  };

  // Save entry automatically to database with exact current timestamp
  const executeDirectSave = async () => {
    const statusEl = document.getElementById('vc-loop-status');
    if (statusEl) statusEl.textContent = S.loading;

    try {
      await api('/api/entries', {
        method: 'POST',
        body: {
          customerId:   customer._id,
          type:         'sale',
          amount:       Math.round(Number(amount)),
          item:         item || (brand ? `${brand} ${category}`.trim() : category),
          meters:       meters ? Number(meters) : null,
          quantity:     quantity ? Math.round(Number(quantity)) : null,
          unitType:     unitType || 'piece',
          brand:        brand || '',
          designNumber: designNumber || '',
          category:     category || 'अन्य',
          date:         new Date().toISOString(), // automatically exact timestamp (never spoken or entered manually)
          note:         'बोलकर दर्ज किया गया (Voice Assistant)',
        },
      });

      playSuccessChime();
      speakHindi(S.voiceSavedDirect);
      closeVoiceOverlay();
      showToast(S.voiceSavedDirect);
      navigate('customerDetail', { customerId: customer._id });
    } catch (err) {
      showToast(err.message || S.error);
      if (statusEl) statusEl.textContent = S.error;
    }
  };

  // Build the Hindi spoken question
  const askVoiceConfirmation = () => {
    renderCard();

    let spokenPrompt = `ग्राहक: ${customer.name}`;
    if (customer.village) spokenPrompt += `, गांव: ${customer.village}`;
    spokenPrompt += '। ';
    if (quantity) spokenPrompt += `${quantity} पीस `;
    if (meters)   spokenPrompt += `${meters} ${unitType === 'gaj' ? 'गज' : 'मीटर'} `;
    spokenPrompt += `${item || category || 'माल'}, `;
    if (brand)    spokenPrompt += `ब्रांड: ${brand}, `;
    if (designNumber) spokenPrompt += `डिजाइन नंबर: ${designNumber}, `;
    spokenPrompt += `मूल्य: ${amount} रुपये। `;
    spokenPrompt += `क्या यह सही है? बोलिए 'हाँ सही है' या 'बदलो'।`;

    speakHindi(spokenPrompt, () => {
      startVoiceConfirmListener();
    });
  };

  // Listen for user voice response and handle mid-sentence corrections
  const startVoiceConfirmListener = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (window.confirmRecognition) {
      try { window.confirmRecognition.stop(); } catch (_) {}
    }

    const rec = new SpeechRecognition();
    window.confirmRecognition = rec;
    rec.lang            = 'hi-IN';
    rec.interimResults  = false;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      const reply = normalizeDevanagariNumbers(event.results?.[0]?.[0]?.transcript || '').trim();
      const lcReply = reply.toLowerCase();

      // 1. Check affirmative: "हाँ", "सही है", "ठीक है", "save", "कर दो"
      if (/हाँ|हां|सही|ठीक|कर दो|सेव|yes|ha|haan|sahi|thik|save/i.test(lcReply)) {
        executeDirectSave();
        return;
      }

      // 2. Check cancel: "रद्द", "cancel", "बंद"
      if (/रद्द|कैंसिल|बंद|cancel/i.test(lcReply)) {
        closeVoiceOverlay();
        return;
      }

      // 3. Mid-Sentence Field Correction: Brand correction
      // e.g. "लक्ष्मीपति नहीं बॉम्बे डाइंग है", "ब्रांड विमल है", "रेमंड नहीं अरविंद"
      const knownBrands = [
        { key: /लक्ष्मीपति|laxmipati/i, val: 'लक्ष्मीपति' },
        { key: /बॉम्बे\s*डाइंग|bombay\s*dyeing/i, val: 'बॉम्बे डाइंग' },
        { key: /रेमंड|raymond/i, val: 'रेमंड' },
        { key: /विमल|vimal/i, val: 'विमल' },
        { key: /अरविंद|arvind/i, val: 'अरविंद' },
        { key: /सियाराम|siyaram/i, val: 'सियाराम' },
        { key: /वर्धमान|vardhman/i, val: 'वर्धमान' },
        { key: /सुभाष|subhash/i, val: 'सुभाष' },
        { key: /विशाल|vishal/i, val: 'विशाल' },
        { key: /ग्वालियर|gwalior/i, val: 'ग्वालियर' },
        { key: /मफतलाल|mafatlal/i, val: 'मफतलाल' },
        { key: /दिग्विजय|digvijay/i, val: 'दिग्विजय' },
        { key: /ग्रेसिम|grasim/i, val: 'ग्रेसिम' },
        { key: /वेलस्पन|welspun/i, val: 'वेलस्पन' },
        { key: /ओसवाल|oswal/i, val: 'ओसवाल' },
      ];
      let newBrand = '';
      if (/नहीं|nahi/i.test(reply)) {
        const afterNahi = reply.split(/नहीं|nahi/i)[1];
        for (const b of knownBrands) {
          if (b.key.test(afterNahi)) { newBrand = b.val; break; }
        }
        if (!newBrand) {
          const m = afterNahi.match(/(?:ब्रांड|brand|छाप|कंपनी|मिल)?\s*([a-zA-Z\u0900-\u097F]+)/i);
          if (m && m[1].length > 2 && !/है|hai|karo|करो/.test(m[1])) newBrand = m[1].trim();
        }
      } else if (/ब्रांड|brand|छाप|कंपनी|मिल/i.test(reply)) {
        for (const b of knownBrands) {
          if (b.key.test(reply)) { newBrand = b.val; break; }
        }
      }

      if (newBrand && newBrand !== brand) {
        brand = newBrand;
        renderCard();
        speakHindi(`ब्रांड बदलकर ${brand} कर दिया गया है। क्या यह सही है? बोलिए 'हाँ सही है' या 'बदलो'।`, () => {
          startVoiceConfirmListener();
        });
        return;
      }

      // 4. Mid-Sentence Field Correction: Product / Item correction
      // e.g. "साड़ी नहीं पर्दा है", "चादर नहीं कम्बल", "item parda hai", "गड्डा है"
      const textProds = [
        { key: /साड़ी|साड़ी|साडी|saree|sari/i, cat: 'साड़ी', item: 'साड़ी' },
        { key: /पैंट[\s\-]*शर्ट|pant[\s\-]*shirt|सूट/i, cat: 'पैंट-शर्ट', item: 'पैंट-शर्ट' },
        { key: /पैंट|pant/i, cat: 'पैंट-शर्ट', item: 'पैंट' },
        { key: /शर्ट|shirt/i, cat: 'पैंट-शर्ट', item: 'शर्ट' },
        { key: /चादर|bedsheet/i, cat: 'चादर/कम्बल', item: 'चादर' },
        { key: /कम्बल|कंबल|blanket|रजाई/i, cat: 'चादर/कम्बल', item: 'कम्बल' },
        { key: /पर्दा|पर्दे|curtain|parda/i, cat: 'पर्दा/होम', item: 'पर्दा' },
        { key: /गड्डा|गद्दे|mattress|gadde/i, cat: 'गड्डा/बिस्तर', item: 'गड्डा' },
        { key: /मच्छरदानी/i, cat: 'चादर/कम्बल', item: 'मच्छरदानी' },
        { key: /थान|कपड़ा|suiting/i, cat: 'थान/कपड़ा', item: 'थान कपड़ा' },
      ];
      let newItem = '';
      let newCat = '';
      if (/नहीं|nahi/i.test(reply)) {
        const afterNahi = reply.split(/नहीं|nahi/i)[1];
        for (const p of textProds) {
          if (p.key.test(afterNahi)) { newItem = p.item; newCat = p.cat; break; }
        }
      } else {
        for (const p of textProds) {
          if (p.key.test(reply)) { newItem = p.item; newCat = p.cat; break; }
        }
      }

      if (newItem && newItem !== item) {
        item = newItem;
        category = newCat || newItem;
        renderCard();
        speakHindi(`सामान बदलकर ${item} कर दिया गया है। क्या यह सही है? बोलिए 'हाँ सही है' या 'बदलो'।`, () => {
          startVoiceConfirmListener();
        });
        return;
      }

      // 5. Mid-Sentence Field Correction: Meters or Quantity
      const meterCheck = reply.match(/(\d+(\.\d+)?)\s*(?:मीटर|meter)/i);
      if (meterCheck) {
        meters = meterCheck[1];
        renderCard();
        speakHindi(`मीटर बदलकर ${meters} मीटर कर दिया गया है। क्या यह सही है? बोलिए 'हाँ सही है' या 'बदलो'।`, () => {
          startVoiceConfirmListener();
        });
        return;
      }

      const qtyCheck = reply.match(/(\d+)\s*(?:पीस|piece|थान|नग)/i);
      if (qtyCheck) {
        quantity = qtyCheck[1];
        renderCard();
        speakHindi(`पीस बदलकर ${quantity} कर दिया गया है। क्या यह सही है? बोलिए 'हाँ सही है' या 'बदलो'।`, () => {
          startVoiceConfirmListener();
        });
        return;
      }

      // 6. Mid-Sentence Field Correction: Price / Amount update
      // e.g. "1200 nahi 1500 daam hai", "1500 rupaye karo", "rate 1500"
      const numbers = reply.match(/\d+/g);
      const isPriceContext = /दाम|मूल्य|रुपये|rupaye|रेट|rate|कीमत|keemat|टका|nahi|नहीं|karo|करो/i.test(lcReply);
      if (numbers && numbers.length > 0 && isPriceContext && !/मीटर|meter|पीस|piece|नग/i.test(lcReply)) {
        const newAmt = numbers[numbers.length - 1];
        if (newAmt !== amount) {
          amount = newAmt;
          renderCard();
          speakHindi(`मूल्य बदलकर ${amount} रुपये कर दिया गया है। क्या यह सही है? बोलिए 'हाँ सही है' या 'बदलो'।`, () => {
            startVoiceConfirmListener();
          });
          return;
        }
      }

      // 7. General "बदलो" without specific field: open Add Entry screen
      if (/बदलो|बदल|नहीं|change|edit/i.test(lcReply)) {
        closeVoiceOverlay();
        navigate('addEntry', {
          customerId:   customer._id,
          customerName: customer.name,
          type:         'sale',
          prefill: { amount, meters, quantity, category, item, brand, designNumber, unitType },
        });
        showToast('जानकारी बदलें और सेव करें');
        return;
      }

      // If not understood, gently re-prompt
      const statusEl = document.getElementById('vc-loop-status');
      if (statusEl) statusEl.textContent = 'बोलिए: "हाँ" या "बदलो"…';
      setTimeout(() => {
        try { rec.start(); } catch (_) {}
      }, 500);
    };

    rec.onerror = () => {
      if (!voiceOverlayEl.classList.contains('hidden')) {
        setTimeout(() => {
          try { rec.start(); } catch (_) {}
        }, 1200);
      }
    };

    try { rec.start(); } catch (_) {}
  };

  // Start the voice confirmation flow
  askVoiceConfirmation();
}

// ═══════════════════════════════════════════════════════════════════
// SCREEN: Diary Photo Upload (Shopkeeper Mode — Button 3)
// Simple 1-tap capture → sends to AI OCR pipeline → admin verifies
// ═══════════════════════════════════════════════════════════════════
function renderDiaryUpload() {
  mainEl.innerHTML = `
    <div class="screen">
      <button class="btn btn-secondary btn-sm mb-16" id="btn-diary-back">${S.back}</button>
      <div class="page-title">${S.diaryUploadTitle}</div>

      <p style="font-size:1.05rem;color:var(--text-muted);margin-bottom:20px;line-height:1.6">
        ${S.diaryUploadHint}
      </p>

      <!-- Optional Customer Name Tag with Voice Input Option -->
      <div class="form-group">
        <label for="diary-customer-name">${S.diaryCustomerTag}</label>
        <div style="display:flex;gap:8px;">
          <input id="diary-customer-name" type="text"
                 placeholder="जैसे: श्री संजय पटेल की बहन"
                 autocomplete="off"
                 style="font-size:1.3rem;min-height:60px;flex:1;" />
          <button class="btn-voice" type="button" id="btn-diary-voice-name" style="width:auto;padding:0 18px;min-height:60px;border-radius:var(--radius-sm);display:inline-flex;align-items:center;gap:6px;">
            🎤 बोलें
          </button>
        </div>
      </div>

      <!-- Photo Preview Area -->
      <div class="diary-preview-area" id="diary-preview-area">
        <div class="ocr-photo-placeholder" id="diary-preview-placeholder">
          <span style="font-size:3rem">📷</span>
          <span>यहाँ फोटो दिखेगी</span>
        </div>
        <img id="diary-preview-img" src="" alt="डायरी फोटो" style="display:none" />
      </div>

      <!-- Hidden File Input (camera capture) -->
      <input type="file" id="diary-photo-input" accept="image/*" capture="environment" style="display:none" />

      <!-- Big Camera Capture Button -->
      <button class="diary-capture-btn" id="btn-diary-capture" style="margin-top:20px;">
        <span class="diary-capture-icon">📷</span>
        <span>${S.diaryCaptureBtn}</span>
      </button>

      <div id="diary-error" style="color:#ef5350;font-size:1rem;margin-top:12px;display:none"></div>

      <!-- Upload Button (shown after photo selected) -->
      <button class="btn btn-primary" id="btn-diary-send"
              style="margin-top:16px;min-height:72px;font-size:1.4rem;display:none">
        💾 फोटो सेव करें
      </button>
    </div>
  `;

  document.getElementById('btn-diary-back').addEventListener('click', () => navigate('home'));

  setupVoiceRecognition({
    buttonEl: document.getElementById('btn-diary-voice-name'),
    statusEl: document.getElementById('diary-error'),
    onResult: (transcript) => {
      document.getElementById('diary-customer-name').value = transcript;
      showToast(`${S.voiceSuccess}: "${transcript}"`);
    },
  });

  const photoInput  = document.getElementById('diary-photo-input');
  const captureBtn  = document.getElementById('btn-diary-capture');
  const previewArea = document.getElementById('diary-preview-area');
  const previewImg  = document.getElementById('diary-preview-img');
  const placeholder = document.getElementById('diary-preview-placeholder');
  const sendBtn     = document.getElementById('btn-diary-send');
  const errEl       = document.getElementById('diary-error');

  let selectedFile = null;

  // Tap the big camera button → triggers file/camera input
  captureBtn.addEventListener('click', () => photoInput.click());

  photoInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    selectedFile = file;

    // Show preview
    const reader = new FileReader();
    reader.onload = (ev) => {
      previewImg.src = ev.target.result;
      previewImg.style.display = 'block';
      placeholder.style.display = 'none';
    };
    reader.readAsDataURL(file);

    // Show send button
    sendBtn.style.display = 'block';
    captureBtn.textContent = '📷 दूसरी फोटो लें';
    errEl.style.display = 'none';
  });

  sendBtn.addEventListener('click', async () => {
    if (!selectedFile) {
      errEl.textContent = 'पहले फोटो लें';
      errEl.style.display = 'block';
      return;
    }

    sendBtn.disabled = true;
    sendBtn.textContent = S.diaryUploading;
    errEl.style.display = 'none';

    try {
      // Build multipart/form-data payload
      const formData = new FormData();
      formData.append('diaryPhoto', selectedFile, selectedFile.name);

      const customerName = document.getElementById('diary-customer-name').value.trim();
      if (customerName) {
        formData.append('customerName', customerName);
      }

      // Upload to OCR pipeline (no JSON body — use fetch directly for multipart)
      const res = await fetch('/api/ocr/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${state.token}`,
          // Note: do NOT set Content-Type for FormData — browser sets boundary automatically
        },
        body: formData,
      });

      if (res.status === 401) {
        logout();
        throw new Error(S.loginError);
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || S.diaryUploadError);
      }

      showToast(S.diaryUploadSuccess);
      playSuccessChime();
      navigate('home');

    } catch (err) {
      errEl.textContent = err.message || S.diaryUploadError;
      errEl.style.display = 'block';
      sendBtn.disabled = false;
      sendBtn.textContent = '💾 फोटो सेव करें';
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
// ADMIN: AI OCR Verification Queue Tab
// Split-Screen: Handwritten photo (left) | AI-extracted form (right)
// One-click Approve / Reject with inline field editing
// ═══════════════════════════════════════════════════════════════════
async function renderAdminOcrQueueTab(container) {
  container.innerHTML = `<div class="spinner"></div>`;

  try {
    const queueRes = await api('/api/ocr/queue');
    const entries  = Array.isArray(queueRes) ? queueRes : (queueRes.entries || []);

    if (entries.length === 0) {
      container.innerHTML = `
        <div class="card text-center" style="padding:40px;font-size:1.2rem;color:#81c784">
          ${A('ocrQueueEmpty')}
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="page-title" style="font-size:1.2rem;margin-bottom:16px">
        ${A('ocrQueueTitle')}
        <span class="admin-ocr-count-badge">${entries.length}</span>
      </div>
      <div id="ocr-queue-list"></div>
    `;

    const listEl = container.querySelector('#ocr-queue-list');

    entries.forEach((entry, idx) => {
      const ocrData  = entry.ocrExtractedData || {};
      const imageUrl = entry.imageUrl ? `/${entry.imageUrl.replace(/\\/g, '/')}` : null;

      const cardEl = document.createElement('div');
      cardEl.className = 'ocr-queue-item pending';
      cardEl.dataset.id = entry._id;

      cardEl.innerHTML = `
        <div style="padding:12px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)">
          <div>
            <span class="pending-badge">${state.adminLang === 'en' ? '⏳ Pending Verification' : S.ocrPendingBadge}</span>
            <span style="font-size:1.05rem;font-weight:700;margin-left:8px">
              ${esc(entry.customer?.name || '—')}
            </span>
            ${entry.customer?.village ? `<span style="font-size:0.9rem;color:var(--text-muted);margin-left:6px">📍 ${esc(entry.customer.village)}</span>` : ''}
          </div>
          <span style="font-size:0.85rem;color:var(--text-muted)">${formatDate(entry.createdAt)}</span>
        </div>

        <!-- Split Screen: Photo (Left) | AI Form (Right) -->
        <div class="ocr-split-screen">

          <!-- LEFT: Zoomable Handwritten Diary Photo -->
          <div class="ocr-photo-pane" id="ocr-pane-${idx}">
            ${imageUrl
              ? `
                <div class="ocr-zoom-toolbar">
                  <button class="ocr-zoom-btn" type="button" data-action="zoom-in" title="Zoom In">🔍+</button>
                  <button class="ocr-zoom-btn" type="button" data-action="zoom-out" title="Zoom Out">🔍-</button>
                  <button class="ocr-zoom-btn" type="button" data-action="zoom-reset" title="Reset">↺</button>
                  <button class="ocr-zoom-btn" type="button" data-action="zoom-full" title="Fullscreen">⛶</button>
                </div>
                <img id="ocr-img-${idx}" src="${esc(imageUrl)}" alt="${A('ocrPhotoLabel')}" class="ocr-zoom-img" style="cursor:zoom-in;" />
              `
              : `<div class="ocr-photo-placeholder">
                   <span style="font-size:2.5rem">📷</span>
                   <span>${state.adminLang === 'en' ? 'Photo not available' : 'फोटो उपलब्ध नहीं'}</span>
                 </div>`
            }
          </div>

          <!-- RIGHT: AI-Extracted Form Fields (Editable) -->
          <div class="ocr-data-pane">
            <div style="font-size:0.85rem;color:#ffb74d;font-weight:700;margin-bottom:8px">
              ${A('ocrExtractedLabel')} — ${A('ocrEditNote')}
            </div>

            <!-- Customer Name & Relation (Brackets) -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <div class="ocr-field-group">
                <div class="ocr-field-label">${A('ocrCustomerName')}</div>
                <input class="ocr-field-input" type="text" id="ocr-customer-${idx}"
                       value="${esc(entry.customer?.name || ocrData.customerName || '')}"
                       placeholder="${A('ocrCustomerName')}" />
              </div>
              <div class="ocr-field-group">
                <div class="ocr-field-label">${A('ocrRelation')}</div>
                <input class="ocr-field-input" type="text" id="ocr-relation-${idx}"
                       value="${esc(entry.customer?.relationTag || ocrData.relationTag || '')}"
                       placeholder="जैसे: बहन / लड़का मोनू" />
              </div>
            </div>

            <!-- Amount & Date -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <div class="ocr-field-group">
                <div class="ocr-field-label">${A('ocrAmount')} *</div>
                <input class="ocr-field-input" type="number" id="ocr-amount-${idx}"
                       value="${entry.amount || ocrData.amount || ''}"
                       placeholder="${A('ocrAmount')}" inputmode="numeric" min="1" />
              </div>
              <div class="ocr-field-group">
                <div class="ocr-field-label">${A('ocrDate')}</div>
                <input class="ocr-field-input" type="text" id="ocr-date-${idx}"
                       value="${entry.date ? new Date(entry.date).toLocaleDateString('en-GB') : (ocrData.date || todayISO())}"
                       placeholder="DD.MM.YY" />
              </div>
            </div>

            <!-- Item & Brand -->
            <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:8px;">
              <div class="ocr-field-group">
                <div class="ocr-field-label">${A('ocrItem')}</div>
                <input class="ocr-field-input" type="text" id="ocr-item-${idx}"
                       value="${esc(entry.item || ocrData.item || '')}"
                       placeholder="जैसे: पर्दा, साड़ी, पैंट-शर्ट" />
              </div>
              <div class="ocr-field-group">
                <div class="ocr-field-label">${A('ocrBrand')}</div>
                <input class="ocr-field-input" type="text" id="ocr-brand-${idx}"
                       value="${esc(entry.brand || ocrData.brand || '')}"
                       placeholder="जैसे: लक्ष्मीपति, विमल" />
              </div>
            </div>

            <!-- Quantity / Meters -->
            <div class="ocr-field-group">
              <div class="ocr-field-label">${A('ocrQuantity')}</div>
              <input class="ocr-field-input" type="number" id="ocr-quantity-${idx}"
                     value="${entry.quantity || entry.meters || ocrData.quantity || ''}"
                     placeholder="जैसे: 2 पीस या 5.5 मीटर" step="any" />
            </div>

            <!-- OCR Confidence -->
            ${ocrData.confidence !== undefined ? `
            <div class="ocr-field-group">
              <div class="ocr-field-label">${A('ocrConfidence')}: ${Math.round((ocrData.confidence || 0) * 100)}%</div>
              <div class="ocr-confidence-bar">
                <div class="ocr-confidence-fill" style="width:${Math.round((ocrData.confidence || 0) * 100)}%"></div>
              </div>
            </div>` : ''}

            <!-- Note / Memo -->
            <div class="ocr-field-group">
              <div class="ocr-field-label">${A('ocrNote')}</div>
              <input class="ocr-field-input" type="text" id="ocr-note-${idx}"
                     value="${esc(entry.note || ocrData.note || (state.adminLang === 'en' ? 'Transferred from Diary' : 'डायरी से स्थानांतरित'))}"
                     placeholder="${A('ocrNote')}" />
            </div>
          </div>
        </div>

        <!-- Action Row: Approve / Reject -->
        <div class="ocr-action-row">
          <button class="ocr-approve-btn" data-idx="${idx}">${A('ocrApproveBtn')}</button>
          <button class="ocr-reject-btn"  data-idx="${idx}">${A('ocrRejectBtn')}</button>
        </div>
      `;

      listEl.appendChild(cardEl);

      // ── Zoom logic for handwritten diary photo ──────────────────
      let currentZoom = 1.0;
      const zoomImg = cardEl.querySelector(`#ocr-img-${idx}`);
      const setZoom = (z) => {
        currentZoom = Math.max(1.0, Math.min(3.5, z));
        if (zoomImg) {
          zoomImg.style.transform = `scale(${currentZoom})`;
          zoomImg.style.cursor = currentZoom > 1.0 ? 'zoom-out' : 'zoom-in';
        }
      };

      cardEl.querySelectorAll('.ocr-zoom-btn').forEach(btn => {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const action = btn.dataset.action;
          if (action === 'zoom-in')    setZoom(currentZoom + 0.4);
          if (action === 'zoom-out')   setZoom(currentZoom - 0.4);
          if (action === 'zoom-reset') setZoom(1.0);
          if (action === 'zoom-full' && imageUrl) openPhotoModal(imageUrl);
        });
      });

      if (zoomImg) {
        zoomImg.addEventListener('click', () => {
          setZoom(currentZoom > 1.0 ? 1.0 : 2.0);
        });
      }

      // ── Approve button handler ──────────────────────────────────
      cardEl.querySelector('.ocr-approve-btn').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const i   = btn.dataset.idx;
        btn.disabled = true;
        btn.textContent = A('loading');

        const customerName = document.getElementById(`ocr-customer-${i}`)?.value.trim() || '';
        const relationTag  = document.getElementById(`ocr-relation-${i}`)?.value.trim() || '';
        const amount       = Number(document.getElementById(`ocr-amount-${i}`)?.value || 0);
        const item         = document.getElementById(`ocr-item-${i}`)?.value.trim() || '';
        const brand        = document.getElementById(`ocr-brand-${i}`)?.value.trim() || '';
        const date         = document.getElementById(`ocr-date-${i}`)?.value.trim() || '';
        const quantity     = document.getElementById(`ocr-quantity-${i}`)?.value ? Number(document.getElementById(`ocr-quantity-${i}`)?.value) : null;
        const note         = document.getElementById(`ocr-note-${i}`)?.value.trim() || '';

        try {
          await api(`/api/ocr/approve/${entry._id}`, {
            method: 'POST',
            body: { amount, item, brand, quantity, date, note, customerName, relationTag },
          });
          showToast(A('ocrApproveSuccess'));
          // Remove the card smoothly
          cardEl.style.opacity = '0.4';
          cardEl.style.pointerEvents = 'none';
          setTimeout(() => {
            cardEl.remove();
            // If no more items, show empty state
            if (!listEl.querySelector('.ocr-queue-item')) {
              listEl.innerHTML = `<div class="card text-center" style="padding:40px;color:#81c784">${A('ocrQueueEmpty')}</div>`;
            }
          }, 600);
        } catch (err) {
          showToast(err.message || S.error);
          btn.disabled = false;
          btn.textContent = A('ocrApproveBtn');
        }
      });

      // ── Reject button handler ───────────────────────────────────
      cardEl.querySelector('.ocr-reject-btn').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const confirmMsg = state.adminLang === 'en' ? 'Discard this diary entry photo?' : 'क्या आप यह फोटो हटाना चाहते हैं?';
        if (!confirm(confirmMsg)) return;
        btn.disabled = true;
        btn.textContent = A('loading');

        try {
          await api(`/api/ocr/reject/${entry._id}`, { method: 'POST' });
          showToast(A('ocrRejectSuccess'));
          cardEl.style.opacity = '0.4';
          cardEl.style.pointerEvents = 'none';
          setTimeout(() => {
            cardEl.remove();
            if (!listEl.querySelector('.ocr-queue-item')) {
              listEl.innerHTML = `<div class="card text-center" style="padding:40px;color:#81c784">${A('ocrQueueEmpty')}</div>`;
            }
          }, 600);
        } catch (err) {
          showToast(err.message || S.error);
          btn.disabled = false;
          btn.textContent = A('ocrRejectBtn');
        }
      });
    });

  } catch (err) {
    container.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
}

/**
 * Speak a Hindi string aloud using the Web Speech Synthesis API.
 * Calls onEnd callback when speech finishes speaking.
 */

function speakHindi(text, onEnd) {
  if (!window.speechSynthesis) {
    if (onEnd) onEnd();
    return;
  }
  try {
    window.speechSynthesis.cancel(); // stop any ongoing speech
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang  = 'hi-IN';
    utterance.rate  = 0.92;  // slightly slower pace for elderly shopkeepers
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    if (onEnd) {
      utterance.onend = () => onEnd();
      utterance.onerror = () => onEnd();
    }
    window.speechSynthesis.speak(utterance);
  } catch (_) {
    if (onEnd) onEnd();
  }
}

