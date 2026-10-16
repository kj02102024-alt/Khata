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
  adminTab:   'overview', // 'overview' | 'audit' | 'export'
};

// ── DOM references ─────────────────────────────────────────────────
let mainEl, headerTitleEl, headerSubEl, logoutBtn, adminNavBtn;

// ── Init ──────────────────────────────────────────────────────────
function init() {
  mainEl        = document.getElementById('main');
  headerTitleEl = document.getElementById('header-title');
  headerSubEl   = document.getElementById('header-sub');
  logoutBtn     = document.getElementById('btn-logout');
  adminNavBtn   = document.getElementById('btn-admin-nav');

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
// SCREEN: Home (Shopkeeper Mode: Minimal, Big Buttons, High Contrast)
// ═══════════════════════════════════════════════════════════════════
function renderHome() {
  const isAdmin = state.user?.role === 'admin';

  mainEl.innerHTML = `
    <div class="screen">
      <div class="home-grid">
        <button class="home-btn home-btn-new" id="btn-new-entry">📝 ${S.newEntry}</button>
        <button class="home-btn home-btn-search" id="btn-search">🔍 ${S.findCustomer}</button>
        <button class="home-btn home-btn-today" id="btn-today">📋 ${S.todayEntries}</button>
        <button class="home-btn" id="btn-today-payments" style="background:#00796b;color:#fff;">💰 ${S.todayPayments}</button>

        ${isAdmin ? `
        <button class="home-btn" id="btn-home-admin" style="background:#512da8;color:#fff;margin-top:8px;">
          ⚙️ ${S.adminPanel}
        </button>` : ''}
      </div>
    </div>
  `;

  document.getElementById('btn-new-entry').addEventListener('click', () => navigate('search', { mode: 'addEntry' }));
  document.getElementById('btn-search').addEventListener('click',    () => navigate('search', { mode: 'view' }));
  document.getElementById('btn-today').addEventListener('click',     () => navigate('today'));
  document.getElementById('btn-today-payments').addEventListener('click', () => navigate('todayPayments'));

  if (isAdmin) {
    document.getElementById('btn-home-admin').addEventListener('click', () => navigate('admin'));
  }
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

      <!-- Filter Pills: All vs Pending Dues -->
      <div class="filter-pills">
        <button class="pill-btn ${state.searchFilter === 'all' ? 'active' : ''}" id="filter-all">
          ${S.allFilter}
        </button>
        <button class="pill-btn ${state.searchFilter === 'dues' ? 'active' : ''}" id="filter-dues">
          ${S.onlyDuesFilter}
        </button>
      </div>

      <div id="search-results"></div>

      <button class="btn btn-ghost mt-16" id="btn-new-customer">
        ${S.newCustomer}
      </button>

      <button class="btn btn-secondary mt-16" id="btn-back">${S.back}</button>
    </div>
  `;

  const input      = document.getElementById('search-input');
  const results    = document.getElementById('search-results');
  const filterAll  = document.getElementById('filter-all');
  const filterDues = document.getElementById('filter-dues');
  const voiceBtn   = document.getElementById('btn-voice-search');
  const voiceStatus = document.getElementById('voice-search-status');

  // Trigger search function
  const triggerSearch = () => {
    const q = input.value.trim();
    results.innerHTML = `<div class="spinner"></div>`;
    doSearch(q, results, mode, state.searchFilter === 'dues');
  };

  let debounceTimer;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(triggerSearch, 300);
  });

  filterAll.addEventListener('click', () => {
    state.searchFilter = 'all';
    filterAll.classList.add('active');
    filterDues.classList.remove('active');
    triggerSearch();
  });

  filterDues.addEventListener('click', () => {
    state.searchFilter = 'dues';
    filterDues.classList.add('active');
    filterAll.classList.remove('active');
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

async function doSearch(q, container, mode, pendingOnly) {
  try {
    const url = `/api/customers/search?q=${encodeURIComponent(q)}&pendingOnly=${pendingOnly ? 'true' : 'false'}`;
    const customers = await api(url);

    if (!customers.length) {
      container.innerHTML = `<p class="empty-state">${S.noResults}</p>`;
      return;
    }

    container.innerHTML = customers.map((c) => {
      let balanceBadge = '';
      if (c.balance > 0) {
        balanceBadge = `<span class="badge badge-unpaid">${S.dues} ₹${c.balance.toLocaleString('hi-IN')}</span>`;
      } else if (c.balance < 0) {
        balanceBadge = `<span class="badge badge-advance">${S.advance} ₹${Math.abs(c.balance).toLocaleString('hi-IN')}</span>`;
      } else {
        balanceBadge = `<span class="badge badge-paid">${S.balanceClear}</span>`;
      }

      return `
        <div class="customer-row" data-id="${c._id}" data-mode="${mode}">
          <div>
            <div class="customer-name">${esc(c.name)}</div>
            <div class="customer-village">
              ${c.village ? `📍 ${esc(c.village)}` : ''}
              ${c.phone ? ` · 📞 ${esc(c.phone)}` : ''}
            </div>
            <div style="margin-top:6px">${balanceBadge}</div>
          </div>
          <span style="font-size:1.6rem;color:var(--text-muted)">›</span>
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
        <input id="nc-name" type="text" placeholder="जैसे: रामलाल शर्मा"
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
  const name    = document.getElementById('nc-name').value.trim();
  const village = document.getElementById('nc-village').value.trim();
  const phone   = document.getElementById('nc-phone').value.trim();
  const errEl   = document.getElementById('nc-error');
  const btn     = document.getElementById('btn-create-customer');

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
      body:   { name, village, phone },
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

      <!-- Active / Pending Sales (बकाया बिल) -->
      <div class="page-title" style="font-size:1.25rem;margin-bottom:12px;color:#ffa726">
        ⏳ ${S.pendingSection} (${pendingSales.length})
      </div>

      ${pendingSales.length === 0
        ? `<div class="card text-center" style="color:#81c784;font-size:1.1rem;padding:20px">
             ✓ कोई बकाया बिल नहीं है!
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

  return `
    <div class="${itemClass}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          ${statusBadge}
          <span class="badge badge-${e.shop}">${shopLabel}</span>
        </div>
        <div class="entry-amount">${S.rupee}${Number(e.amount).toLocaleString('hi-IN')}</div>
      </div>

      <div class="entry-meta">
        ${dateStr}
        ${e.item   ? ` · <strong>${esc(e.item)}</strong>` : ''}
        ${e.meters ? ` · ${e.meters} ${S.meters_unit}`   : ''}
        ${e.note   ? `<br><span style="color:#b0bec5">📝 ${esc(e.note)}</span>` : ''}
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
      showToast('बकाया पहले से शून्य है!');
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
function renderAddEntry() {
  const { customerId, customerName, type: preType } = state.data;
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

      <div class="form-group">
        <label>${S.labelAmount}</label>
        <input id="inp-amount" type="number" inputmode="numeric"
               placeholder="${S.amountPlaceholder}" min="1" />
      </div>

      <div id="sale-fields">
        <div class="form-group">
          <label>${S.labelItem}</label>
          <input id="inp-item" type="text" placeholder="${S.itemPlaceholder}" />
        </div>
        <div class="form-group">
          <label>${S.labelMeters}</label>
          <input id="inp-meters" type="number" inputmode="decimal"
                 placeholder="${S.metersPlaceholder}" min="0" step="0.25" />
        </div>
      </div>

      <div class="form-group">
        <label>${S.labelDate}</label>
        <input id="inp-date" type="date" />
      </div>

      <div class="form-group">
        <label>${S.labelNote}</label>
        <textarea id="inp-note" placeholder="${S.notePlaceholder}"></textarea>
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

  // Voice recognition parser for Add Entry
  setupVoiceRecognition({
    buttonEl: document.getElementById('btn-voice-entry'),
    statusEl: document.getElementById('voice-entry-status'),
    onResult: (transcript) => {
      parseVoiceIntoEntryFields(transcript);
    },
  });

  // Photo receipt handler
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

  const typeEl = document.getElementById('inp-type');
  if (typeEl.tagName === 'SELECT') {
    typeEl.addEventListener('change', toggleSaleFields);
    toggleSaleFields();
  }

  document.getElementById('btn-next').addEventListener('click', prepareConfirmation);
  document.getElementById('btn-back').addEventListener('click', () =>
    navigate('customerDetail', { customerId }));
}

function toggleSaleFields() {
  const type = document.getElementById('inp-type').value;
  document.getElementById('sale-fields').style.display = type === 'sale' ? '' : 'none';
}

function parseVoiceIntoEntryFields(transcript) {
  showToast(`${S.voiceSuccess}: "${transcript}"`);

  // Extract amount (numbers or words)
  const numbers = transcript.match(/\d+/g);
  if (numbers && numbers.length > 0) {
    document.getElementById('inp-amount').value = numbers[0];
  }

  // Extract meters if said (e.g. "5 मीटर" or "5.5 meter")
  const meterMatch = transcript.match(/(\d+(\.\d+)?)\s*(मीटर|meter)/i);
  if (meterMatch) {
    document.getElementById('inp-meters').value = meterMatch[1];
  }

  // Set note or item
  const itemInput = document.getElementById('inp-item');
  if (itemInput && !itemInput.value) {
    // Clean text by stripping known number phrases
    const cleanItem = transcript
      .replace(/\d+(\.\d+)?\s*(मीटर|meter|रुपये|rupaye|rupee)?/gi, '')
      .trim();
    if (cleanItem) itemInput.value = cleanItem;
  }
}

function prepareConfirmation() {
  const errEl  = document.getElementById('ae-error');
  const type   = document.getElementById('inp-type').value;
  const amount = document.getElementById('inp-amount').value.trim();
  const item   = document.getElementById('inp-item')?.value.trim()   || '';
  const meters = document.getElementById('inp-meters')?.value.trim() || '';
  const date   = document.getElementById('inp-date').value;
  const note   = document.getElementById('inp-note').value.trim();

  errEl.style.display = 'none';

  if (!amount || isNaN(amount) || Number(amount) < 1) {
    errEl.textContent   = 'राशि सही नहीं है (कम से कम ₹1)';
    errEl.style.display = 'block';
    return;
  }
  if (!date) {
    errEl.textContent   = 'दिनांक जरूरी है';
    errEl.style.display = 'block';
    return;
  }

  navigate('confirmEntry', {
    ...state.data,
    type,
    amount: Math.round(Number(amount)),
    item,
    meters: meters ? Number(meters) : null,
    date,
    note,
    photo:  state.activePhoto || '',
  });
}

// ═══════════════════════════════════════════════════════════════════
// SCREEN: Confirm Entry (Sales Confirmation)
// ═══════════════════════════════════════════════════════════════════
function renderConfirmEntry() {
  const d = state.data;
  const isSale = d.type === 'sale';

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
        ${d.item ? `
        <div class="confirm-row">
          <span class="confirm-key">${S.labelItem}</span>
          <span class="confirm-value">${esc(d.item)}</span>
        </div>` : ''}
        ${d.meters ? `
        <div class="confirm-row">
          <span class="confirm-key">${S.labelMeters}</span>
          <span class="confirm-value">${d.meters} ${S.meters_unit}</span>
        </div>` : ''}
        <div class="confirm-row">
          <span class="confirm-key">${S.date_label}</span>
          <span class="confirm-value">${formatDate(d.date)}</span>
        </div>
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
        customerId: d.customerId,
        type:       d.type,
        amount:     d.amount,
        item:       d.item   || '',
        meters:     d.meters || null,
        date:       d.date,
        note:       d.note   || '',
        photo:      d.photo  || '',
      },
    });

    showToast(S.savedSuccess);
    navigate('customerDetail', { customerId: d.customerId });
  } catch (err) {
    showToast(err.message || S.error);
    btn.disabled    = false;
    btn.textContent = S.confirmSave;
  }
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
                ${e.item   ? ` · ${esc(e.item)}` : ''}
                ${e.meters ? ` · ${e.meters} ${S.meters_unit}` : ''}
                ${e.note   ? `<br><span style="color:#90a4ae">📝 ${esc(e.note)}</span>` : ''}
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
    showToast('केवल एडमिन को अनुमति है');
    return navigate('home');
  }

  mainEl.innerHTML = `<div class="spinner"></div>`;

  try {
    const overview = await api('/api/admin/overview');

    mainEl.innerHTML = `
      <div class="screen">
        <button class="btn btn-secondary btn-sm mb-16" id="btn-admin-back">${S.back}</button>
        <div class="page-title">${S.adminOverviewTitle}</div>

        <!-- Admin Tab Switcher -->
        <div class="filter-pills" style="margin-bottom:20px">
          <button class="pill-btn ${state.adminTab === 'overview' ? 'active' : ''}" id="tab-overview">
            📊 सारांश
          </button>
          <button class="pill-btn ${state.adminTab === 'audit' ? 'active' : ''}" id="tab-audit">
            📋 ऑडिट लॉग
          </button>
          <button class="pill-btn ${state.adminTab === 'export' ? 'active' : ''}" id="tab-export">
            📥 बैकअप / एक्सपोर्ट
          </button>
        </div>

        <div id="admin-tab-content"></div>
      </div>
    `;

    document.getElementById('btn-admin-back').addEventListener('click', () => navigate('home'));

    const tabOverview = document.getElementById('tab-overview');
    const tabAudit    = document.getElementById('tab-audit');
    const tabExport   = document.getElementById('tab-export');

    tabOverview.addEventListener('click', () => {
      state.adminTab = 'overview';
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
      <div style="font-size:1rem;color:#ce93d8;text-transform:uppercase">${S.adminTotalDues}</div>
      <div style="font-size:2.8rem;font-weight:900;color:#fff;margin-top:6px">
        ${S.rupee}${r.grand.balance.toLocaleString('hi-IN')}
      </div>
      <div style="font-size:0.95rem;color:#e1bee7;margin-top:6px">
        कुल बिक्री: ₹${r.grand.sales.toLocaleString('hi-IN')} &nbsp;|&nbsp; कुल जमा: ₹${r.grand.payments.toLocaleString('hi-IN')}
      </div>
    </div>

    <!-- Cross-Shop Comparison Grid -->
    <div class="admin-stats-grid">
      <div class="admin-stat-card" style="border-top:4px solid #1565c0">
        <div class="admin-stat-title">${S.adminShop1Net}</div>
        <div class="admin-stat-num" style="color:#90caf9">₹${r.shop1.balance.toLocaleString('hi-IN')}</div>
        <div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px">
          बिक्री: ₹${r.shop1.sales.toLocaleString('hi-IN')}<br>
          जमा: ₹${r.shop1.payments.toLocaleString('hi-IN')}
        </div>
      </div>

      <div class="admin-stat-card" style="border-top:4px solid #6a1b9a">
        <div class="admin-stat-title">${S.adminShop2Net}</div>
        <div class="admin-stat-num" style="color:#ce93d8">₹${r.shop2.balance.toLocaleString('hi-IN')}</div>
        <div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px">
          बिक्री: ₹${r.shop2.sales.toLocaleString('hi-IN')}<br>
          जमा: ₹${r.shop2.payments.toLocaleString('hi-IN')}
        </div>
      </div>

      <div class="admin-stat-card">
        <div class="admin-stat-title">${S.adminTotalCustomers}</div>
        <div class="admin-stat-num">${r.totalCustomers}</div>
      </div>

      <div class="admin-stat-card">
        <div class="admin-stat-title">${S.adminDeletedCount}</div>
        <div class="admin-stat-num" style="color:#ef5350">${r.deletedEntriesCount}</div>
      </div>
    </div>
  `;
}

async function renderAdminAuditTab(container) {
  container.innerHTML = `<div class="spinner"></div>`;

  try {
    const entries = await api('/api/admin/audit-log');

    container.innerHTML = `
      <div class="page-title" style="font-size:1.2rem;margin-bottom:12px">${S.adminAuditTitle}</div>
      ${entries.length === 0
        ? `<p class="empty-state">कोई ऑडिट रिकॉर्ड नहीं है</p>`
        : entries.map((e) => `
          <div class="audit-card ${e.deleted ? 'is-deleted' : ''}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <div>
                <span class="badge badge-${e.type}">${e.type === 'sale' ? S.sale : S.payment}</span>
                <span class="badge badge-${e.shop}">${e.shop === 'shop1' ? S.shop1 : S.shop2}</span>
                ${e.deleted ? `<span class="badge" style="background:#b71c1c;color:#fff">रद्द (DELETED)</span>` : ''}
              </div>
              <div class="audit-amount" style="font-size:1.4rem;font-weight:900">
                ${S.rupee}${Number(e.amount).toLocaleString('hi-IN')}
              </div>
            </div>

            <div style="margin-top:8px;font-size:0.95rem">
              <strong>${esc(e.customer?.name || '')}</strong>
              ${e.customer?.village ? ` · 📍 ${esc(e.customer.village)}` : ''}
            </div>

            <div style="font-size:0.8rem;color:var(--text-muted);margin-top:6px">
              बनाया: ${formatDate(e.createdAt)} (${esc(e.createdBy?.displayName || e.createdBy?.username || '')})
              ${e.deleted ? `<br><span style="color:#ef5350">रद्द दिनांक: ${formatDate(e.deletedAt)} (${esc(e.deletedBy?.displayName || e.deletedBy?.username || '')})</span>` : ''}
            </div>

            ${e.deleted ? `
              <button class="btn btn-secondary btn-sm mt-16 btn-restore" data-id="${e._id}" style="padding:8px 12px;font-size:0.9rem">
                ${S.adminRestore}
              </button>
            ` : ''}

            ${e.photo ? `
              <div class="receipt-thumbnail-badge" data-photo="${esc(e.photo)}" style="margin-top:8px">
                📷 ${S.viewPhoto}
              </div>
            ` : ''}
          </div>
        `).join('')
      }
    `;

    // Restore override button handlers
    container.querySelectorAll('.btn-restore').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!confirm('क्या आप इस हिसाब को वापस चालू (Restore) करना चाहते हैं?')) return;
        try {
          btn.disabled = true;
          await api(`/api/admin/restore-entry/${id}`, { method: 'POST' });
          showToast(S.adminRestoreSuccess);
          await renderAdminAuditTab(container);
        } catch (err) {
          showToast(err.message || S.error);
          btn.disabled = false;
        }
      });
    });

    attachPhotoClickEvents();
  } catch (err) {
    container.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
}

function renderAdminExportTab(container) {
  container.innerHTML = `
    <div class="card mb-16" style="padding:24px">
      <div style="font-size:1.3rem;font-weight:900;margin-bottom:8px">📥 डेटा बैकअप और डाउनलोड</div>
      <p style="color:var(--text-muted);margin-bottom:20px;font-size:0.95rem">
        यहाँ से आप अपनी दोनों दुकानों का पूरा हिसाब और ग्राहकों का डेटा कंप्यूटर पर सुरक्षित रख सकते हैं।
      </p>

      <div class="gap-12">
        <a href="/api/admin/export?format=csv" class="btn btn-primary" download style="text-decoration:none;display:flex;align-items:center;justify-content:center;">
          ${S.adminExportCsv}
        </a>
        <a href="/api/admin/export?format=json" class="btn btn-secondary" download style="text-decoration:none;display:flex;align-items:center;justify-content:center;">
          ${S.adminExportJson}
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
