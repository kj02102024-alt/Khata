/**
 * public/app.js
 *
 * Single-Page Application — no build tool, no framework.
 *
 * Architecture:
 *   • State lives in `state` object (token, user, current screen, form data).
 *   • `render()` decides which screen to show and calls the matching
 *     renderXxx() function to populate <main>.
 *   • All API calls go through `api(path, opts)` which auto-attaches
 *     the Bearer token and handles 401 → logout.
 *   • `navigate(screen, data)` updates state and calls render().
 *
 * Screens:
 *   login, home, search, newCustomer, customerDetail,
 *   addEntry, confirmEntry, today
 */

// ── Wait for DOM ready ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);

// ── State ─────────────────────────────────────────────────────────
const state = {
  screen:     'login',   // current screen name
  token:      null,
  user:       null,      // { shop, displayName, username }
  data:       {},        // screen-specific payload
};

// ── DOM references ─────────────────────────────────────────────────
let mainEl, headerTitleEl, headerSubEl, logoutBtn;

// ── Init ──────────────────────────────────────────────────────────
function init() {
  mainEl        = document.getElementById('main');
  headerTitleEl = document.getElementById('header-title');
  headerSubEl   = document.getElementById('header-sub');
  logoutBtn     = document.getElementById('btn-logout');

  logoutBtn.textContent = S.logout;
  logoutBtn.addEventListener('click', logout);

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
    } catch (_) { /* bad data — fall through to login */ }
  }

  render();
}

// ── Navigation ────────────────────────────────────────────────────
function navigate(screen, data = {}) {
  state.screen = screen;
  state.data   = data;
  render();
}

// ── Render dispatcher ─────────────────────────────────────────────
function render() {
  // Header
  headerTitleEl.textContent = S.appName;
  if (state.user) {
    headerSubEl.textContent = `${S.loggedInAs} ${state.user.displayName || state.user.username}`;
    logoutBtn.style.display = 'block';
  } else {
    headerSubEl.textContent = '';
    logoutBtn.style.display = 'none';
  }

  // Clear main
  mainEl.innerHTML = '';

  switch (state.screen) {
    case 'login':          return renderLogin();
    case 'home':           return renderHome();
    case 'search':         return renderSearch();
    case 'newCustomer':    return renderNewCustomer();
    case 'customerDetail': return renderCustomerDetail();
    case 'addEntry':       return renderAddEntry();
    case 'confirmEntry':   return renderConfirmEntry();
    case 'today':          return renderToday();
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
    state.user  = { shop: data.shop, displayName: data.displayName, username };

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
// SCREEN: Home
// ═══════════════════════════════════════════════════════════════════
function renderHome() {
  mainEl.innerHTML = `
    <div class="screen">
      <div class="home-grid">
        <button class="home-btn home-btn-new"  id="btn-new-entry">📝 ${S.newEntry}</button>
        <button class="home-btn home-btn-search" id="btn-search">🔍 ${S.findCustomer}</button>
        <button class="home-btn home-btn-today"  id="btn-today">📋 ${S.todayEntries}</button>
      </div>
    </div>
  `;

  document.getElementById('btn-new-entry').addEventListener('click', () => navigate('search', { mode: 'addEntry' }));
  document.getElementById('btn-search').addEventListener('click',    () => navigate('search', { mode: 'view' }));
  document.getElementById('btn-today').addEventListener('click',     () => navigate('today'));
}

// ═══════════════════════════════════════════════════════════════════
// SCREEN: Search customers
// ═══════════════════════════════════════════════════════════════════
function renderSearch() {
  const mode = state.data.mode || 'view'; // 'view' | 'addEntry'

  mainEl.innerHTML = `
    <div class="screen">
      <div class="page-title">🔍 ${S.findCustomer}</div>

      <div class="search-wrapper">
        <input id="search-input" class="search-input" type="search"
               placeholder="${S.searchPlaceholder}"
               autocomplete="off" />
        <span class="search-icon">🔍</span>
      </div>

      <div id="search-results"></div>

      <button class="btn btn-ghost mt-16" id="btn-new-customer">
        ${S.newCustomer}
      </button>

      <button class="btn btn-secondary mt-16" id="btn-back">${S.back}</button>
    </div>
  `;

  const input   = document.getElementById('search-input');
  const results = document.getElementById('search-results');

  let debounceTimer;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (!q) { results.innerHTML = `<p class="empty-state">${S.searchHint}</p>`; return; }
    results.innerHTML = `<div class="spinner"></div>`;
    debounceTimer = setTimeout(() => doSearch(q, results, mode), 300);
  });

  document.getElementById('btn-new-customer').addEventListener('click',
    () => navigate('newCustomer', { returnMode: mode }));
  document.getElementById('btn-back').addEventListener('click', () => navigate('home'));

  // Auto-focus so the keyboard pops up on mobile
  setTimeout(() => input.focus(), 100);
}

