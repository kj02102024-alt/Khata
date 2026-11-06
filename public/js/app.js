/**
 * Khata SPA v2 — Main App Controller
 * Covers: redesigned login, हिसाब लिखें entry screen, search, admin portal.
 */
(function (g) {
  const { api, getUser, setSession, clearSession, inr, toast, escapeHtml, playChime } = g.KhataAPI;

  // ─── App State ───────────────────────────────────────────────────────────────
  const state = {
    user: null,
    lang: localStorage.getItem('khata_lang') || 'hi',
    adminView: 'overview',
    _searchT: null,
  };

  // ─── i18n ────────────────────────────────────────────────────────────────────
  const i18n = {
    en: {
      overview: 'Overview', review: 'Diary Review', ledger: 'Ledger',
      audit: 'Audit & Trash', logout: 'Log out', outstanding: 'Total Outstanding',
      collections: 'Today\'s Collections', activeCust: 'Active Customers',
      pendingPhotos: 'Diary Pending', approvePost: 'Approve & Post',
      reject: 'Reject', noPending: 'No diary pages waiting.',
      zoomIn: 'Zoom +', zoomOut: 'Zoom −', resetView: 'Reset',
      customer: 'Customer', item: 'Item', brand: 'Brand', meters: 'Meters',
      qty: 'Qty', rate: 'Rate', amount: 'Amount', notes: 'Notes',
      shop: 'Shop', date: 'Date', actions: 'Actions', softDelete: 'Delete',
      restore: 'Restore', type: 'Type', status: 'Status', welcome: 'Khata Enterprise Admin',
      honorific: 'Honorific', diaryNo: 'Diary No.', identifierNote: 'Identifier',
      time: 'Time', paymentMode: 'Payment Mode', enteredVia: 'Entered Via',
      noData: 'No data yet.', todayCredit: 'Today\'s Credit',
      customers: 'Customers', aging: 'Aging Analysis',
      villageDistribution: 'Village Distribution', trendChart: 'Credit vs Collections (7 Days)',
      exportCsv: 'Export CSV', exportPdf: 'Print / PDF', saveDraft: 'Save Draft',
      rotate: 'Rotate 90°', contrast: 'Contrast', brightness: 'Brightness',
      recycleBin: 'Recycle Bin', allShops: 'All Shops', allTypes: 'All Types',
      allStatuses: 'All Statuses', drilldown: 'View Ledger', recalcBalance: 'Recalculate Balance',
      searchPlaceholder: 'Search name, village, mobile, item, amount...',
      page: 'Page', of: 'of', entries: 'entries',
    },
    hi: {
      overview: 'सारांश (Dashboard)', review: 'डायरी जाँच (Review)', ledger: 'खाता बही (Ledger)',
      audit: 'ऑडिट व कचरा (Audit)', logout: 'बाहर निकलें (Logout)', outstanding: 'कुल बकाया',
      collections: 'आज की वसूली', activeCust: 'सक्रिय ग्राहक',
      pendingPhotos: 'लंबित डायरी पन्ने', approvePost: 'मंज़ूर करें और दर्ज करें',
      reject: 'रद्द करें', noPending: 'कोई डायरी पेज जाँच के लिए प्रतीक्षारत नहीं है।',
      zoomIn: 'बड़ा (+)', zoomOut: 'छोटा (−)', resetView: 'रीसेट',
      customer: 'ग्राहक', item: 'सामान', brand: 'ब्रांड', meters: 'मीटर',
      qty: 'नग/मात्रा', rate: 'रेट (भाव)', amount: 'रकम (रुपये)', notes: 'टिप्पणी / विवरण',
      shop: 'दुकान', date: 'तारीख', actions: 'कार्य', softDelete: 'हटाएँ (Trash)',
      restore: 'वापस लाएँ', type: 'प्रकार', status: 'स्थिति', welcome: 'खता प्रो एडमिन',
      honorific: 'आदरसूचक', diaryNo: 'डायरी नं.', identifierNote: 'पहचान (उपनाम)',
      time: 'समय', paymentMode: 'भुगतान माध्यम', enteredVia: 'दर्ज करने का माध्यम',
      noData: 'अभी कोई डेटा उपलब्ध नहीं है।', todayCredit: 'आज का उधार',
      customers: 'ग्राहक सूची (Customers)', aging: 'उधारी आयु विश्लेषण (Aging)',
      villageDistribution: 'गाँव अनुसार उधारी', trendChart: 'उधार बनाम वसूली (7 दिन)',
      exportCsv: 'CSV डाउनलोड', exportPdf: 'प्रिंट / PDF', saveDraft: 'ड्राफ्ट सहेजें',
      rotate: 'घुमाएँ 90°', contrast: 'कंट्रास्ट', brightness: 'रोशनी',
      recycleBin: 'कचरापेटी (Recycle Bin)', allShops: 'सभी दुकानें', allTypes: 'सभी प्रकार',
      allStatuses: 'सभी स्थितियाँ', drilldown: 'खाता देखें', recalcBalance: 'बैलेंस पुनः जांचें',
      searchPlaceholder: 'नाम, गाँव, मोबाइल, डायरी नं. या सामान से खोजें...',
      page: 'पेज', of: 'का', entries: 'रिकॉर्ड्स',
    },
  };
  function t(key) { return (i18n[state.lang] && i18n[state.lang][key]) || i18n.en[key] || key; }

  // ─── Bootstrap ────────────────────────────────────────────────────────────────
  async function boot() {
    // Ensure toast root exists
    if (!document.getElementById('toast-root')) {
      const tr = document.createElement('div');
      tr.id = 'toast-root';
      document.body.appendChild(tr);
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    // Instant & persistent session restore from localStorage (for seamless offline & no auto-logout)
    const cachedUser = getUser();
    if (cachedUser) {
      state.user = cachedUser;
      route();
    }

    try {
      const { user } = await api('/auth/me');
      state.user = user;
      setSession(null, user);
      if (!cachedUser || cachedUser.id !== user.id || cachedUser.role !== user.role) {
        route();
      }
    } catch (err) {
      // Only log out if server explicitly returned 401 Unauthorized
      if (err.status === 401) {
        clearSession();
        state.user = null;
        renderLogin();
      } else if (!cachedUser) {
        // If offline and no cached user, show login
        renderLogin();
      }
      // If offline/network glitch and cached user exists, stay logged in in Shop mode
    }
  }

  function route() {
    if (!state.user) return renderLogin();
    if (state.user.role === 'admin') return renderAdmin();
    return renderShop();
  }

  // ─── LOGIN ────────────────────────────────────────────────────────────────────
  // ─── LOGIN ────────────────────────────────────────────────────────────────────
  function renderLogin() {
    const app = document.getElementById('app');
    const remembered = localStorage.getItem('khata_remembered_user') || '';

    app.innerHTML = `
      <div class="login-shell">
        <div class="login-bg-pattern"></div>
        <div class="login-card">
          <div class="login-brand">
            <svg class="brand-ledger" viewBox="0 0 48 48" fill="none" aria-hidden="true">
              <rect x="6" y="4" width="28" height="40" rx="4" fill="#0f3d2e" opacity=".9"/>
              <rect x="10" y="4" width="28" height="40" rx="4" fill="#1a5c45" opacity=".8"/>
              <rect x="14" y="4" width="28" height="40" rx="4" fill="#2d7a5c"/>
              <line x1="20" y1="16" x2="36" y2="16" stroke="#f4efe4" stroke-width="2" stroke-linecap="round"/>
              <line x1="20" y1="22" x2="36" y2="22" stroke="#f4efe4" stroke-width="2" stroke-linecap="round"/>
              <line x1="20" y1="28" x2="30" y2="28" stroke="#f4efe4" stroke-width="2" stroke-linecap="round" opacity=".6"/>
            </svg>
            <h1 class="login-wordmark">खाता (Khata)</h1>
            <p class="login-tagline">दुकान का आसान और आधुनिक हिसाब</p>
          </div>

          <form class="normal-login-form" id="login-form" novalidate>
            <div id="login-err" class="login-err" role="alert"></div>

            <div class="quick-pick-row">
              <span class="quick-pick-label">जल्दी चुनें:</span>
              <button type="button" class="quick-pick-btn" data-user="shop1">दुकान 1</button>
              <button type="button" class="quick-pick-btn" data-user="shop2">दुकान 2</button>
              <button type="button" class="quick-pick-btn" data-user="admin">एडमिन</button>
            </div>

            <div class="field">
              <label for="login-username">उपयोगकर्ता नाम / दुकान (Username)</label>
              <input id="login-username" name="username" type="text" autocomplete="username"
                     required placeholder="उदा. shop1, shop2 या admin" value="${escapeHtml(remembered)}" />
            </div>

            <div class="field">
              <label for="login-password">पासवर्ड या पिन (Password / PIN)</label>
              <div class="pass-wrap">
                <input id="login-password" name="password" type="password" autocomplete="current-password"
                       required placeholder="अपना पासवर्ड या पिन डालें" />
                <button type="button" class="eye-btn" id="login-eye-toggle" aria-label="पासवर्ड दिखाएँ" title="पासवर्ड देखें">👁</button>
              </div>
            </div>

            <div class="login-options">
              <label class="remember-label">
                <input type="checkbox" id="login-remember" ${remembered ? 'checked' : ''} />
                <span>मुझे याद रखें (Remember me)</span>
              </label>
            </div>

            <button class="btn-login-submit" type="submit" id="login-btn">
              <span id="login-btn-text">लॉगिन करें (Sign In) →</span>
            </button>

            <div class="login-footer-actions">
              <button type="button" class="btn-reset-creds" id="btn-reset-creds">
                🔄 डिफ़ॉल्ट पासवर्ड रीसेट करें (Reset Passwords)
              </button>
            </div>

            <p class="login-footer-hint">दुकानदार 1: <strong>1234</strong> · दुकान 2: <strong>5678</strong> · एडमिन: <strong>khata123</strong></p>
          </form>
        </div>
      </div>`;

    // Quick select buttons
    document.querySelectorAll('.quick-pick-btn').forEach((btn) => {
      btn.onclick = () => {
        const u = btn.dataset.user;
        const uInput = document.getElementById('login-username');
        const pInput = document.getElementById('login-password');
        if (uInput) {
          uInput.value = u;
          if (pInput) pInput.focus();
        }
      };
    });

    // Eye toggle
    const eyeBtn = document.getElementById('login-eye-toggle');
    if (eyeBtn) {
      eyeBtn.onclick = () => {
        const pInput = document.getElementById('login-password');
        if (pInput) {
          pInput.type = pInput.type === 'password' ? 'text' : 'password';
        }
      };
    }

    // Reset credentials button
    const resetBtn = document.getElementById('btn-reset-creds');
    if (resetBtn) {
      resetBtn.onclick = async () => {
        const errEl = document.getElementById('login-err');
        errEl.textContent = '';
        resetBtn.disabled = true;
        resetBtn.textContent = 'रीसेट हो रहा है…';
        try {
          const res = await api('/auth/quick-reset');
          toast('✅ पासवर्ड रीसेट हो गए: shop1 (1234), shop2 (5678), admin (khata123)', { ms: 6000 });
          resetBtn.textContent = '✓ डिफ़ॉल्ट पासवर्ड सेट हो गए';
          setTimeout(() => {
            resetBtn.disabled = false;
            resetBtn.textContent = '🔄 डिफ़ॉल्ट पासवर्ड रीसेट करें (Reset Passwords)';
          }, 4000);
        } catch (e) {
          errEl.textContent = 'रीसेट नहीं हुआ: ' + (e.message || 'त्रुटि');
          resetBtn.disabled = false;
          resetBtn.textContent = '🔄 डिफ़ॉल्ट पासवर्ड रीसेट करें (Reset Passwords)';
        }
      };
    }

    // Submit handler
    const form = document.getElementById('login-form');
    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        const errEl = document.getElementById('login-err');
        const btn = document.getElementById('login-btn');
        const btnText = document.getElementById('login-btn-text');

        errEl.textContent = '';
        if (!username || !password) {
          errEl.textContent = 'कृपया नाम और पासवर्ड/पिन दोनों दर्ज करें';
          return;
        }

        btn.disabled = true;
        btnText.textContent = 'जाँच हो रही है…';

        try {
          const { user } = await api('/auth/login', {
            method: 'POST',
            body: { username, password },
          });

          // Save persistent user session
          setSession(null, user);

          if (document.getElementById('login-remember')?.checked) {
            localStorage.setItem('khata_remembered_user', username);
          } else {
            localStorage.removeItem('khata_remembered_user');
          }

          state.user = user;
          route();
        } catch (err) {
          errEl.textContent = err.data?.errorHi || err.message || 'लॉगिन असफल रहा';
          btn.disabled = false;
          btnText.textContent = 'लॉगिन करें (Sign In) →';
        }
      };
    }
  }

  async function logout() {
    clearSession();
    state.user = null;
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* */ }
    renderLogin();
  }

  // ─── SHOP (PARENT) PORTAL ─────────────────────────────────────────────────────
  function renderShop() {
    // Delegate to KhataParent if available
    if (g.KhataParent) {
      const app = document.getElementById('app');
      app.innerHTML = '<div id="parent-root"></div>';
      g.KhataParent.mount(document.getElementById('parent-root'));
    }
  }

  // ─── ADMIN PORTAL ─────────────────────────────────────────────────────────────
  function renderAdmin() {
    const app = document.getElementById('app');
    const isHi = state.lang === 'hi';

    app.innerHTML = `
      <div class="a-shell" data-lang="${state.lang}">
        <div class="a-sidebar-overlay" id="a-sidebar-overlay"></div>
        <aside class="a-sidebar" id="a-sidebar" role="navigation" aria-label="Admin Navigation">
          <div class="a-brand">
            <div class="a-brand-icon">📒</div>
            <div>
              <div class="a-brand-title">Khata Pro</div>
              <div class="a-brand-tag">${isHi ? 'एडमिन पोर्टल' : 'Enterprise Admin'}</div>
            </div>
          </div>

          <div class="a-nav-section">${isHi ? 'मुख्य मेनू' : 'MAIN MENU'}</div>
          <nav class="a-nav">
            <button class="a-nav-item ${state.adminView === 'overview' ? 'active' : ''}" data-view="overview">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
              <span>${t('overview')}</span>
            </button>
            <button class="a-nav-item ${state.adminView === 'review' ? 'active' : ''}" data-view="review">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              <span>${t('review')}</span>
              <span class="a-nav-badge" id="a-pending-badge" style="display:none">0</span>
            </button>
            <button class="a-nav-item ${state.adminView === 'ledger' ? 'active' : ''}" data-view="ledger">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              <span>${t('ledger')}</span>
            </button>
            <button class="a-nav-item ${state.adminView === 'customers' ? 'active' : ''}" data-view="customers">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <span>${t('customers')}</span>
            </button>
            <button class="a-nav-item ${state.adminView === 'audit' ? 'active' : ''}" data-view="audit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <span>${t('audit')}</span>
            </button>
          </nav>

          <div class="a-sidebar-footer">
            <div class="a-lang-pills">
              <button type="button" class="a-lang-btn ${state.lang === 'hi' ? 'active' : ''}" data-lang="hi">हिन्दी</button>
              <button type="button" class="a-lang-btn ${state.lang === 'en' ? 'active' : ''}" data-lang="en">English</button>
            </div>
            <button class="a-logout-btn" id="a-logout-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              <span>${t('logout')}</span>
            </button>
          </div>
        </aside>

        <main class="a-main" role="main">
          <div class="a-topbar">
            <div class="a-topbar-left">
              <button class="a-menu-toggle" id="a-menu-toggle" aria-label="Toggle navigation">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
              </button>
              <div>
                <h1 class="a-page-title" id="a-page-title"></h1>
                <p class="a-page-subtitle" id="a-page-subtitle"></p>
              </div>
            </div>
            <div class="a-topbar-actions" id="a-topbar-actions"></div>
          </div>
          <div id="a-content"></div>
        </main>
      </div>`;

    // Sidebar navigation wiring
    app.querySelectorAll('.a-nav-item[data-view]').forEach((btn) => {
      btn.onclick = () => {
        state.adminView = btn.dataset.view;
        closeSidebar();
        renderAdmin();
      };
    });

    // Language switcher
    app.querySelectorAll('.a-lang-btn[data-lang]').forEach((btn) => {
      btn.onclick = () => {
        state.lang = btn.dataset.lang;
        localStorage.setItem('khata_lang', state.lang);
        renderAdmin();
      };
    });

    // Logout
    document.getElementById('a-logout-btn').onclick = logout;

    // Mobile sidebar toggle
    const sb = document.getElementById('a-sidebar');
    const overlay = document.getElementById('a-sidebar-overlay');
    const toggle = document.getElementById('a-menu-toggle');
    const closeSidebar = () => {
      sb.classList.remove('open');
      overlay.classList.remove('active');
    };
    if (toggle) toggle.onclick = () => {
      sb.classList.toggle('open');
      overlay.classList.toggle('active');
    };
    if (overlay) overlay.onclick = closeSidebar;

    // View title headers
    const viewMeta = {
      overview: {
        title: t('overview'),
        sub: isHi ? 'दुकानों का समग्र विश्लेषण व वित्तीय सारांश' : 'Executive Overview & Financial Metrics',
      },
      review: {
        title: t('review'),
        sub: isHi ? 'हस्तलिखित डायरी पेजों का OCR व सत्यापन' : 'Handwritten Ledger Verification Suite',
      },
      ledger: {
        title: t('ledger'),
        sub: isHi ? 'उधार-जमा लेन-देन विवरण व एक्सपोर्ट' : 'Transaction History, Filtering & Bulk Export',
      },
      customers: {
        title: t('customers'),
        sub: isHi ? 'ग्राहक बहीखाता व व्यक्तिगत हिसाब' : 'Searchable Customer Directory & Ledger Drill-down',
      },
      audit: {
        title: t('audit'),
        sub: isHi ? 'प्रणाली गतिविधि व रीसायकल बिन' : 'Security Audit Trail & Soft-Delete Trash',
      },
    };

    const currentMeta = viewMeta[state.adminView] || { title: '', sub: '' };
    document.getElementById('a-page-title').textContent = currentMeta.title;
    document.getElementById('a-page-subtitle').textContent = currentMeta.sub;

    // Route to active view loader
    if (state.adminView === 'overview') loadOverview();
    else if (state.adminView === 'review') loadReviewQueue();
    else if (state.adminView === 'ledger') loadLedger();
    else if (state.adminView === 'customers') loadCustomers();
    else if (state.adminView === 'audit') loadAudit();
  }

  // ─── ADMIN: OVERVIEW (DASHBOARD & ANALYTICS) ──────────────────────────────────
  async function loadOverview() {
    const el = document.getElementById('a-content');
    const isHi = state.lang === 'hi';
    el.innerHTML = `<div class="a-card" style="text-align:center;padding:48px"><p class="muted">${isHi ? 'डेटा लोड हो रहा है…' : 'Loading financial intelligence…'}</p></div>`;

    try {
      const [metrics, agingData, villageData, followUpsData] = await Promise.all([
        api('/admin/metrics').catch(() => ({})),
        api('/admin/aging').catch(() => ({ buckets: [] })),
        api('/admin/village-stats').catch(() => ({ villages: [] })),
        api('/admin/follow-ups').catch(() => ({ followUps: [], totalCount: 0, totalAmount: 0 })),
      ]);

      const m = metrics || {};
      const pendingCount = m.pendingPhotos || 0;

      // Update sidebar pending badge
      const badge = document.getElementById('a-pending-badge');
      if (badge) {
        if (pendingCount > 0) {
          badge.textContent = pendingCount;
          badge.style.display = 'inline-block';
        } else {
          badge.style.display = 'none';
        }
      }

      // ── KPI Cards ──
      const kpisHtml = `
        <div class="a-kpi-grid">
          <div class="a-kpi-card warn">
            <div class="a-kpi-header">
              <span class="a-kpi-label">${t('todayCredit')}</span>
              <div class="a-kpi-icon">📤</div>
            </div>
            <div class="a-kpi-val">${inr(m.todayCredit || 0)}</div>
            <div class="a-kpi-meta">
              <span class="a-kpi-trend neutral">${isHi ? 'आज का नया उधार' : 'New Credit Today'}</span>
            </div>
          </div>

          <div class="a-kpi-card success">
            <div class="a-kpi-header">
              <span class="a-kpi-label">${t('collections')}</span>
              <div class="a-kpi-icon">📥</div>
            </div>
            <div class="a-kpi-val" style="color:#059669">${inr(m.todayCollections || 0)}</div>
            <div class="a-kpi-meta">
              <span class="a-kpi-trend up">${isHi ? 'आज की जमा रकम' : 'Cash/UPI Collected'}</span>
            </div>
          </div>

          <div class="a-kpi-card danger">
            <div class="a-kpi-header">
              <span class="a-kpi-label">${t('outstanding')}</span>
              <div class="a-kpi-icon">💰</div>
            </div>
            <div class="a-kpi-val" style="color:#b91c1c">${inr(m.totalOutstanding || 0)}</div>
            <div class="a-kpi-meta">
              <span class="a-kpi-trend alert">${isHi ? 'दुकानों का कुल बाकी' : 'Total Across Shops'}</span>
            </div>
          </div>

          <div class="a-kpi-card info">
            <div class="a-kpi-header">
              <span class="a-kpi-label">${t('activeCust')}</span>
              <div class="a-kpi-icon">👥</div>
            </div>
            <div class="a-kpi-val">${m.activeCustomers || 0}</div>
            <div class="a-kpi-meta">
              <span class="a-kpi-trend neutral">${isHi ? 'उधारी वाले ग्राहक' : 'With Active Balance'}</span>
            </div>
          </div>

          <div class="a-kpi-card ${pendingCount > 0 ? 'warn' : 'neutral'}">
            <div class="a-kpi-header">
              <span class="a-kpi-label">${t('pendingPhotos')}</span>
              <div class="a-kpi-icon">📷</div>
            </div>
            <div class="a-kpi-val" style="${pendingCount > 0 ? 'color:#d97706' : ''}">${pendingCount}</div>
            <div class="a-kpi-meta">
              <span class="a-kpi-trend ${pendingCount > 0 ? 'alert' : 'neutral'}">
                ${pendingCount > 0 ? (isHi ? 'जाँच हेतु प्रतीक्षारत' : 'Needs Verification') : (isHi ? 'सभी स्वीकृत' : 'All Cleared')}
              </span>
            </div>
          </div>
        </div>`;

      // ── Dual-Line Interactive Chart (Credit vs Collections) ──
      const trend = m.trend && m.trend.length ? m.trend : [
        { date: 'Day 1', credit: 0, collection: 0 },
        { date: 'Day 2', credit: 0, collection: 0 },
        { date: 'Day 3', credit: 0, collection: 0 },
        { date: 'Day 4', credit: 0, collection: 0 },
        { date: 'Day 5', credit: 0, collection: 0 },
        { date: 'Day 6', credit: 0, collection: 0 },
        { date: 'Day 7', credit: 0, collection: 0 },
      ];

      const maxVal = Math.max(100, ...trend.map(t => Math.max(t.credit || 0, t.collection || 0))) * 1.15;
      const chartW = 560;
      const chartH = 200;
      const padLeft = 40;
      const padRight = 20;
      const padTop = 20;
      const padBottom = 30;
      const effW = chartW - padLeft - padRight;
      const effH = chartH - padTop - padBottom;

      const getX = (idx) => padLeft + (idx / (trend.length - 1 || 1)) * effW;
      const getY = (val) => padTop + effH - (val / maxVal) * effH;

      const creditPts = trend.map((t, i) => `${getX(i)},${getY(t.credit || 0)}`);
      const collPts = trend.map((t, i) => `${getX(i)},${getY(t.collection || 0)}`);

      const creditPath = `M ${creditPts.join(' L ')}`;
      const collPath = `M ${collPts.join(' L ')}`;

      const creditArea = `M ${getX(0)},${getY(0)} L ${creditPts.join(' L ')} L ${getX(trend.length - 1)},${getY(0)} Z`;
      const collArea = `M ${getX(0)},${getY(0)} L ${collPts.join(' L ')} L ${getX(trend.length - 1)},${getY(0)} Z`;

      const chartSvg = `
        <div class="a-chart-wrap" id="a-trend-chart-wrap">
          <div class="a-chart-tooltip" id="a-chart-tooltip"></div>
          <svg class="a-chart-svg" viewBox="0 0 ${chartW} ${chartH}">
            <defs>
              <linearGradient id="gradCredit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.25"/>
                <stop offset="100%" stop-color="#f59e0b" stop-opacity="0.0"/>
              </linearGradient>
              <linearGradient id="gradColl" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#10b981" stop-opacity="0.25"/>
                <stop offset="100%" stop-color="#10b981" stop-opacity="0.0"/>
              </linearGradient>
            </defs>

            <!-- Horizontal grid lines -->
            ${[0, 0.33, 0.66, 1].map((pct) => {
              const y = padTop + effH * (1 - pct);
              const val = Math.round(maxVal * pct);
              return `
                <line x1="${padLeft}" y1="${y}" x2="${chartW - padRight}" y2="${y}" stroke="#f1f5f9" stroke-width="1.5" stroke-dasharray="3 3"/>
                <text x="${padLeft - 6}" y="${y + 3}" text-anchor="end" font-size="9" fill="#94a3b8" font-family="sans-serif">₹${val >= 1000 ? (val/1000).toFixed(0)+'k' : val}</text>`;
            }).join('')}

            <!-- Area fills -->
            <path d="${creditArea}" fill="url(#gradCredit)"/>
            <path d="${collArea}" fill="url(#gradColl)"/>

            <!-- Lines -->
            <path d="${creditPath}" fill="none" stroke="#f59e0b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="${collPath}" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>

            <!-- Data point markers with hover -->
            ${trend.map((t, i) => {
              const cx = getX(i);
              const cyC = getY(t.credit || 0);
              const cyP = getY(t.collection || 0);
              return `
                <text x="${cx}" y="${chartH - 8}" text-anchor="middle" font-size="10" font-weight="600" fill="#64748b" font-family="sans-serif">${escapeHtml(t.date)}</text>
                <circle cx="${cx}" cy="${cyC}" r="4.5" fill="#f59e0b" stroke="#ffffff" stroke-width="2" class="a-chart-dot" data-date="${escapeHtml(t.date)}" data-credit="${t.credit || 0}" data-coll="${t.collection || 0}" data-x="${cx}" data-y="${cyC}" style="cursor:pointer;transition:transform .15s"/>
                <circle cx="${cx}" cy="${cyP}" r="4.5" fill="#10b981" stroke="#ffffff" stroke-width="2" class="a-chart-dot" data-date="${escapeHtml(t.date)}" data-credit="${t.credit || 0}" data-coll="${t.collection || 0}" data-x="${cx}" data-y="${cyP}" style="cursor:pointer;transition:transform .15s"/>`;
            }).join('')}
          </svg>
          <div class="a-chart-legend">
            <div class="a-chart-legend-item"><span class="a-legend-dot" style="background:#f59e0b"></span><span>${isHi ? 'उधार (Credit)' : 'Credit'}</span></div>
            <div class="a-chart-legend-item"><span class="a-legend-dot" style="background:#10b981"></span><span>${isHi ? 'वसूली (Collections)' : 'Collections'}</span></div>
          </div>
        </div>`;

      // ── Gradient Doughnut Chart (Aging Analysis) ──
      const buckets = agingData.buckets && agingData.buckets.length ? agingData.buckets : [
        { label: '0-30 days', count: 0, total: 0, color: '#10b981' },
        { label: '31-60 days', count: 0, total: 0, color: '#3b82f6' },
        { label: '61-90 days', count: 0, total: 0, color: '#f59e0b' },
        { label: '90+ days', count: 0, total: 0, color: '#ef4444' },
      ];

      const agingTotal = buckets.reduce((s, b) => s + (b.total || 0), 0);
      const circumference = 2 * Math.PI * 60; // r=60
      let strokeOffset = 0;

      const donutArcs = buckets.map((b) => {
        const share = agingTotal > 0 ? (b.total / agingTotal) : (1 / buckets.length);
        const arcLen = share * circumference;
        const dashArray = `${arcLen} ${circumference - arcLen}`;
        const dashOffset = -strokeOffset;
        strokeOffset += arcLen;
        return `
          <circle cx="90" cy="90" r="60" fill="transparent"
            stroke="${b.color || '#10b981'}" stroke-width="18"
            stroke-dasharray="${dashArray}" stroke-dashoffset="${dashOffset}"
            stroke-linecap="round" style="transition:stroke-width .2s"
          />`;
      }).join('');

      const donutHtml = `
        <div class="a-donut-layout">
          <div class="a-donut-circle-wrap">
            <svg viewBox="0 0 180 180" style="transform:rotate(-90deg);width:100%;height:100%">
              <circle cx="90" cy="90" r="60" fill="transparent" stroke="#f1f5f9" stroke-width="18"/>
              ${donutArcs}
            </svg>
            <div class="a-donut-center">
              <div class="a-donut-total">${inr(agingTotal)}</div>
              <div class="a-donut-sub">${isHi ? 'कुल बकाया' : 'Total'}</div>
            </div>
          </div>
          <div class="a-aging-legend">
            ${buckets.map((b) => {
              const pct = agingTotal > 0 ? Math.round((b.total / agingTotal) * 100) : 0;
              return `
                <div class="a-aging-item">
                  <div class="a-aging-label-group">
                    <span class="a-aging-dot" style="background:${b.color || '#10b981'}"></span>
                    <span style="font-weight:700">${escapeHtml(b.label)}</span>
                    <span class="muted" style="font-size:.75rem">(${b.count} ${isHi ? 'ग्राहक' : 'cust'})</span>
                  </div>
                  <div style="font-weight:800;color:#0f172a">${inr(b.total)} <span class="muted" style="font-size:.75rem">(${pct}%)</span></div>
                </div>`;
            }).join('')}
          </div>
        </div>`;

      // ── Village Distribution Bar Chart ──
      const rawVillages = villageData.villages || [];
      const villages = rawVillages.slice(0, 8);
      const maxVillageAmt = Math.max(1, ...villages.map(v => v.outstanding || 0));

      const villageHtml = villages.length ? `
        <div class="a-village-list">
          ${villages.map((v) => {
            const pct = Math.round(((v.outstanding || 0) / maxVillageAmt) * 100);
            return `
              <div class="a-village-row">
                <div class="a-village-header">
                  <span class="a-village-name">
                    <span>📍</span>
                    <span>${escapeHtml(v.village || (isHi ? 'अज्ञात' : 'Unknown'))}</span>
                    <span class="a-village-count">${v.count} ${isHi ? 'ग्राहक' : 'cust'}</span>
                  </span>
                  <span class="a-village-amt">${inr(v.outstanding || 0)}</span>
                </div>
                <div class="a-bar-track">
                  <div class="a-bar-fill" style="width:${pct}%"></div>
                </div>
              </div>`;
          }).join('')}
        </div>` : `<p class="muted" style="padding:16px;text-align:center">${isHi ? 'कोई गाँव वार डेटा उपलब्ध नहीं' : 'No village data yet'}</p>`;

      // ── Shop Breakdown Cards ──
      const byShop = m.byShop || [];
      const shopHtml = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px">
          ${['shop1', 'shop2'].map((sId) => {
            const sData = byShop.find(s => s._id === sId) || { outstanding: 0, count: 0 };
            const shopTitle = sId === 'shop1' ? (isHi ? 'दुकान 1 (Shop 1)' : 'Shop 1') : (isHi ? 'दुकान 2 (Shop 2)' : 'Shop 2');
            return `
              <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:14px;padding:16px 18px">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                  <span style="font-weight:800;font-size:1.05rem;color:#092c20">${shopTitle}</span>
                  <span class="a-badge-pill shop">${sData.count} ${isHi ? 'ग्राहक' : 'active'}</span>
                </div>
                <div style="font-size:1.45rem;font-weight:800;color:#9a3412">${inr(sData.outstanding)}</div>
                <div style="font-size:.78rem;color:#64748b;margin-top:4px">${isHi ? 'सक्रिय उधारी खाता' : 'Active ledger balance'}</div>
              </div>`;
          }).join('')}
        </div>`;

      // ── Call / Follow-up Alert Card ──
      const followUps = followUpsData.followUps || [];
      const followUpsHtml = followUps.length ? `
        <div class="a-followup-card">
          <div class="a-followup-header">
            <div class="a-followup-title-wrap">
              <span class="a-followup-pulse-icon">🚨</span>
              <div>
                <h3 class="a-followup-title">
                  ${isHi ? 'तगादा / कॉल आवश्यक (Call / Follow-up Required)' : 'Call / Follow-up Required'}
                  <span class="a-followup-badge">${followUps.length} ${isHi ? 'ग्राहक' : 'Customers'}</span>
                </h3>
                <p class="a-followup-subtitle">
                  ${isHi ? `कुल अतिदेय: ${inr(followUpsData.totalAmount)} · इन ग्राहकों की नियत तारीख निकल चुकी है, तुरंत संपर्क करें या ऑटो-रिमाइंडर भेजें` : `Total Overdue: ${inr(followUpsData.totalAmount)} · Promised due date has passed`}
                </p>
              </div>
            </div>
            <div class="a-followup-header-actions">
              <button class="a-btn-auto-remind" type="button" id="btn-trigger-all-reminders">
                ⚡ ${isHi ? 'सभी को ऑटो-रिमाइंडर भेजें' : 'Send All Reminders'}
              </button>
            </div>
          </div>
          <div class="a-followup-table-wrap">
            <table class="a-table a-followup-table">
              <thead>
                <tr>
                  <th>${isHi ? 'ग्राहक' : 'Customer'}</th>
                  <th>${isHi ? 'नियत तारीख (Due Date)' : 'Due Date'}</th>
                  <th>${isHi ? 'देय रकम' : 'Amount Due'}</th>
                  <th>${isHi ? 'कुल बकाया' : 'Total Balance'}</th>
                  <th>${isHi ? 'संपर्क / रिमाइंडर' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                ${followUps.map(item => `
                  <tr data-followup-id="${item._id}">
                    <td>
                      <div style="font-weight:700;color:#0f172a">${escapeHtml(item.customer.displayName || item.customer.name)}</div>
                      <div class="muted" style="font-size:.78rem">${escapeHtml(item.customer.village || '')} · ${escapeHtml(item.itemLabel || '')}</div>
                    </td>
                    <td>
                      <span class="a-badge-pill ${item.daysOverdue > 7 ? 'danger' : 'warn'}">
                        ${item.daysOverdue === 0 ? (isHi ? 'आज देय' : 'Due Today') : `${item.daysOverdue} ${isHi ? 'दिन लेट' : 'days late'}`}
                      </span>
                      <div class="muted" style="font-size:.75rem;margin-top:2px">${new Date(item.dueDate).toLocaleDateString('hi-IN')}</div>
                    </td>
                    <td style="font-weight:800;color:#b91c1c">${inr(item.amount)}</td>
                    <td style="font-weight:800;color:#092c20">${inr(item.customer.balance)}</td>
                    <td>
                      <div style="display:flex;gap:6px;align-items:center">
                        ${item.customer.phone ? `
                          <a class="a-action-btn call" href="tel:${escapeHtml(item.customer.phone)}" title="${isHi ? 'कॉल करें' : 'Call'}">
                            📞 <span>${isHi ? 'कॉल' : 'Call'}</span>
                          </a>
                          <button class="a-action-btn wa ${item.reminderSent ? 'sent' : ''}" type="button" data-remind-id="${item._id}" data-wa-url="${escapeHtml(item.whatsappUrl || '')}" title="${isHi ? 'WhatsApp रिमाइंडर' : 'WhatsApp Remind'}">
                            📲 <span>${item.reminderSent ? (isHi ? 'भेजा गया ✓' : 'Sent ✓') : (isHi ? 'रिमाइंडर' : 'Remind')}</span>
                          </button>
                        ` : `<span class="muted" style="font-size:.78rem">${isHi ? 'फ़ोन नंबर नहीं' : 'No phone'}</span>`}
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : `
        <div class="a-followup-card ok" style="padding:14px 20px;display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
          <div style="display:flex;align-items:center;gap:12px">
            <span style="font-size:1.3rem">✅</span>
            <span style="font-weight:700;color:#065f46">${isHi ? 'कोई अतिदेय तगादा लंबित नहीं है — सभी खाते समय पर हैं' : 'All accounts on track — No overdue follow-ups pending'}</span>
          </div>
        </div>
      `;

      // Compose full dashboard layout
      el.innerHTML = `
        ${kpisHtml}

        ${followUpsHtml}

        <div class="a-analytics-grid">
          <div class="a-card">
            <div class="a-card-header">
              <div>
                <h3 class="a-card-title">📈 ${t('trendChart')}</h3>
                <p class="a-card-subtitle">${isHi ? 'दैनिक उधार बनाम नकद/UPI वसूली का तुलनात्मक चार्ट' : 'Daily Credit vs Collections Comparison'}</p>
              </div>
            </div>
            ${chartSvg}
          </div>

          <div class="a-card">
            <div class="a-card-header">
              <div>
                <h3 class="a-card-title">⏱️ ${t('aging')}</h3>
                <p class="a-card-subtitle">${isHi ? 'बकाया रकम की समय-सीमा अनुसार स्थिति' : 'Outstanding grouped by duration'}</p>
              </div>
            </div>
            ${donutHtml}
          </div>
        </div>

        <div class="a-analytics-grid" style="grid-template-columns:1fr 1fr">
          <div class="a-card">
            <div class="a-card-header">
              <div>
                <h3 class="a-card-title">🏘️ ${t('villageDistribution')}</h3>
                <p class="a-card-subtitle">${isHi ? 'गाँव अनुसार सर्वाधिक उधारी वितरण' : 'Top villages with highest credit volume'}</p>
              </div>
            </div>
            ${villageHtml}
          </div>

          <div class="a-card">
            <div class="a-card-header">
              <div>
                <h3 class="a-card-title">🏪 ${isHi ? 'दुकानवार स्थिति' : 'Shop Breakdown'}</h3>
                <p class="a-card-subtitle">${isHi ? 'दुकान 1 और दुकान 2 का सीधा तुलनात्मक अवलोकन' : 'Shop 1 vs Shop 2 performance'}</p>
              </div>
            </div>
            ${shopHtml}
          </div>
        </div>`;

      // Tooltip hover wiring for SVG chart
      const tooltip = document.getElementById('a-chart-tooltip');
      const dots = el.querySelectorAll('.a-chart-dot');
      dots.forEach((dot) => {
        dot.onmouseenter = (e) => {
          const d = dot.dataset;
          dot.setAttribute('r', '7');
          tooltip.innerHTML = `<strong>${escapeHtml(d.date)}</strong><br><span style="color:#f59e0b">● ${isHi ? 'उधार' : 'Credit'}: ${inr(d.credit)}</span><br><span style="color:#10b981">● ${isHi ? 'वसूली' : 'Coll'}: ${inr(d.coll)}</span>`;
          tooltip.style.left = `${d.x}px`;
          tooltip.style.top = `${d.y}px`;
          tooltip.style.opacity = '1';
        };
        dot.onmouseleave = () => {
          dot.setAttribute('r', '4.5');
          tooltip.style.opacity = '0';
        };
      });

      // Wire individual remind button
      el.querySelectorAll('[data-remind-id]').forEach((btn) => {
        btn.onclick = async () => {
          const id = btn.dataset.remindId;
          const waUrl = btn.dataset.waUrl;
          btn.disabled = true;
          btn.innerHTML = `<span>${isHi ? 'भेज रहा है…' : 'Sending…'}</span>`;
          try {
            await api(`/admin/follow-ups/${id}/remind`, { method: 'POST' });
            btn.classList.add('sent');
            btn.innerHTML = `📲 <span>${isHi ? 'भेजा गया ✓' : 'Sent ✓'}</span>`;
            toast(isHi ? '✅ ग्राहक को रिमाइंडर संदेश दर्ज और प्रेषित हो गया!' : 'Reminder triggered!');
            if (waUrl) {
              window.open(waUrl, '_blank');
            }
          } catch (e) {
            toast(e.message || 'त्रुटि');
            btn.disabled = false;
            btn.innerHTML = `📲 <span>${isHi ? 'रिमाइंडर' : 'Remind'}</span>`;
          }
        };
      });

      // Wire trigger all reminders button
      const trigBtn = document.getElementById('btn-trigger-all-reminders');
      if (trigBtn) {
        trigBtn.onclick = async () => {
          trigBtn.disabled = true;
          trigBtn.textContent = isHi ? 'भेज रहा है…' : 'Triggering…';
          try {
            const res = await api('/admin/follow-ups/trigger-all', { method: 'POST' });
            toast(isHi ? `✅ ${res.triggeredCount} ग्राहकों के लिए ऑटो-रिमाइंडर ट्रिगर हो गए!` : `Triggered for ${res.triggeredCount} customers!`);
            loadOverview();
          } catch (e) {
            toast(e.message || 'त्रुटि');
            trigBtn.disabled = false;
            trigBtn.textContent = isHi ? '⚡ सभी को ऑटो-रिमाइंडर भेजें' : 'Send All Reminders';
          }
        };
      }

    } catch (err) {
      console.error(err);
      el.innerHTML = `<div class="a-card" style="color:#dc2626;padding:24px">${escapeHtml(err.message)}</div>`;
    }
  }

  // ─── ADMIN: DIARY REVIEW & OCR VERIFICATION SUITE ────────────────────────────
  async function loadReviewQueue() {
    const el = document.getElementById('a-content');
    const isHi = state.lang === 'hi';
    el.innerHTML = `<div class="a-card" style="text-align:center;padding:48px"><p class="muted">${isHi ? 'डायरी समीक्षा सूची लोड हो रही है…' : 'Loading verification queue…'}</p></div>`;

    try {
      // Pull both pending DiaryImage records and pending Entry records
      const [diaryRes, entryRes] = await Promise.all([
        api('/diary?status=pending').catch(() => ({ images: [] })),
        api('/entries/pending-review').catch(() => ({ entries: [] })),
      ]);

      const diaryItems = (diaryRes.images || []).map(img => ({
        _type: 'diaryImage',
        _id: img._id,
        imageUrl: img.path,
        shopId: img.shopId,
        createdAt: img.createdAt,
        customerHint: img.customerHint || '',
        rows: img.rows || [],
      }));

      const entryItems = (entryRes.entries || []).map(entry => ({
        _type: 'entry',
        _id: entry._id,
        imageUrl: entry.imageUrl,
        shopId: entry.shopId,
        createdAt: entry.createdAt,
        customer: entry.customer,
        item: entry.item,
        brand: entry.brand,
        quantity: entry.quantity,
        rate: entry.rate,
        amount: entry.amount,
        paymentMode: entry.paymentMode,
        entryTime: entry.entryTime,
        notes: entry.notes || entry.note,
        honorific: entry.honorific,
      }));

      const allItems = [...diaryItems, ...entryItems];

      // Update sidebar badge
      const badge = document.getElementById('a-pending-badge');
      if (badge) {
        if (allItems.length > 0) {
          badge.textContent = allItems.length;
          badge.style.display = 'inline-block';
        } else {
          badge.style.display = 'none';
        }
      }

      if (!allItems.length) {
        el.innerHTML = `
          <div class="a-card" style="text-align:center;padding:56px 24px">
            <div style="font-size:3.5rem;margin-bottom:12px">🎉</div>
            <h3 style="font-size:1.35rem;font-weight:800;color:#092c20;margin:0 0 8px">${t('noPending')}</h3>
            <p class="muted" style="max-width:440px;margin:0 auto">
              ${isHi ? 'दुकानों से नए डायरी पेज या लंबित प्रविष्टियाँ अपलोड होने पर यहाँ स्वचालित दिखाई देंगी।' : 'When new handwritten diary pages are uploaded from shop portals, they will appear here.'}
            </p>
          </div>`;
        return;
      }

      state._reviewItems = allItems;
      state._reviewIndex = 0;
      renderReviewUI(el);

    } catch (err) {
      console.error(err);
      el.innerHTML = `<div class="a-card" style="color:#dc2626;padding:24px">${escapeHtml(err.message)}</div>`;
    }
  }

  function renderReviewUI(el) {
    const items = state._reviewItems || [];
    const idx = state._reviewIndex || 0;
    const item = items[idx];
    const isHi = state.lang === 'hi';

    if (!item) {
      loadReviewQueue();
      return;
    }

    const isDiaryDoc = item._type === 'diaryImage';
    const c = item.customer || {};
    const firstRow = isDiaryDoc && item.rows && item.rows[0] ? item.rows[0] : {};

    const initialName = c.displayName || c.name || item.customerHint || firstRow.customerName || '';
    const initialItem = item.item || firstRow.item || '';
    const initialBrand = item.brand || firstRow.brand || '';
    const initialQty = item.quantity || firstRow.qty || 1;
    const initialRate = item.rate || firstRow.rate || 0;
    const initialAmt = item.amount || firstRow.amount || (initialQty * initialRate) || 0;
    const initialNotes = item.notes || '';
    const initialMode = item.paymentMode || 'cash';
    const initialHonorific = item.honorific || c.honorific || 'श्री';

    el.innerHTML = `
      <!-- Queue Navigator Bar -->
      <div class="a-filter-bar" style="margin-bottom:18px;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <span style="font-weight:800;color:#092c20">
            ${isHi ? 'प्रविष्टि' : 'Entry'} ${idx + 1} / ${items.length}
          </span>
          <span class="a-badge-pill shop">${escapeHtml(item.shopId)}</span>
          <span class="a-badge-pill neutral">${new Date(item.createdAt).toLocaleString(isHi ? 'hi-IN' : 'en-IN')}</span>
          ${isDiaryDoc ? `<span class="a-badge-pill diary">📷 ${isHi ? 'डायरी फोटो' : 'Scanned Ledger'}</span>` : ''}
        </div>
        <div style="display:flex;gap:6px">
          <button class="a-page-btn" id="rv-prev" ${idx === 0 ? 'disabled' : ''}>← ${isHi ? 'पिछला' : 'Prev'} [Alt+←]</button>
          <button class="a-page-btn" id="rv-next" ${idx === items.length - 1 ? 'disabled' : ''}>${isHi ? 'अगला' : 'Next'} [Alt+→] →</button>
        </div>
      </div>

      <div class="a-split-suite">
        <!-- Advanced Image Inspector -->
        <div class="a-inspector-pane">
          <div class="a-inspector-hud">
            <div class="a-hud-group">
              <button class="a-hud-btn" id="rv-zoom-in" title="Zoom In">🔍+</button>
              <button class="a-hud-btn" id="rv-zoom-out" title="Zoom Out">🔍−</button>
              <button class="a-hud-btn" id="rv-zoom-reset" title="Reset Scale">1:1</button>
              <button class="a-hud-btn" id="rv-rotate" title="Rotate 90°">⟳ 90°</button>
            </div>
            <div class="a-hud-group">
              <span class="a-slider-label">${t('contrast')}</span>
              <input type="range" class="a-hud-slider" id="rv-contrast-slider" min="0.6" max="2.4" step="0.1" value="1.0" />
              <button class="a-hud-btn" id="rv-invert-btn" title="Invert Colors / High-Contrast B&W">🌓</button>
            </div>
          </div>
          <div class="a-inspector-stage" id="rv-stage">
            ${item.imageUrl ? `<img id="rv-img" src="${escapeHtml(item.imageUrl)}" alt="Handwritten Ledger Sheet" draggable="false" />` : `<p class="muted" style="color:#94a3b8">${isHi ? 'कोई फोटो उपलब्ध नहीं है' : 'No photo uploaded'}</p>`}
          </div>
        </div>

        <!-- Side-by-Side OCR Verification Panel -->
        <div class="a-ocr-pane">
          <div class="a-ocr-header">
            <div>
              <h3 style="margin:0;font-size:1.15rem;font-weight:800;color:#092c20">${isHi ? 'सत्यापन व खाता प्रविष्टि' : 'Structured Field Verification'}</h3>
              <p style="margin:2px 0 0;font-size:.8rem;color:#64748b">${isHi ? 'फोटो देखकर सही जानकारी भरें अथवा जाँचें' : 'Verify auto-extracted values against ledger photo'}</p>
            </div>
            <span class="a-badge-pill ${isDiaryDoc ? 'diary' : 'neutral'}">${isDiaryDoc ? 'DIARY PHOTO' : 'ENTRY'}</span>
          </div>

          <form id="rv-form" onsubmit="return false">
            <div class="a-ocr-form-grid">
              <div class="full a-field-group">
                <label>${t('customer')} *</label>
                <div style="position:relative">
                  <input id="rv-cust-name" value="${escapeHtml(initialName)}" placeholder="${isHi ? 'ग्राहक का नाम लिखें...' : 'Customer Name...'}" autocomplete="off" required />
                  <div id="rv-cust-suggest" style="position:absolute;top:100%;left:0;right:0;background:#ffffff;border:1.5px solid #cbd5e1;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.15);z-index:50;display:none;max-height:160px;overflow-y:auto"></div>
                </div>
              </div>

              <div class="a-field-group">
                <label>${t('honorific')}</label>
                <select id="rv-honorific">
                  <option value="श्री" ${initialHonorific === 'श्री' ? 'selected' : ''}>श्री (Shri)</option>
                  <option value="श्रीमती" ${initialHonorific === 'श्रीमती' ? 'selected' : ''}>श्रीमती (Shrimati)</option>
                  <option value="कुमारी" ${initialHonorific === 'कुमारी' ? 'selected' : ''}>कुमारी (Kumari)</option>
                  <option value="" ${!initialHonorific ? 'selected' : ''}>— कोई नहीं —</option>
                </select>
              </div>

              <div class="a-field-group">
                <label>${t('diaryNo')}</label>
                <input id="rv-diary-no" type="number" value="${c.diaryNo || ''}" placeholder="1, 2, 3..." />
              </div>

              <div class="a-field-group">
                <label>${isHi ? 'गाँव' : 'Village'}</label>
                <input id="rv-village" value="${escapeHtml(c.village || firstRow.village || '')}" placeholder="${isHi ? 'गाँव का नाम' : 'Village'}" />
              </div>

              <div class="a-field-group">
                <label>${isHi ? 'मोबाइल नंबर' : 'Phone / Mobile'}</label>
                <input id="rv-phone" type="tel" value="${escapeHtml(c.phone || c.mobile || firstRow.mobile || '')}" placeholder="10-digit mobile" />
              </div>

              <div class="full a-field-group">
                <label>${t('identifierNote')} <small class="muted">(${isHi ? 'उपनाम जैसे: गन्ने वाले, झोला वाले' : 'e.g. Ganna wale'})</small></label>
                <input id="rv-identifier" value="${escapeHtml(c.identifierNote || c.relationNote || firstRow.relationNote || '')}" placeholder="${isHi ? 'पहचान / उपनाम' : 'Identifier Tag'}" />
              </div>

              <div class="a-field-group">
                <label>${t('item')}</label>
                <input id="rv-item" value="${escapeHtml(initialItem)}" placeholder="${isHi ? 'सामान (उदा. कपड़ा, खाद)' : 'Item name'}" />
              </div>

              <div class="a-field-group">
                <label>${t('brand')}</label>
                <input id="rv-brand" value="${escapeHtml(initialBrand)}" placeholder="${isHi ? 'ब्रांड (उदा. सियाराम)' : 'Brand'}" />
              </div>

              <div class="a-field-group">
                <label>${t('qty')}</label>
                <input id="rv-qty" type="number" step="any" value="${initialQty}" />
              </div>

              <div class="a-field-group">
                <label>${t('rate')}</label>
                <input id="rv-rate" type="number" step="any" value="${initialRate}" />
              </div>

              <div class="full a-field-group" style="background:#fefce8;padding:12px;border-radius:12px;border:1.5px solid #fef08a">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
                  <label style="color:#854d0e;font-weight:800;font-size:.9rem">${t('amount')} (₹) *</label>
                  <button type="button" id="rv-calc-btn" class="a-hud-btn" style="background:#fef08a;color:#713f12;border-color:#fde047;padding:3px 8px;font-size:.72rem">
                    🧮 ${isHi ? 'मात्रा × रेट से गणना' : 'Qty × Rate'}
                  </button>
                </div>
                <input id="rv-amount" type="number" step="any" value="${initialAmt}" style="font-size:1.35rem;font-weight:800;color:#092c20;background:#ffffff" required />
              </div>

              <div class="a-field-group">
                <label>${t('paymentMode')}</label>
                <select id="rv-payment-mode">
                  <option value="cash" ${initialMode === 'cash' ? 'selected' : ''}>${isHi ? 'नकद (Cash)' : 'Cash'}</option>
                  <option value="upi" ${initialMode === 'upi' ? 'selected' : ''}>UPI / ऑनलाइन</option>
                </select>
              </div>

              <div class="a-field-group">
                <label>${t('date')}</label>
                <input id="rv-date" type="date" value="${new Date().toISOString().slice(0, 10)}" />
              </div>

              <div class="full a-field-group">
                <label>${t('notes')}</label>
                <textarea id="rv-notes" rows="2" placeholder="${isHi ? 'कोई अतिरिक्त विवरण या टिप्पणी...' : 'Additional notes...'}">${escapeHtml(initialNotes)}</textarea>
              </div>
            </div>

            <!-- Action Buttons with Shortcuts -->
            <div class="a-action-bar">
              <button type="button" class="a-btn-action approve" id="rv-btn-approve">
                <span>✓ ${t('approvePost')}</span>
                <span class="a-shortcut-key">Alt+A</span>
              </button>
              <button type="button" class="a-btn-action draft" id="rv-btn-draft">
                <span>💾 ${t('saveDraft')}</span>
                <span class="a-shortcut-key">Alt+S</span>
              </button>
              <button type="button" class="a-btn-action reject" id="rv-btn-reject">
                <span>✕ ${t('reject')}</span>
                <span class="a-shortcut-key">Alt+R</span>
              </button>
            </div>
          </form>
        </div>
      </div>`;

    // ── Image Inspector Controller ──
    initAdvancedInspector();

    // ── Auto-Calculation ──
    const qtyIn = document.getElementById('rv-qty');
    const rateIn = document.getElementById('rv-rate');
    const amtIn = document.getElementById('rv-amount');
    const calcAuto = () => {
      const q = parseFloat(qtyIn.value) || 0;
      const r = parseFloat(rateIn.value) || 0;
      if (q > 0 && r > 0) amtIn.value = Math.round(q * r * 100) / 100;
    };
    if (qtyIn) qtyIn.oninput = calcAuto;
    if (rateIn) rateIn.oninput = calcAuto;
    const calcBtn = document.getElementById('rv-calc-btn');
    if (calcBtn) calcBtn.onclick = calcAuto;

    // ── Customer Autocomplete ──
    const custInput = document.getElementById('rv-cust-name');
    const suggestBox = document.getElementById('rv-cust-suggest');
    let suggestTimer = null;

    if (custInput) {
      custInput.oninput = () => {
        clearTimeout(suggestTimer);
        const q = custInput.value.trim();
        if (q.length < 2) {
          suggestBox.style.display = 'none';
          return;
        }
        suggestTimer = setTimeout(async () => {
          try {
            const res = await api(`/customers/autocomplete?field=name&q=${encodeURIComponent(q)}&shopId=${item.shopId}`);
            const suggestions = res.suggestions || [];
            if (!suggestions.length) {
              suggestBox.style.display = 'none';
              return;
            }
            suggestBox.innerHTML = suggestions.map(s => `
              <div class="rv-suggest-item" data-name="${escapeHtml(s)}" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid #f1f5f9;font-weight:600;font-size:.9rem">
                👤 ${escapeHtml(s)}
              </div>
            `).join('');
            suggestBox.style.display = 'block';

            suggestBox.querySelectorAll('.rv-suggest-item').forEach(si => {
              si.onclick = () => {
                custInput.value = si.dataset.name;
                suggestBox.style.display = 'none';
              };
            });
          } catch { /* ignore */ }
        }, 220);
      };
      document.addEventListener('click', (e) => {
        if (!custInput.contains(e.target) && !suggestBox.contains(e.target)) {
          suggestBox.style.display = 'none';
        }
      });
    }

    // ── Queue Navigation ──
    const prevBtn = document.getElementById('rv-prev');
    const nextBtn = document.getElementById('rv-next');
    if (prevBtn) prevBtn.onclick = () => {
      if (state._reviewIndex > 0) {
        state._reviewIndex--;
        renderReviewUI(el);
      }
    };
    if (nextBtn) nextBtn.onclick = () => {
      if (state._reviewIndex < items.length - 1) {
        state._reviewIndex++;
        renderReviewUI(el);
      }
    };

    // ── Approve & Post Action ──
    const approveBtn = document.getElementById('rv-btn-approve');
    const doApprove = async () => {
      const custName = custInput.value.trim();
      const amount = parseFloat(amtIn.value);
      if (!custName) {
        toast(isHi ? 'कृपया ग्राहक का नाम दर्ज करें' : 'Customer name is required');
        custInput.focus();
        return;
      }
      if (!amount || amount <= 0) {
        toast(isHi ? 'कृपया वैध रकम दर्ज करें' : 'Valid amount is required');
        amtIn.focus();
        return;
      }

      approveBtn.disabled = true;
      try {
        if (isDiaryDoc) {
          // DiaryImage approval endpoint
          const rowData = {
            customerName: custName,
            village: document.getElementById('rv-village').value.trim(),
            mobile: document.getElementById('rv-phone').value.trim(),
            relationNote: document.getElementById('rv-identifier').value.trim(),
            item: document.getElementById('rv-item').value.trim() || 'डायरी हिसाब',
            brand: document.getElementById('rv-brand').value.trim(),
            qty: parseFloat(qtyIn.value) || 1,
            rate: parseFloat(rateIn.value) || 0,
            amount: amount,
            date: document.getElementById('rv-date').value,
            type: 'credit',
          };
          await api(`/diary/${item._id}/approve`, {
            method: 'POST',
            body: { rows: [rowData] },
          });
        } else {
          // Entry approval endpoint
          let customerId = c._id;
          if (!customerId || custName !== (c.displayName || c.name)) {
            const resolved = await api('/customers/resolve', {
              method: 'POST',
              body: {
                name: custName,
                shopId: item.shopId,
                createIfMissing: true,
                village: document.getElementById('rv-village').value.trim(),
                phone: document.getElementById('rv-phone').value.trim(),
                identifierNote: document.getElementById('rv-identifier').value.trim(),
                honorific: document.getElementById('rv-honorific').value,
                diaryNo: document.getElementById('rv-diary-no').value || undefined,
              },
            });
            if (resolved.customer) customerId = resolved.customer._id;
          }

          await api(`/entries/${item._id}/approve`, {
            method: 'POST',
            body: {
              customerId,
              item: document.getElementById('rv-item').value.trim(),
              brand: document.getElementById('rv-brand').value.trim(),
              quantity: parseFloat(qtyIn.value) || 1,
              rate: parseFloat(rateIn.value) || 0,
              amount: amount,
              notes: document.getElementById('rv-notes').value.trim(),
              paymentMode: document.getElementById('rv-payment-mode').value,
              entryTime: document.getElementById('rv-date').value,
              honorific: document.getElementById('rv-honorific').value,
            },
          });
        }

        playChime?.();
        toast(isHi ? 'सफलतापूर्वक खाते में दर्ज कर दिया गया! ✓' : 'Approved & Posted to Ledger! ✓');
        loadReviewQueue();

      } catch (err) {
        toast(err.message || 'Approval failed');
        approveBtn.disabled = false;
      }
    };
    if (approveBtn) approveBtn.onclick = doApprove;

    // ── Save Draft Action ──
    const draftBtn = document.getElementById('rv-btn-draft');
    const doDraft = async () => {
      try {
        if (isDiaryDoc) {
          const rowData = {
            customerName: custInput.value.trim(),
            village: document.getElementById('rv-village').value.trim(),
            mobile: document.getElementById('rv-phone').value.trim(),
            item: document.getElementById('rv-item').value.trim(),
            amount: parseFloat(amtIn.value) || 0,
          };
          await api(`/diary/${item._id}`, {
            method: 'PATCH',
            body: { rows: [rowData], customerHint: custInput.value.trim() },
          });
        }
        toast(isHi ? 'ड्राफ्ट सहेज लिया गया' : 'Draft saved');
      } catch (err) {
        toast(err.message || 'Draft failed');
      }
    };
    if (draftBtn) draftBtn.onclick = doDraft;

    // ── Reject Action ──
    const rejectBtn = document.getElementById('rv-btn-reject');
    const doReject = async () => {
      const reason = prompt(isHi ? 'रद्द करने का कारण दर्ज करें:' : 'Reason for rejection:', 'Handwriting unclear / illegible');
      if (reason === null) return;

      rejectBtn.disabled = true;
      try {
        if (isDiaryDoc) {
          await api(`/diary/${item._id}/reject`, { method: 'POST', body: { reason } });
        } else {
          await api(`/entries/${item._id}/reject`, { method: 'POST', body: { reason } });
        }
        toast(isHi ? 'प्रविष्टि रद्द कर दी गई' : 'Entry rejected');
        loadReviewQueue();
      } catch (err) {
        toast(err.message || 'Reject failed');
        rejectBtn.disabled = false;
      }
    };
    if (rejectBtn) rejectBtn.onclick = doReject;

    // ── Global Keyboard Shortcuts ──
    const keyHandler = (e) => {
      if (e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        doApprove();
      } else if (e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        doDraft();
      } else if (e.altKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        doReject();
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        if (nextBtn && !nextBtn.disabled) nextBtn.click();
      } else if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        if (prevBtn && !prevBtn.disabled) prevBtn.click();
      }
    };
    window._khataKeyHandler = keyHandler;
    window.removeEventListener('keydown', window._khataPrevKeyHandler || (() => {}));
    window.addEventListener('keydown', keyHandler);
    window._khataPrevKeyHandler = keyHandler;
  }

  // ─── ADVANCED IMAGE INSPECTOR (ZOOM, PAN, ROTATE, CONTRAST) ──────────────────
  function initAdvancedInspector() {
    const img = document.getElementById('rv-img');
    const stage = document.getElementById('rv-stage');
    if (!img || !stage) return;

    let scale = 1.0;
    let rotation = 0;
    let ox = 0, oy = 0;
    let contrast = 1.0;
    let isInverted = false;
    let dragging = false;
    let startX = 0, startY = 0;

    const applyTransform = () => {
      img.style.transform = `translate(${ox}px, ${oy}px) scale(${scale}) rotate(${rotation}deg)`;
      const filterParts = [`contrast(${contrast})`];
      if (isInverted) filterParts.push('invert(1) grayscale(1)');
      img.style.filter = filterParts.join(' ');
    };

    // Zoom Buttons
    const zi = document.getElementById('rv-zoom-in');
    const zo = document.getElementById('rv-zoom-out');
    const zr = document.getElementById('rv-zoom-reset');
    const rot = document.getElementById('rv-rotate');
    const cSlider = document.getElementById('rv-contrast-slider');
    const invBtn = document.getElementById('rv-invert-btn');

    if (zi) zi.onclick = () => { scale = Math.min(5.0, scale + 0.35); applyTransform(); };
    if (zo) zo.onclick = () => { scale = Math.max(0.4, scale - 0.35); applyTransform(); };
    if (zr) zr.onclick = () => { scale = 1.0; ox = 0; oy = 0; rotation = 0; contrast = 1.0; isInverted = false; if (cSlider) cSlider.value = 1.0; applyTransform(); };
    if (rot) rot.onclick = () => { rotation = (rotation + 90) % 360; applyTransform(); };

    if (cSlider) cSlider.oninput = (e) => {
      contrast = parseFloat(e.target.value) || 1.0;
      applyTransform();
    };

    if (invBtn) invBtn.onclick = () => {
      isInverted = !isInverted;
      invBtn.style.background = isInverted ? '#10b981' : '';
      applyTransform();
    };

    // Mouse Pan Dragging
    stage.onmousedown = (e) => {
      dragging = true;
      startX = e.clientX - ox;
      startY = e.clientY - oy;
    };
    window.onmousemove = (e) => {
      if (!dragging) return;
      ox = e.clientX - startX;
      oy = e.clientY - startY;
      applyTransform();
    };
    window.onmouseup = () => { dragging = false; };

    // Mouse Wheel Zoom
    stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.2 : -0.2;
      scale = Math.min(5.0, Math.max(0.4, scale + delta));
      applyTransform();
    }, { passive: false });

    // Touch Support (Mobile Pan & Pinch)
    let lastTouchX = 0, lastTouchY = 0;
    stage.ontouchstart = (e) => {
      if (e.touches.length === 1) {
        lastTouchX = e.touches[0].clientX - ox;
        lastTouchY = e.touches[0].clientY - oy;
      }
    };
    stage.ontouchmove = (e) => {
      if (e.touches.length === 1) {
        e.preventDefault();
        ox = e.touches[0].clientX - lastTouchX;
        oy = e.touches[0].clientY - lastTouchY;
        applyTransform();
      }
    };
  }

  // ─── ADMIN: LEDGER & TRANSACTION MANAGEMENT ──────────────────────────────────
  async function loadLedger() {
    const el = document.getElementById('a-content');
    const isHi = state.lang === 'hi';

    let currentPage = 1;
    const limit = 50;

    el.innerHTML = `
      <!-- Multi-Filter Bar -->
      <div class="a-filter-bar">
        <div class="a-search-box">
          <svg class="a-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input id="lf-q" placeholder="${t('searchPlaceholder')}" />
        </div>

        <select class="a-select" id="lf-shop">
          <option value="all">${t('allShops')}</option>
          <option value="shop1">${isHi ? 'दुकान 1 (Shop 1)' : 'Shop 1'}</option>
          <option value="shop2">${isHi ? 'दुकान 2 (Shop 2)' : 'Shop 2'}</option>
        </select>

        <select class="a-select" id="lf-type">
          <option value="all">${t('allTypes')}</option>
          <option value="credit">📤 ${isHi ? 'उधार (Credit)' : 'Credit'}</option>
          <option value="payment">📥 ${isHi ? 'जमा (Payment)' : 'Payment'}</option>
        </select>

        <select class="a-select" id="lf-date-preset">
          <option value="all">${isHi ? 'सभी तिथियाँ (All Time)' : 'All Time'}</option>
          <option value="today">${isHi ? 'आज (Today)' : 'Today'}</option>
          <option value="7days">${isHi ? 'पिछले 7 दिन (Last 7 Days)' : 'Last 7 Days'}</option>
          <option value="month">${isHi ? 'इस महीने (This Month)' : 'This Month'}</option>
          <option value="custom">${isHi ? 'कस्टम तारीख (Custom)' : 'Custom Range'}</option>
        </select>

        <div id="lf-custom-dates" style="display:none;gap:6px;align-items:center">
          <input type="date" id="lf-start-date" class="a-select" style="min-height:42px" />
          <span class="muted">to</span>
          <input type="date" id="lf-end-date" class="a-select" style="min-height:42px" />
        </div>

        <select class="a-select" id="lf-status">
          <option value="approved">${isHi ? 'स्वीकृत (Approved)' : 'Approved'}</option>
          <option value="all">${isHi ? 'सभी स्थितियाँ' : 'All Statuses'}</option>
          <option value="deletedOnly">🗑️ ${isHi ? 'कचरापेटी (Trash)' : 'Recycle Bin'}</option>
        </select>

        <button class="a-filter-btn" id="lf-export-csv" style="background:#092c20;color:#ffffff" title="Export Ledger to CSV (Excel compatible)">
          📊 ${t('exportCsv')}
        </button>
        <button class="a-filter-btn" id="lf-export-pdf" style="background:#f1f5f9;color:#334155;border:1px solid #cbd5e1" title="Print or Save PDF">
          🖨️ ${t('exportPdf')}
        </button>
      </div>

      <!-- Table Container -->
      <div class="a-table-container">
        <div class="a-table-scroll">
          <div id="lf-table-wrap">
            <p class="muted" style="text-align:center;padding:48px">${isHi ? 'खाता बही लोड हो रही है…' : 'Loading transactions…'}</p>
          </div>
        </div>
        <div class="a-pagination-bar" id="lf-pagination" style="display:none"></div>
      </div>`;

    // Date preset selector logic
    const presetSelect = document.getElementById('lf-date-preset');
    const customDiv = document.getElementById('lf-custom-dates');
    if (presetSelect) {
      presetSelect.onchange = () => {
        customDiv.style.display = presetSelect.value === 'custom' ? 'flex' : 'none';
        currentPage = 1;
        fetchLedger();
      };
    }

    const fetchLedger = async () => {
      const qVal = document.getElementById('lf-q').value.trim();
      const shopVal = document.getElementById('lf-shop').value;
      const typeVal = document.getElementById('lf-type').value;
      const statusVal = document.getElementById('lf-status').value;
      const presetVal = presetSelect.value;

      let startDate = '';
      let endDate = '';

      if (presetVal === 'today') {
        const d = new Date().toISOString().slice(0, 10);
        startDate = d;
        endDate = d;
      } else if (presetVal === '7days') {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        startDate = d.toISOString().slice(0, 10);
      } else if (presetVal === 'month') {
        const d = new Date();
        startDate = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
      } else if (presetVal === 'custom') {
        startDate = document.getElementById('lf-start-date').value;
        endDate = document.getElementById('lf-end-date').value;
      }

      const params = new URLSearchParams({
        page: currentPage,
        limit,
      });

      if (qVal) params.set('q', qVal);
      if (shopVal !== 'all') params.set('shopId', shopVal);
      if (typeVal !== 'all') params.set('type', typeVal);
      if (statusVal === 'deletedOnly') params.set('deletedOnly', '1');
      else if (statusVal !== 'all') params.set('status', statusVal);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const wrap = document.getElementById('lf-table-wrap');
      wrap.innerHTML = `<p class="muted" style="text-align:center;padding:48px">${isHi ? 'डेटा लाया जा रहा है…' : 'Fetching records…'}</p>`;

      try {
        const res = await api(`/admin/ledger?${params}`);
        const entries = res.entries || [];
        const total = res.total || 0;
        const totalPages = res.totalPages || 1;

        if (!entries.length) {
          wrap.innerHTML = `
            <div style="text-align:center;padding:56px 20px">
              <div style="font-size:3rem;margin-bottom:8px">📂</div>
              <h4 style="font-size:1.15rem;font-weight:700;color:#092c20;margin:0 0 6px">${t('noData')}</h4>
              <p class="muted" style="font-size:.85rem;margin:0">${isHi ? 'कोई मेल खाती प्रविष्टि नहीं मिली।' : 'No entries match your search criteria.'}</p>
            </div>`;
          document.getElementById('lf-pagination').style.display = 'none';
          return;
        }

        // Render Table Rows
        wrap.innerHTML = `
          <table class="a-table">
            <thead>
              <tr>
                <th>${t('date')}</th>
                <th>${t('customer')}</th>
                <th>${isHi ? 'गाँव' : 'Village'}</th>
                <th>${t('item')} & ${t('brand')}</th>
                <th>${t('qty')}</th>
                <th>${t('rate')}</th>
                <th>${t('amount')}</th>
                <th>${t('paymentMode')}</th>
                <th>${t('shop')}</th>
                <th>${t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              ${entries.map((e) => {
                const c = e.customer || {};
                const isCleared = e.isCleared;
                const isPayment = e.type === 'payment';
                const itemDesc = e.itemLabel || e.item || (e.items && e.items[0]?.desc) || (isPayment ? (isHi ? 'जमा भुगतान' : 'Payment') : '—');
                const brand = e.brand || (e.items && e.items[0]?.brand) || '';
                const custName = c.displayName || c.name || '—';
                const dateStr = new Date(e.date).toLocaleDateString(isHi ? 'hi-IN' : 'en-IN');
                const isDeleted = !!e.deletedAt;

                return `
                  <tr class="${isCleared ? 'cleared' : ''}">
                    <td style="white-space:nowrap;font-weight:600">
                      <div>${dateStr}</div>
                      ${e.entryTime ? `<div class="muted" style="font-size:.75rem">${new Date(e.entryTime).toLocaleTimeString(isHi ? 'hi-IN' : 'en-IN', { hour: '2-digit', minute: '2-digit' })}</div>` : ''}
                    </td>
                    <td>
                      <div style="font-weight:700;color:#092c20">${escapeHtml(custName)}</div>
                      ${c.identifierNote ? `<div style="font-size:.76rem;color:#b45309">(${escapeHtml(c.identifierNote)})</div>` : ''}
                      ${c.phone ? `<div style="font-size:.75rem;color:#64748b">${escapeHtml(c.phone)}</div>` : ''}
                    </td>
                    <td>
                      ${c.village ? `<span class="a-badge-pill neutral">📍 ${escapeHtml(c.village)}</span>` : '—'}
                    </td>
                    <td>
                      <div style="font-weight:600">${escapeHtml(itemDesc)}</div>
                      ${brand ? `<div class="muted" style="font-size:.75rem">${escapeHtml(brand)}</div>` : ''}
                    </td>
                    <td>${e.quantity || '1'}</td>
                    <td>${e.rate ? inr(e.rate) : '—'}</td>
                    <td style="font-weight:800;font-size:1rem;color:${isPayment ? '#059669' : '#dc2626'}">
                      <span class="a-badge-pill ${isPayment ? 'payment' : 'sale'}">
                        ${isPayment ? '↓ जमा' : '↑ उधार'}
                      </span>
                      <div style="margin-top:2px">${inr(e.amount)}</div>
                    </td>
                    <td>
                      <span class="muted" style="text-transform:uppercase;font-size:.76rem;font-weight:700">
                        ${escapeHtml(e.paymentMode || 'cash')}
                      </span>
                    </td>
                    <td>
                      <span class="a-badge-pill shop">${escapeHtml(e.shopId)}</span>
                    </td>
                    <td style="white-space:nowrap">
                      ${isDeleted ? `
                        <button class="a-page-btn lf-restore-btn" data-id="${e._id}" style="color:#059669;border-color:#10b981">
                          ♻️ ${t('restore')}
                        </button>
                      ` : `
                        <button class="a-page-btn lf-delete-btn" data-id="${e._id}" style="color:#dc2626;border-color:#fca5a5" title="Soft-delete">
                          🗑️
                        </button>
                      `}
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>`;

        // Wire Row Actions (Soft Delete & Restore)
        wrap.querySelectorAll('.lf-delete-btn').forEach((btn) => {
          btn.onclick = async () => {
            if (!confirm(isHi ? 'क्या आप इस प्रविष्टि को हटाना चाहते हैं?' : 'Soft-delete this entry?')) return;
            try {
              await api(`/entries/${btn.dataset.id}`, { method: 'DELETE' });
              toast(isHi ? 'प्रविष्टि हटा दी गई (कचरापेटी में भेजी गई)' : 'Entry soft-deleted');
              fetchLedger();
            } catch (err) { toast(err.message); }
          };
        });

        wrap.querySelectorAll('.lf-restore-btn').forEach((btn) => {
          btn.onclick = async () => {
            try {
              await api(`/entries/${btn.dataset.id}/restore`, { method: 'POST' });
              toast(isHi ? 'प्रविष्टि वापस ला दी गई! ✓' : 'Entry restored! ✓');
              fetchLedger();
            } catch (err) { toast(err.message); }
          };
        });

        // ── Render Pagination Bar ──
        const pag = document.getElementById('lf-pagination');
        pag.style.display = 'flex';
        const startItem = (currentPage - 1) * limit + 1;
        const endItem = Math.min(total, currentPage * limit);

        pag.innerHTML = `
          <div class="a-pagination-info">
            ${isHi ? `कुल ${total} में से ${startItem}–${endItem} रिकॉर्ड्स` : `Showing ${startItem}–${endItem} of ${total} entries`}
          </div>
          <div class="a-pagination-controls">
            <button class="a-page-btn" id="lf-pg-first" ${currentPage === 1 ? 'disabled' : ''}>« First</button>
            <button class="a-page-btn" id="lf-pg-prev" ${currentPage === 1 ? 'disabled' : ''}>‹ Prev</button>
            <span style="font-weight:700;font-size:.85rem;padding:0 8px">${t('page')} ${currentPage} ${t('of')} ${totalPages}</span>
            <button class="a-page-btn" id="lf-pg-next" ${currentPage === totalPages ? 'disabled' : ''}>Next ›</button>
            <button class="a-page-btn" id="lf-pg-last" ${currentPage === totalPages ? 'disabled' : ''}>Last »</button>
          </div>`;

        document.getElementById('lf-pg-first').onclick = () => { currentPage = 1; fetchLedger(); };
        document.getElementById('lf-pg-prev').onclick = () => { if (currentPage > 1) { currentPage--; fetchLedger(); } };
        document.getElementById('lf-pg-next').onclick = () => { if (currentPage < totalPages) { currentPage++; fetchLedger(); } };
        document.getElementById('lf-pg-last').onclick = () => { currentPage = totalPages; fetchLedger(); };

      } catch (err) {
        wrap.innerHTML = `<div style="color:#dc2626;padding:24px">${escapeHtml(err.message)}</div>`;
      }
    };

    // Filter event bindings with debounce
    let searchDebounce = null;
    document.getElementById('lf-q').oninput = () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => { currentPage = 1; fetchLedger(); }, 250);
    };
    document.getElementById('lf-shop').onchange = () => { currentPage = 1; fetchLedger(); };
    document.getElementById('lf-type').onchange = () => { currentPage = 1; fetchLedger(); };
    document.getElementById('lf-status').onchange = () => { currentPage = 1; fetchLedger(); };
    document.getElementById('lf-start-date').onchange = () => { currentPage = 1; fetchLedger(); };
    document.getElementById('lf-end-date').onchange = () => { currentPage = 1; fetchLedger(); };

    // ── Export CSV Action (with UTF-8 BOM for Excel Hindi support) ──
    document.getElementById('lf-export-csv').onclick = async () => {
      toast(isHi ? 'CSV तैयार की जा रही है…' : 'Generating CSV export…');
      try {
        const res = await api('/admin/ledger?limit=1000');
        const rows = res.entries || [];
        if (!rows.length) {
          toast(isHi ? 'एक्सपोर्ट के लिए कोई डेटा नहीं है' : 'No records to export');
          return;
        }

        const headers = ['Date', 'Time', 'Customer', 'Village', 'Mobile', 'Item', 'Brand', 'Qty', 'Rate', 'Amount', 'Type', 'PaymentMode', 'Shop', 'Status'];
        const csvRows = [headers.join(',')];

        rows.forEach(e => {
          const c = e.customer || {};
          const row = [
            `"${new Date(e.date).toLocaleDateString('en-GB')}"`,
            `"${e.entryTime ? new Date(e.entryTime).toLocaleTimeString('en-IN') : ''}"`,
            `"${(c.name || '').replace(/"/g, '""')}"`,
            `"${(c.village || '').replace(/"/g, '""')}"`,
            `"${(c.phone || '').replace(/"/g, '""')}"`,
            `"${(e.item || '').replace(/"/g, '""')}"`,
            `"${(e.brand || '').replace(/"/g, '""')}"`,
            e.quantity || 1,
            e.rate || 0,
            e.amount || 0,
            `"${e.type}"`,
            `"${e.paymentMode || 'cash'}"`,
            `"${e.shopId}"`,
            `"${e.deletedAt ? 'Deleted' : e.status}"`,
          ];
          csvRows.push(row.join(','));
        });

        const csvContent = '\uFEFF' + csvRows.join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Khata_Ledger_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast(isHi ? 'CSV डाउनलोड प्रारंभ हो गया ✓' : 'CSV download started ✓');
      } catch (err) {
        toast(err.message || 'Export failed');
      }
    };

    // Print / PDF Action
    document.getElementById('lf-export-pdf').onclick = () => {
      window.print();
    };

    fetchLedger();
  }

  // ─── ADMIN: CUSTOMER HUB & LEDGER DRILL-DOWN ─────────────────────────────────
  async function loadCustomers() {
    const el = document.getElementById('a-content');
    const isHi = state.lang === 'hi';

    el.innerHTML = `
      <div class="a-filter-bar">
        <div class="a-search-box">
          <svg class="a-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input id="cq-input" placeholder="${isHi ? 'ग्राहक का नाम, गाँव, मोबाइल या डायरी नं. से खोजें...' : 'Search by name, village, mobile or diary no...'}" />
        </div>

        <select class="a-select" id="cq-shop">
          <option value="all">${t('allShops')}</option>
          <option value="shop1">${isHi ? 'दुकान 1 (Shop 1)' : 'Shop 1'}</option>
          <option value="shop2">${isHi ? 'दुकान 2 (Shop 2)' : 'Shop 2'}</option>
        </select>

        <select class="a-select" id="cq-status">
          <option value="all">${isHi ? 'सभी ग्राहक (All)' : 'All Customers'}</option>
          <option value="outstanding">${isHi ? 'बकाया वाले (> ₹0)' : 'With Balance (> 0)'}</option>
          <option value="settled">${isHi ? 'हिसाब चुकता (Settled)' : 'Settled (₹0)'}</option>
        </select>
      </div>

      <div class="a-table-container">
        <div class="a-table-scroll">
          <div id="cq-table-wrap">
            <p class="muted" style="text-align:center;padding:48px">${isHi ? 'ग्राहक सूची लोड हो रही है…' : 'Loading customers…'}</p>
          </div>
        </div>
      </div>
      <div id="cq-modal-container"></div>`;

    const fetchCustomers = async () => {
      const q = document.getElementById('cq-input').value.trim();
      const shopId = document.getElementById('cq-shop').value;
      const statusFilter = document.getElementById('cq-status').value;

      const params = new URLSearchParams({ all: '1' });
      if (q) params.set('q', q);
      if (shopId !== 'all') params.set('shopId', shopId);
      if (statusFilter === 'settled') params.set('settled', '1');

      const wrap = document.getElementById('cq-table-wrap');
      wrap.innerHTML = `<p class="muted" style="text-align:center;padding:48px">${isHi ? 'डेटा लाया जा रहा है…' : 'Fetching…'}</p>`;

      try {
        const res = await api(`/customers?${params}`);
        let customers = res.customers || [];

        if (statusFilter === 'outstanding') {
          customers = customers.filter(c => (c.balance || 0) > 0.01);
        }

        if (!customers.length) {
          wrap.innerHTML = `
            <div style="text-align:center;padding:56px 20px">
              <div style="font-size:3rem;margin-bottom:8px">👥</div>
              <h4 style="font-size:1.15rem;font-weight:700;color:#092c20;margin:0 0 6px">${isHi ? 'कोई ग्राहक नहीं मिला' : 'No customers found'}</h4>
              <p class="muted" style="margin:0">${isHi ? 'खोज शब्द बदलकर देखें।' : 'Try adjusting your search criteria.'}</p>
            </div>`;
          return;
        }

        wrap.innerHTML = `
          <table class="a-table">
            <thead>
              <tr>
                <th style="width:50px">${t('diaryNo')}</th>
                <th>${t('customer')}</th>
                <th>${t('identifierNote')}</th>
                <th>${isHi ? 'गाँव' : 'Village'}</th>
                <th>${isHi ? 'मोबाइल' : 'Mobile'}</th>
                <th>${t('outstanding')}</th>
                <th>${t('shop')}</th>
                <th style="text-align:right">${t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              ${customers.map((c) => {
                const hasBalance = (c.balance || 0) > 0.01;
                return `
                  <tr>
                    <td>
                      <span class="a-circle-no">${c.diaryNo || '—'}</span>
                    </td>
                    <td>
                      <a href="#" class="cq-drill-btn" data-id="${c._id}" style="font-weight:800;color:#092c20;text-decoration:none">
                        ${c.honorific ? `<span class="muted">${escapeHtml(c.honorific)}</span> ` : ''}${escapeHtml(c.name)}
                      </a>
                    </td>
                    <td>
                      ${c.identifierNote ? `<span style="font-weight:600;color:#b45309">(${escapeHtml(c.identifierNote)})</span>` : '—'}
                    </td>
                    <td>
                      ${c.village ? `<span class="a-badge-pill neutral">📍 ${escapeHtml(c.village)}</span>` : '—'}
                    </td>
                    <td>
                      ${c.phone ? `
                        <a href="tel:${escapeHtml(c.phone)}" style="color:#0369a1;font-weight:600;text-decoration:none">
                          📞 ${escapeHtml(c.phone)}
                        </a>
                      ` : '—'}
                    </td>
                    <td>
                      <span style="font-size:1.05rem;font-weight:800;color:${hasBalance ? '#b91c1c' : '#059669'}">
                        ${inr(c.balance || 0)}
                      </span>
                    </td>
                    <td>
                      <span class="a-badge-pill shop">${escapeHtml(c.shopId)}</span>
                    </td>
                    <td style="text-align:right">
                      <button class="a-page-btn cq-drill-btn" data-id="${c._id}" style="background:#092c20;color:#ffffff;border:none">
                        📖 ${t('drilldown')}
                      </button>
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>`;

        // Wire Customer Drill-Down Ledger Modal
        wrap.querySelectorAll('.cq-drill-btn').forEach((btn) => {
          btn.onclick = (e) => {
            e.preventDefault();
            openCustomerLedgerModal(btn.dataset.id);
          };
        });

      } catch (err) {
        wrap.innerHTML = `<div style="color:#dc2626;padding:24px">${escapeHtml(err.message)}</div>`;
      }
    };

    let searchTimer = null;
    document.getElementById('cq-input').oninput = () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(fetchCustomers, 250);
    };
    document.getElementById('cq-shop').onchange = fetchCustomers;
    document.getElementById('cq-status').onchange = fetchCustomers;

    fetchCustomers();
  }

  // ─── CUSTOMER LEDGER DRILL-DOWN MODAL ─────────────────────────────────────────
  async function openCustomerLedgerModal(customerId) {
    const isHi = state.lang === 'hi';
    const container = document.getElementById('cq-modal-container');
    if (!container) return;

    container.innerHTML = `
      <div class="a-modal-backdrop" id="cq-modal-backdrop">
        <div class="a-modal-card">
          <div class="a-modal-header">
            <div>
              <h3 style="margin:0;font-size:1.25rem;font-weight:800;color:#092c20" id="cq-mod-name">${isHi ? 'ग्राहक खाता बही' : 'Customer Ledger'}</h3>
              <p style="margin:2px 0 0;font-size:.8rem;color:#64748b" id="cq-mod-meta">${isHi ? 'लोड हो रहा है…' : 'Loading details…'}</p>
            </div>
            <button class="a-page-btn" id="cq-mod-close" style="font-size:1.1rem;padding:4px 10px">✕</button>
          </div>
          <div class="a-modal-body" id="cq-mod-body">
            <p class="muted" style="text-align:center;padding:48px">${isHi ? 'बहीखाता प्रविष्टियाँ लोड हो रही हैं…' : 'Loading ledger history…'}</p>
          </div>
        </div>
      </div>`;

    document.getElementById('cq-mod-close').onclick = () => { container.innerHTML = ''; };
    document.getElementById('cq-modal-backdrop').onclick = (e) => {
      if (e.target.id === 'cq-modal-backdrop') container.innerHTML = '';
    };

    try {
      const res = await api(`/customers/${customerId}`);
      const c = res.customer || {};
      const entries = res.entries || [];

      document.getElementById('cq-mod-name').innerHTML = `
        <span class="a-circle-no" style="margin-right:6px">${c.diaryNo || '—'}</span>
        ${c.honorific ? `${escapeHtml(c.honorific)} ` : ''}${escapeHtml(c.name)}
        ${c.identifierNote ? `<span style="font-size:.85rem;color:#b45309">(${escapeHtml(c.identifierNote)})</span>` : ''}`;

      document.getElementById('cq-mod-meta').innerHTML = `
        <span>📍 ${escapeHtml(c.village || '—')}</span> · 
        <span>📞 ${c.phone ? `<a href="tel:${c.phone}">${c.phone}</a>` : '—'}</span> · 
        <span class="a-badge-pill shop">${escapeHtml(c.shopId)}</span> · 
        <strong style="color:${(c.balance || 0) > 0 ? '#b91c1c' : '#059669'}">${t('outstanding')}: ${inr(c.balance || 0)}</strong>`;

      const bodyEl = document.getElementById('cq-mod-body');

      if (!entries.length) {
        bodyEl.innerHTML = `
          <div style="text-align:center;padding:32px">
            <p class="muted">${isHi ? 'इस ग्राहक के लिए अभी कोई स्वीकृत खाता प्रविष्टि नहीं है।' : 'No approved ledger entries for this customer yet.'}</p>
            <button class="a-page-btn" id="cq-recalc-btn" style="margin-top:12px;background:#092c20;color:#ffffff">
              🔄 ${t('recalcBalance')}
            </button>
          </div>`;
      } else {
        bodyEl.innerHTML = `
          <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
            <button class="a-page-btn" id="cq-recalc-btn" style="background:#092c20;color:#ffffff;font-size:.82rem">
              🔄 ${t('recalcBalance')}
            </button>
          </div>
          <table class="a-table">
            <thead>
              <tr>
                <th>${t('date')}</th>
                <th>${t('item')} & ${t('brand')}</th>
                <th>${t('qty')}</th>
                <th>${t('rate')}</th>
                <th>${isHi ? 'उधार (+)' : 'Credit (+)'}</th>
                <th>${isHi ? 'जमा (−)' : 'Payment (−)'}</th>
                <th>${t('notes')}</th>
              </tr>
            </thead>
            <tbody>
              ${entries.map((e) => {
                const isPayment = e.type === 'payment';
                const itemDesc = e.item || (e.items && e.items[0]?.name) || (isPayment ? (isHi ? 'जमा' : 'Payment') : '—');
                const brand = e.brand || (e.items && e.items[0]?.brand) || '';
                return `
                  <tr>
                    <td style="white-space:nowrap">${new Date(e.date).toLocaleDateString(isHi ? 'hi-IN' : 'en-IN')}</td>
                    <td>
                      <div style="font-weight:700">${escapeHtml(itemDesc)}</div>
                      ${brand ? `<div class="muted" style="font-size:.75rem">${escapeHtml(brand)}</div>` : ''}
                    </td>
                    <td>${e.quantity || '1'}</td>
                    <td>${e.rate ? inr(e.rate) : '—'}</td>
                    <td style="font-weight:800;color:#dc2626">${!isPayment ? inr(e.amount) : '—'}</td>
                    <td style="font-weight:800;color:#059669">${isPayment ? inr(e.amount) : '—'}</td>
                    <td style="font-size:.8rem;color:#64748b">${escapeHtml(e.notes || e.note || '')}</td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>`;
      }

      // Wire Recalculate Balance Button
      const recalcBtn = document.getElementById('cq-recalc-btn');
      if (recalcBtn) {
        recalcBtn.onclick = async () => {
          recalcBtn.disabled = true;
          try {
            const upd = await api(`/customers/${customerId}/recalc`, { method: 'POST' });
            toast(isHi ? `बैलेंस पुनः जाँचा गया: ${inr(upd.customer?.balance || 0)}` : `Balance recalculated: ${inr(upd.customer?.balance || 0)}`);
            openCustomerLedgerModal(customerId);
          } catch (err) { toast(err.message); recalcBtn.disabled = false; }
        };
      }

    } catch (err) {
      document.getElementById('cq-mod-body').innerHTML = `<div style="color:#dc2626;padding:24px">${escapeHtml(err.message)}</div>`;
    }
  }

  // ─── ADMIN: AUDIT LOG & RECYCLE BIN ──────────────────────────────────────────
  async function loadAudit() {
    const el = document.getElementById('a-content');
    const isHi = state.lang === 'hi';

    el.innerHTML = `
      <div class="a-filter-bar">
        <select class="a-select" id="al-shop">
          <option value="all">${t('allShops')}</option>
          <option value="shop1">${isHi ? 'दुकान 1 (Shop 1)' : 'Shop 1'}</option>
          <option value="shop2">${isHi ? 'दुकान 2 (Shop 2)' : 'Shop 2'}</option>
        </select>

        <select class="a-select" id="al-action">
          <option value="all">${isHi ? 'सभी कार्य (All Actions)' : 'All Actions'}</option>
          <option value="entry.approve">✓ ${isHi ? 'प्रविष्टि स्वीकृति (Approve)' : 'Entry Approve'}</option>
          <option value="entry.soft_delete">🗑️ ${isHi ? 'हटाना (Soft Delete)' : 'Soft Delete'}</option>
          <option value="entry.restore">♻️ ${isHi ? 'वापसी (Restore)' : 'Restore'}</option>
          <option value="customer.create">👤 ${isHi ? 'नया ग्राहक (Customer Create)' : 'Customer Create'}</option>
        </select>
      </div>

      <div class="a-table-container">
        <div class="a-table-scroll">
          <div id="al-table-wrap">
            <p class="muted" style="text-align:center;padding:48px">${isHi ? 'ऑडिट लॉग लोड हो रहा है…' : 'Loading audit log…'}</p>
          </div>
        </div>
      </div>`;

    const fetchAudit = async () => {
      const shopId = document.getElementById('al-shop').value;
      const action = document.getElementById('al-action').value;
      const params = new URLSearchParams({ limit: 100 });
      if (shopId !== 'all') params.set('shopId', shopId);
      if (action !== 'all') params.set('action', action);

      const wrap = document.getElementById('al-table-wrap');
      wrap.innerHTML = `<p class="muted" style="text-align:center;padding:48px">${isHi ? 'डेटा लाया जा रहा है…' : 'Fetching…'}</p>`;

      try {
        const res = await api(`/admin/audit?${params}`);
        const logs = res.logs || [];

        if (!logs.length) {
          wrap.innerHTML = `<p class="muted" style="text-align:center;padding:48px">${t('noData')}</p>`;
          return;
        }

        wrap.innerHTML = `
          <table class="a-table">
            <thead>
              <tr>
                <th>${t('time')}</th>
                <th>${t('actions')}</th>
                <th>${isHi ? 'उपयोगकर्ता' : 'User'}</th>
                <th>${t('shop')}</th>
                <th>${isHi ? 'विवरण' : 'Details'}</th>
              </tr>
            </thead>
            <tbody>
              ${logs.map((l) => {
                const actionBadgeClass = l.action.includes('delete') ? 'sale' : l.action.includes('approve') || l.action.includes('restore') ? 'payment' : 'neutral';
                return `
                  <tr>
                    <td style="white-space:nowrap;font-size:.84rem">
                      ${new Date(l.createdAt).toLocaleString(isHi ? 'hi-IN' : 'en-IN')}
                    </td>
                    <td>
                      <span class="a-badge-pill ${actionBadgeClass}">
                        ${escapeHtml(l.action)}
                      </span>
                    </td>
                    <td style="font-weight:700;color:#092c20">
                      ${escapeHtml(l.userId?.username || l.by?.username || 'admin')}
                    </td>
                    <td>
                      <span class="a-badge-pill shop">${escapeHtml(l.shopId || '—')}</span>
                    </td>
                    <td style="font-family:monospace;font-size:.78rem;color:#475569;max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                      ${escapeHtml(JSON.stringify(l.details || l.after || l.reason || {}))}
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>`;

      } catch (err) {
        wrap.innerHTML = `<div style="color:#dc2626;padding:24px">${escapeHtml(err.message)}</div>`;
      }
    };

    document.getElementById('al-shop').onchange = fetchAudit;
    document.getElementById('al-action').onchange = fetchAudit;

    fetchAudit();
  }

  // ─── Expose & Boot ───────────────────────────────────────────────────────────
  g.KhataApp = { route, renderLogin, logout };
  document.addEventListener('DOMContentLoaded', boot);
})(window);