async function doSearch(q, container, mode) {
  try {
    const customers = await api(`/api/customers/search?q=${encodeURIComponent(q)}`);
    if (!customers.length) {
      container.innerHTML = `<p class="empty-state">${S.noResults}</p>`;
      return;
    }
    container.innerHTML = customers.map((c) => `
      <div class="customer-row" data-id="${c._id}" data-mode="${mode}">
        <div>
          <div class="customer-name">${esc(c.name)}</div>
          ${c.village ? `<div class="customer-village">📍 ${esc(c.village)}</div>` : ''}
        </div>
        <span style="font-size:1.4rem">›</span>
      </div>
    `).join('');

    container.querySelectorAll('.customer-row').forEach((row) => {
      row.addEventListener('click', () => {
        const id = row.dataset.id;
        if (row.dataset.mode === 'addEntry') {
          navigate('addEntry', { customerId: id, customerName: row.querySelector('.customer-name').textContent });
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
// SCREEN: Customer Detail
// ═══════════════════════════════════════════════════════════════════
function renderCustomerDetail() {
  mainEl.innerHTML = `<div class="spinner"></div>`;

  api(`/api/customers/${state.data.customerId}/detail`)
    .then((data) => showCustomerDetail(data))
    .catch((err) => {
      mainEl.innerHTML = `<p class="empty-state">${err.message}</p>`;
    });
}

function showCustomerDetail({ customer, entries, balance, totalSales, totalPayments }) {
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

      <!-- Balance — the most important number, displayed huge -->
      <div class="balance-box">
        <div class="balance-label">${S.balance}</div>
        <div class="balance-amount ${balanceClass}">
          ${balance === 0 ? S.balanceClear : `${S.rupee}${Math.abs(balance).toLocaleString('hi-IN')}`}
        </div>
        ${balance !== 0 ? `<div class="balance-label" style="margin-top:6px">${balanceLabel}</div>` : ''}
        <div class="balance-sub">
          ${S.totalSales} ${S.rupee}${totalSales.toLocaleString('hi-IN')} &nbsp;|&nbsp;
          ${S.totalPayments} ${S.rupee}${totalPayments.toLocaleString('hi-IN')}
        </div>
      </div>

      <!-- Action buttons -->
      <div class="action-row">
        <button class="btn btn-primary btn-sm" id="btn-add-sale">${S.addSale}</button>
        <button class="btn btn-ghost btn-sm" id="btn-add-payment">${S.addPayment}</button>
      </div>
      <button class="btn btn-danger btn-sm mb-16" id="btn-undo">${S.undoLast}</button>

      <!-- Entry list -->
      <div class="page-title" style="font-size:1.1rem">${S.entries}</div>

      ${entries.length === 0
        ? `<p class="empty-state">${S.noEntries}</p>`
        : entries.map((e) => renderEntryItem(e)).join('')
      }
    </div>
  `;

  document.getElementById('btn-back').addEventListener('click', () => navigate('home'));
  document.getElementById('btn-add-sale').addEventListener('click', () =>
    navigate('addEntry', { customerId: customer._id, customerName: customer.name, type: 'sale' }));
  document.getElementById('btn-add-payment').addEventListener('click', () =>
    navigate('addEntry', { customerId: customer._id, customerName: customer.name, type: 'payment' }));
  document.getElementById('btn-undo').addEventListener('click', () => confirmUndo(customer._id));
}

function renderEntryItem(e) {
  const typeLabel = e.type === 'sale' ? S.sale : S.payment;
  const shopLabel = e.shop === 'shop1' ? S.shop1 : S.shop2;
  const dateStr   = formatDate(e.date);
  return `
    <div class="entry-item ${e.type}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <span class="badge badge-${e.type}">${typeLabel}</span>
          <span class="badge badge-${e.shop}">${shopLabel}</span>
        </div>
        <div class="entry-amount">${S.rupee}${Number(e.amount).toLocaleString('hi-IN')}</div>
      </div>
      <div class="entry-meta">
        ${dateStr}
        ${e.item    ? ` · ${esc(e.item)}`                              : ''}
        ${e.meters  ? ` · ${e.meters} ${S.meters_unit}`                : ''}
        ${e.note    ? `<br><span style="color:#90a4ae">📝 ${esc(e.note)}</span>` : ''}
      </div>
    </div>
  `;
}

async function confirmUndo(customerId) {
  if (!confirm(S.undoConfirmMsg)) return;
  try {
    const res = await api('/api/entries/undo', { method: 'POST' });
    showToast(S.undoDone);
    navigate('customerDetail', { customerId });
  } catch (err) {
    showToast(err.message || S.noEntryToUndo);
  }
}

// ═══════════════════════════════════════════════════════════════════
// SCREEN: Add Entry form
// ═══════════════════════════════════════════════════════════════════
function renderAddEntry() {
  const { customerId, customerName, type: preType } = state.data;
  const isSale = (preType || 'sale') === 'sale';

  mainEl.innerHTML = `
    <div class="screen">
      <div class="page-title">${isSale ? S.addSaleTitle : S.addPaymentTitle}</div>
      <div class="card mb-16" style="font-size:1.1rem">👤 ${esc(customerName || '')}</div>

      <!-- Type selector (shown only when arriving from search without preType) -->
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

      <div id="ae-error" style="color:#ef5350;font-size:1rem;margin-bottom:12px;display:none"></div>

      <div class="gap-12">
        <button class="btn btn-primary" id="btn-next">${S.next}</button>
        <button class="btn btn-secondary" id="btn-back">${S.back}</button>
      </div>
    </div>
  `;

  // Set today's date as default
  document.getElementById('inp-date').value = todayISO();

  // Toggle sale-specific fields when type changes
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
    amount:  Math.round(Number(amount)),
    item,
    meters:  meters ? Number(meters) : null,
    date,
    note,
  });
}

// ═══════════════════════════════════════════════════════════════════
// SCREEN: Confirm Entry
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
// SCREEN: Today's Entries
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

      // Tally totals
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
                ${e.item    ? ` · ${esc(e.item)}`                               : ''}
                ${e.meters  ? ` · ${e.meters} ${S.meters_unit}`                  : ''}
                ${e.note    ? `<br><span style="color:#90a4ae">📝 ${esc(e.note)}</span>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      `;

      document.getElementById('btn-back').addEventListener('click', () => navigate('home'));
    })
    .catch((err) => {
      mainEl.innerHTML = `<p class="empty-state">${err.message}</p>`;
    });
}

// ═══════════════════════════════════════════════════════════════════
// API helper
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
// Utilities
// ═══════════════════════════════════════════════════════════════════

/** Escape HTML to prevent XSS when inserting user-supplied text. */
function esc(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Format an ISO date string to DD/MM/YYYY in IST. */
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('hi-IN', {
    day:   '2-digit',
    month: '2-digit',
    year:  'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

/** Today's date as YYYY-MM-DD (for <input type="date"> default). */
function todayISO() {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const y   = ist.getFullYear();
  const m   = String(ist.getMonth() + 1).padStart(2, '0');
  const d   = String(ist.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Show a temporary toast message at the bottom of the screen. */
function showToast(msg, duration = 3000) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}
