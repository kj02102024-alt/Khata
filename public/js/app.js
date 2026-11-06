/**
 * Khata SPA v2 — Main App Controller
 * Covers: redesigned login, हिसाब लिखें entry screen, search, admin portal.
 */
(function (g) {
  const { api, getUser, setSession, clearSession, inr, toast, escapeHtml, playChime, sendWhatsAppStatement } = g.KhataAPI;

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
      labour: 'Labour & Payroll',
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
      labour: 'मज़दूर व वेतन (Labour)',
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
            <button class="a-nav-item ${state.adminView === 'labour' ? 'active' : ''}" data-view="labour">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <span>${t('labour')}</span>
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

            <!-- Global Customer Search in Topbar -->
            <div class="a-topbar-search-wrap">
              <div class="a-topbar-search-box">
                <span class="a-search-ico">🔍</span>
                <input type="search" id="a-global-search-input" class="a-topbar-search-input" placeholder="${isHi ? 'ग्राहक खोजें (नाम / गाँव / फ़ोन)...' : 'Search customer (name/village/phone)...'}" autocomplete="off" />
                <button type="button" id="a-global-search-mic" class="a-search-mic-btn" title="${isHi ? 'बोलकर खोजें' : 'Voice search'}">🎤</button>
              </div>
              <div id="a-global-search-results" class="a-search-dropdown hidden"></div>
            </div>

            <div class="a-topbar-actions" id="a-topbar-actions"></div>
          </div>
          <div id="a-content"></div>
          <div id="cq-modal-container"></div>
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
      labour: {
        title: isHi ? 'मज़दूर प्रबंधन व वेतन खाता' : 'Labour & Payroll Management',
        sub: isHi ? 'कारीगरों व स्टाफ की हाज़िरी, एडवांस व वेतन भुगतान का केंद्रीकृत खाता' : 'Centralized Labour Profiles, Advance Tracking & Payroll Ledger',
      },
      audit: {
        title: t('audit'),
        sub: isHi ? 'प्रणाली गतिविधि व रीसायकल बिन' : 'Security Audit Trail & Soft-Delete Trash',
      },
    };

    const currentMeta = viewMeta[state.adminView] || { title: '', sub: '' };
    document.getElementById('a-page-title').textContent = currentMeta.title;
    document.getElementById('a-page-subtitle').textContent = currentMeta.sub;

    // Wire Admin Global Topbar Customer Search
    const searchInput = document.getElementById('a-global-search-input');
    const searchDropdown = document.getElementById('a-global-search-results');
    const searchMic = document.getElementById('a-global-search-mic');
    let searchTimer = null;

    const runAdminSearch = async () => {
      const q = (searchInput?.value || '').trim();
      if (!q) {
        if (searchDropdown) { searchDropdown.innerHTML = ''; searchDropdown.classList.add('hidden'); }
        return;
      }
      try {
        const { customers } = await api(`/customers?q=${encodeURIComponent(q)}&all=1`);
        if (!searchDropdown) return;
        if (!customers || !customers.length) {
          searchDropdown.innerHTML = `<div class="a-search-empty">${isHi ? 'कोई ग्राहक नहीं मिला' : 'No customers found'}</div>`;
          searchDropdown.classList.remove('hidden');
          return;
        }
        searchDropdown.innerHTML = customers.slice(0, 15).map((c) => {
          const isSettled = (c.balance || 0) <= 0;
          return `
            <div class="a-search-item" data-id="${c._id}">
              <div class="asi-main">
                <div class="asi-name">
                  <span class="a-badge-pill shop" style="font-size:.7rem;padding:2px 6px">${escapeHtml(c.shopId)}</span>
                  ${c.diaryNo ? `<span class="asi-diary-no">#${c.diaryNo}</span>` : ''}
                  ${c.honorific ? `${escapeHtml(c.honorific)} ` : ''}<strong>${escapeHtml(c.name)}</strong>
                  ${c.identifierNote ? `<span class="asi-sub">(${escapeHtml(c.identifierNote)})</span>` : ''}
                </div>
                <div class="asi-loc">📍 ${escapeHtml(c.village || '—')}${c.phone ? ' · 📞 ' + escapeHtml(c.phone) : ''}</div>
              </div>
              <div class="asi-bal ${isSettled ? 'asi-settled' : 'asi-owed'}">
                ${isSettled ? (isHi ? 'चुकता ✓' : 'Settled ✓') : inr(c.balance)}
              </div>
            </div>`;
        }).join('');
        searchDropdown.classList.remove('hidden');

        searchDropdown.querySelectorAll('.a-search-item').forEach((item) => {
          item.onclick = (e) => {
            e.stopPropagation();
            searchDropdown.classList.add('hidden');
            if (item.dataset.id) openCustomerLedgerModal(item.dataset.id);
          };
        });
      } catch {
        if (searchDropdown) {
          searchDropdown.innerHTML = `<div class="a-search-empty">${isHi ? 'खोजने में समस्या आई' : 'Search failed'}</div>`;
          searchDropdown.classList.remove('hidden');
        }
      }
    };

    if (searchInput) {
      searchInput.oninput = () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(runAdminSearch, 160);
      };
      searchInput.onfocus = () => {
        if (searchInput.value.trim()) runAdminSearch();
      };
    }

    // Dismiss search dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.a-topbar-search-wrap') && searchDropdown) {
        searchDropdown.classList.add('hidden');
      }
    });

    // Voice mic on admin search
    if (searchMic) {
      searchMic.onclick = async () => {
        if (!window.VoiceEngine) { toast(isHi ? 'आवाज़ समर्थित नहीं है' : 'Voice not supported'); return; }
        searchMic.classList.add('mic-pulsing');
        const eng = new window.VoiceEngine({ silenceMs: 2500 });
        try {
          const spoken = await eng.listenOnce(5000);
          if (spoken && searchInput) {
            searchInput.value = spoken;
            runAdminSearch();
          }
        } catch {}
        searchMic.classList.remove('mic-pulsing');
      };
    }

    // Route to active view loader
    if (state.adminView === 'overview') loadOverview();
    else if (state.adminView === 'review') loadReviewQueue();
    else if (state.adminView === 'ledger') loadLedger();
    else if (state.adminView === 'customers') loadCustomers();
    else if (state.adminView === 'labour') loadLabour();
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
                      ${c._id ? `<a href="#" class="lf-cust-link" data-id="${c._id}" style="font-weight:700;color:#092c20;text-decoration:none;display:inline-flex;align-items:center;gap:3px">${escapeHtml(custName)} <span style="font-size:.7rem;color:#059669">↗</span></a>` : `<div style="font-weight:700;color:#092c20">${escapeHtml(custName)}</div>`}
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

        // Wire Click on Customer Name to open Passbook Modal
        wrap.querySelectorAll('.lf-cust-link').forEach((link) => {
          link.onclick = (e) => {
            e.preventDefault();
            const id = link.dataset.id;
            if (id) openCustomerLedgerModal(id);
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
        <div class="a-modal-card pb-admin-modal-card" style="max-width:960px;width:95%">
          <div class="a-modal-header" style="background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:16px 20px">
            <div>
              <h3 style="margin:0;font-size:1.3rem;font-weight:800;color:#092c20" id="cq-mod-name">${isHi ? 'ग्राहक खाता बही (Passbook)' : 'Customer Ledger Passbook'}</h3>
              <p style="margin:2px 0 0;font-size:.85rem;color:#64748b" id="cq-mod-meta">${isHi ? 'विवरण लोड हो रहा है…' : 'Loading details…'}</p>
            </div>
            <button class="a-page-btn" id="cq-mod-close" style="font-size:1.2rem;padding:4px 12px">✕</button>
          </div>
          <div class="a-modal-body" id="cq-mod-body" style="padding:20px">
            <p class="muted" style="text-align:center;padding:48px">${isHi ? 'बहीखाता प्रविष्टियाँ लोड हो रही हैं…' : 'Loading ledger history…'}</p>
          </div>
          <div id="cq-submodal-container"></div>
        </div>
      </div>`;

    const closeMainModal = () => { container.innerHTML = ''; };
    document.getElementById('cq-mod-close').onclick = closeMainModal;
    document.getElementById('cq-modal-backdrop').onclick = (e) => {
      if (e.target.id === 'cq-modal-backdrop') closeMainModal();
    };

    try {
      const res = await api(`/customers/${customerId}`);
      const c = res.customer || {};
      const entries = res.entries || [];

      // Chronological running balance calculation (oldest -> newest)
      const sortedChrono = [...entries].sort((a, b) => {
        const da = new Date(a.date || a.createdAt || 0).getTime();
        const db = new Date(b.date || b.createdAt || 0).getTime();
        return da - db;
      });

      let running = 0;
      sortedChrono.forEach((e) => {
        if (e.type === 'payment') {
          running -= (Number(e.amount) || 0);
        } else {
          running += (Number(e.amount) || 0);
        }
        e.runningBalance = running;
      });

      // Display newest transactions first
      const displayEntries = [...sortedChrono].reverse();

      const isSettled = (c.balance || 0) <= 0;

      document.getElementById('cq-mod-name').innerHTML = `
        <span class="a-circle-no" style="margin-right:6px">#${c.diaryNo || '—'}</span>
        ${c.honorific ? `${escapeHtml(c.honorific)} ` : ''}${escapeHtml(c.name)}
        ${c.identifierNote ? `<span style="font-size:.9rem;color:#b45309">(${escapeHtml(c.identifierNote)})</span>` : ''}`;

      document.getElementById('cq-mod-meta').innerHTML = `
        <span>📍 ${escapeHtml(c.village || '—')}</span> · 
        <span>📞 ${c.phone ? `<a href="tel:${c.phone}">${c.phone}</a>` : '—'}</span> · 
        <span class="a-badge-pill shop">${escapeHtml(c.shopId)}</span>`;

      const bodyEl = document.getElementById('cq-mod-body');

      bodyEl.innerHTML = `
        <!-- Net Balance Banner & Header Actions -->
        <div style="background:linear-gradient(135deg, #092c20, #0f4a36);color:white;border-radius:14px;padding:18px 22px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px">
          <div>
            <div style="font-size:.85rem;color:rgba(255,255,255,.8);text-transform:uppercase;letter-spacing:1px;font-weight:700">
              ${isHi ? 'कुल बाकी हिसाब (Net Balance)' : 'Total Outstanding Balance'}
            </div>
            <div style="font-size:2rem;font-weight:900;letter-spacing:-0.5px;margin-top:2px;color:${isSettled ? '#86efac' : '#fca5a5'}">
              ${inr(c.balance || 0)}
            </div>
            <div style="font-size:.85rem;color:rgba(255,255,255,.85);margin-top:2px">
              ${isSettled ? (isHi ? 'खाता चुकता है ✓' : 'Account Settled ✓') : (isHi ? 'भुगतान शेष है ⚠️' : 'Payment Pending')}
            </div>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="a-page-btn" id="cq-share-wa" style="background:#25D366;color:#ffffff;font-weight:800;font-size:.9rem;padding:10px 16px;border:none">
              📲 ${isHi ? 'WhatsApp पर हिसाब भेजें' : 'Send WhatsApp Statement'}
            </button>
            <button class="a-page-btn" id="cq-recalc-btn" style="background:rgba(255,255,255,.15);color:#ffffff;border:1px solid rgba(255,255,255,.3);font-size:.85rem;padding:10px 14px">
              🔄 ${t('recalcBalance')}
            </button>
          </div>
        </div>

        <!-- Two Large Prominent Buttons: - उधार & + जमा -->
        <div class="passbook-action-dock" style="margin-bottom:20px;grid-template-columns:1fr 1fr">
          <button class="pb-dock-btn pb-dock-udaar" type="button" id="cq-open-udaar" style="min-height:64px">
            <span class="dock-btn-icon">🔴 ✍️</span>
            <span class="dock-btn-label">− ${isHi ? 'उधार' : 'Debit'}</span>
            <span class="dock-btn-hint">${isHi ? 'सामान दिया (Debit)' : 'Add Credit Sale'}</span>
          </button>
          <button class="pb-dock-btn pb-dock-jama" type="button" id="cq-open-jama" style="min-height:64px">
            <span class="dock-btn-icon">🟢 💰</span>
            <span class="dock-btn-label">+ ${isHi ? 'जमा' : 'Credit'}</span>
            <span class="dock-btn-hint">${isHi ? 'पैसा मिला (Credit)' : 'Receive Payment'}</span>
          </button>
        </div>

        <!-- Passbook Entries Table -->
        ${!displayEntries.length ? `
          <div style="text-align:center;padding:40px 20px;background:#f8fafc;border-radius:12px;border:1px dashed #cbd5e1">
            <div style="font-size:2.5rem;margin-bottom:6px">📖</div>
            <p class="muted" style="margin:0;font-size:.95rem">${isHi ? 'इस ग्राहक के लिए अभी कोई स्वीकृत खाता प्रविष्टि नहीं है।' : 'No approved ledger entries for this customer yet.'}</p>
          </div>
        ` : `
          <div style="overflow-x:auto">
            <table class="a-table">
              <thead>
                <tr>
                  <th>${t('date')}</th>
                  <th>${t('item')} & ${t('brand')}</th>
                  <th>${t('qty')}</th>
                  <th>${t('rate')}</th>
                  <th>${isHi ? 'उधार (+)' : 'Credit (+)'}</th>
                  <th>${isHi ? 'जमा (−)' : 'Payment (−)'}</th>
                  <th style="background:#f1f5f9;font-weight:800">${isHi ? 'बचा बाकी' : 'Running Bal'}</th>
                  <th>${t('notes')}</th>
                </tr>
              </thead>
              <tbody>
                ${displayEntries.map((e) => {
                  const isPayment = e.type === 'payment';
                  const itemDesc = e.item || (e.items && e.items[0]?.name) || (isPayment ? (isHi ? 'जमा भुगतान' : 'Payment') : '—');
                  const brand = e.brand || (e.items && e.items[0]?.brand) || '';
                  return `
                    <tr>
                      <td style="white-space:nowrap;font-weight:600">
                        <div>${new Date(e.date).toLocaleDateString(isHi ? 'hi-IN' : 'en-IN')}</div>
                        ${e.entryTime ? `<div class="muted" style="font-size:.75rem">${new Date(e.entryTime).toLocaleTimeString(isHi ? 'hi-IN' : 'en-IN', { hour: '2-digit', minute: '2-digit' })}</div>` : ''}
                      </td>
                      <td>
                        <div style="font-weight:700;color:#092c20">${escapeHtml(itemDesc)}</div>
                        ${brand ? `<div class="muted" style="font-size:.75rem">${escapeHtml(brand)}</div>` : ''}
                        ${e.dueDate ? `<div style="font-size:.72rem;color:#b45309;margin-top:2px">⏰ ${new Date(e.dueDate).toLocaleDateString(isHi ? 'hi-IN' : 'en-IN')}${e.dueDateNote ? ' (' + escapeHtml(e.dueDateNote) + ')' : ''}</div>` : ''}
                      </td>
                      <td>${e.quantity || '1'}</td>
                      <td>${e.rate ? inr(e.rate) : '—'}</td>
                      <td style="font-weight:800;color:#dc2626">${!isPayment ? `+${inr(e.amount)}` : '—'}</td>
                      <td style="font-weight:800;color:#059669">${isPayment ? `−${inr(e.amount)}` : '—'}</td>
                      <td style="font-weight:800;background:#f8fafc;color:#092c20">
                        <span style="font-size:.95rem">${inr(e.runningBalance)}</span>
                      </td>
                      <td style="font-size:.8rem;color:#64748b">${escapeHtml(e.notes || e.note || '')}</td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        `}`;

      // Wire WhatsApp Button
      document.getElementById('cq-share-wa').onclick = () => {
        sendWhatsAppStatement(c, displayEntries, `Admin (${c.shopId})`);
      };

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

      // ── Submodal helper for In-Modal Udaar & Jama in Admin ──
      const submodalContainer = document.getElementById('cq-submodal-container');

      // Wire Quick Udaar — Structured Multi-Item Form
      document.getElementById('cq-open-udaar').onclick = () => {
        const ADMIN_ITEM_CHIPS = ['साड़ी', 'सूटिंग', 'पर्दा', 'गद्दा', 'रुई/कपास', 'कंबल', 'पैंट-शर्ट', 'चादर', 'तौलिया', 'अन्य'];
        const ADMIN_UNIT_CHIPS = ['पीस', 'मीटर', 'जोड़ी', 'सेट'];
        let adminItems = [{ name: '', brand: '', qty: 1, unit: 'पीस', rate: '', amount: '' }];
        let adminDueDateDays = null;
        let adminDueDateCustom = '';

        // ── Render one item block HTML ──
        const renderAdminItemBlock = (it, idx) => `
          <div class="item-block cq-item-block" data-idx="${idx}" style="background:#fff5f5;border:1.5px solid #fecaca;border-radius:12px;padding:12px;margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <span style="font-weight:800;color:#991b1b;font-size:.95rem">सामान ${adminItems.length > 1 ? idx + 1 : ''}</span>
              ${adminItems.length > 1 ? `<button type="button" class="cq-item-del" data-del="${idx}" style="background:none;border:none;color:#dc2626;font-size:1rem;cursor:pointer">🗑 हटाएँ</button>` : ''}
            </div>
            <!-- Item Name Chips -->
            <div class="chip-row cq-item-chips" data-idx="${idx}" style="margin-bottom:6px">
              ${ADMIN_ITEM_CHIPS.map((chip) => `<button class="chip ${it.name === chip ? 'chip--on' : ''}" type="button" data-item="${escapeHtml(chip)}">${escapeHtml(chip)}</button>`).join('')}
            </div>
            <!-- Item Name Input -->
            <div class="entry-field-row">
              <label style="font-weight:700;font-size:.82rem;color:#374151;display:block;margin-bottom:3px">सामान का नाम</label>
              <div class="entry-input-wrap">
                <input class="entry-input cq-item-name" data-idx="${idx}" type="text" lang="hi" autocomplete="off"
                       value="${escapeHtml(it.name)}" placeholder="जैसे साड़ी, गद्दा" />
                <button class="field-mic cq-field-mic" type="button" data-cqfield="name-${idx}">🎤</button>
              </div>
            </div>
            <!-- Brand -->
            <div class="entry-field-row">
              <label style="font-weight:700;font-size:.82rem;color:#374151;display:block;margin-bottom:3px">ब्रांड / कंपनी</label>
              <div class="entry-input-wrap">
                <input class="entry-input cq-item-brand" data-idx="${idx}" type="text" lang="hi" autocomplete="off"
                       value="${escapeHtml(it.brand)}" placeholder="जैसे Raymond, Siyaram" />
                <button class="field-mic cq-field-mic" type="button" data-cqfield="brand-${idx}">🎤</button>
              </div>
            </div>
            <!-- Qty + Unit -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px">
              <div>
                <label style="font-weight:700;font-size:.82rem;color:#374151;display:block;margin-bottom:3px">मात्रा</label>
                <div class="qty-stepper">
                  <button class="qty-btn cq-qty-btn" type="button" data-step="-0.5" data-idx="${idx}">−</button>
                  <input class="entry-input cq-item-qty" data-idx="${idx}" type="number" inputmode="decimal"
                         value="${it.qty}" min="0.5" step="0.5" style="width:60px;text-align:center" />
                  <button class="qty-btn cq-qty-btn" type="button" data-step="0.5" data-idx="${idx}">+</button>
                </div>
                <div class="chip-row cq-unit-chips" data-idx="${idx}" style="margin-top:5px">
                  ${ADMIN_UNIT_CHIPS.map((u) => `<button class="chip ${it.unit === u ? 'chip--on' : ''}" type="button" data-unit="${u}">${u}</button>`).join('')}
                </div>
              </div>
              <div>
                <label style="font-weight:700;font-size:.82rem;color:#374151;display:block;margin-bottom:3px">रेट (प्रति इकाई) ₹</label>
                <div class="entry-input-wrap">
                  <input class="entry-input cq-item-rate" data-idx="${idx}" type="number" inputmode="numeric"
                         value="${it.rate || ''}" placeholder="₹" />
                  <button class="field-mic cq-field-mic" type="button" data-cqfield="rate-${idx}">🎤</button>
                </div>
              </div>
            </div>
            <!-- Amount -->
            <div class="entry-field-row" style="margin-top:4px">
              <label style="font-weight:700;font-size:.82rem;color:#374151;display:block;margin-bottom:3px">
                रकम ₹ <span style="color:#dc2626">*</span>
                <span style="font-size:.72rem;color:#64748b">(qty × rate से auto)</span>
              </label>
              <div class="entry-input-wrap">
                <input class="entry-input cq-item-amount" data-idx="${idx}" type="number" inputmode="numeric"
                       value="${it.amount || ''}" placeholder="₹" />
                <button class="field-mic cq-field-mic" type="button" data-cqfield="amount-${idx}">🎤</button>
              </div>
            </div>
          </div>`;

        // ── Grand total ──
        const updateAdminGrandTotal = () => {
          const total = adminItems.reduce((s, it) => s + (Number(it.amount) || 0), 0);
          const el = document.getElementById('cq-grand-total');
          if (el) el.textContent = total > 0 ? `कुल उधार बिल: ₹${total.toLocaleString('hi-IN')}` : 'कुल उधार बिल: ₹—';
          const saveBtn = document.getElementById('cq-sub-save');
          if (saveBtn) saveBtn.textContent = `✓ ${isHi ? 'उधार जोड़ें' : 'Save Debit'}${total > 0 ? ' (₹' + total.toLocaleString('hi-IN') + ')' : ''}`;
        };

        // ── Auto compute amount ──
        const autoAdminAmount = (idx) => {
          const it = adminItems[idx];
          const r = Number(it.rate) || 0;
          const q = Number(it.qty) || 1;
          if (r > 0) {
            it.amount = Math.round(q * r);
            const inp = submodalContainer.querySelector(`.cq-item-amount[data-idx="${idx}"]`);
            if (inp) inp.value = it.amount;
          }
          updateAdminGrandTotal();
        };

        // ── Mic tracker ──
        let _cqActiveMic = null;
        const stopCQMic = () => { if (_cqActiveMic) { try { _cqActiveMic.cancel(); } catch {} _cqActiveMic = null; } };

        const startAdminItemMic = (cqfield, btnEl) => {
          stopCQMic();
          if (!window.VoiceEngine) { toast('आवाज़ उपलब्ध नहीं'); return; }
          const engine = new window.VoiceEngine({ silenceMs: 2000 });
          _cqActiveMic = engine;
          btnEl.textContent = '⏹'; btnEl.classList.add('mic-active');
          const m = cqfield.match(/^(\w+)-(\d+)$/);
          if (!m) return;
          const [, sub, idxStr] = m;
          const idx = Number(idxStr);
          const inp = submodalContainer.querySelector(`.cq-item-${sub}[data-idx="${idx}"]`);
          engine.onPartial = (p) => { if (inp && p) { inp.value = p; inp.classList.add('mic-live-transcribing'); } };
          engine.onComplete = (text) => {
            if (inp) inp.classList.remove('mic-live-transcribing');
            btnEl.textContent = '🎤'; btnEl.classList.remove('mic-active');
            let val = text.trim();
            if (sub === 'rate' || sub === 'amount') val = val.replace(/[^\d.]/g, '');
            if (inp) inp.value = val;
            adminItems[idx][sub] = (sub === 'qty' || sub === 'rate' || sub === 'amount') ? (Number(val) || 0) : val;
            if (sub === 'qty' || sub === 'rate') autoAdminAmount(idx);
            else updateAdminGrandTotal();
            stopCQMic();
          };
          engine.onError = () => { btnEl.textContent = '🎤'; btnEl.classList.remove('mic-active'); stopCQMic(); };
          btnEl.onclick = () => { engine.done(); btnEl.textContent = '🎤'; btnEl.classList.remove('mic-active'); btnEl.onclick = () => startAdminItemMic(cqfield, btnEl); };
          if (engine.supported) engine.start();
          else toast('आवाज़ उपलब्ध नहीं');
        };

        // ── Wire item events ──
        const wireAdminItemEvents = () => {
          const sc = submodalContainer;
          sc.querySelectorAll('.cq-item-chips .chip').forEach((btn) => {
            const idx = Number(btn.closest('[data-idx]').dataset.idx);
            btn.onclick = () => {
              sc.querySelectorAll(`.cq-item-chips[data-idx="${idx}"] .chip`).forEach((b) => b.classList.remove('chip--on'));
              btn.classList.add('chip--on');
              const nameInp = sc.querySelector(`.cq-item-name[data-idx="${idx}"]`);
              if (btn.dataset.item === 'अन्य') {
                adminItems[idx].name = '';
                if (nameInp) { nameInp.value = ''; nameInp.placeholder = 'सामान का नाम लिखें…'; nameInp.style.borderColor = '#d97706'; nameInp.style.background = '#fffbeb'; nameInp.focus(); }
              } else {
                adminItems[idx].name = btn.dataset.item;
                if (nameInp) { nameInp.value = btn.dataset.item; nameInp.placeholder = 'जैसे साड़ी, गद्दा'; nameInp.style.borderColor = ''; nameInp.style.background = ''; }
              }
              updateAdminGrandTotal();
            };
          });
          sc.querySelectorAll('.cq-unit-chips .chip').forEach((btn) => {
            const idx = Number(btn.closest('[data-idx]').dataset.idx);
            btn.onclick = () => {
              adminItems[idx].unit = btn.dataset.unit;
              sc.querySelectorAll(`.cq-unit-chips[data-idx="${idx}"] .chip`).forEach((b) => b.classList.remove('chip--on'));
              btn.classList.add('chip--on');
            };
          });
          sc.querySelectorAll('.cq-item-name').forEach((inp) => {
            const idx = Number(inp.dataset.idx);
            inp.oninput = () => { adminItems[idx].name = inp.value; if (inp.value.trim()) { inp.style.borderColor = ''; inp.style.background = ''; } updateAdminGrandTotal(); };
          });
          sc.querySelectorAll('.cq-item-brand').forEach((inp) => {
            const idx = Number(inp.dataset.idx); inp.oninput = () => { adminItems[idx].brand = inp.value; };
          });
          sc.querySelectorAll('.cq-qty-btn').forEach((btn) => {
            const idx = Number(btn.dataset.idx);
            btn.onclick = () => {
              adminItems[idx].qty = Math.max(0.5, (Number(adminItems[idx].qty) || 1) + Number(btn.dataset.step));
              const inp = sc.querySelector(`.cq-item-qty[data-idx="${idx}"]`);
              if (inp) inp.value = adminItems[idx].qty;
              autoAdminAmount(idx);
            };
          });
          sc.querySelectorAll('.cq-item-qty').forEach((inp) => {
            const idx = Number(inp.dataset.idx); inp.oninput = () => { adminItems[idx].qty = Number(inp.value) || 1; autoAdminAmount(idx); };
          });
          sc.querySelectorAll('.cq-item-rate').forEach((inp) => {
            const idx = Number(inp.dataset.idx); inp.oninput = () => { adminItems[idx].rate = Number(inp.value) || 0; autoAdminAmount(idx); };
          });
          sc.querySelectorAll('.cq-item-amount').forEach((inp) => {
            const idx = Number(inp.dataset.idx); inp.oninput = () => { adminItems[idx].amount = Number(inp.value) || 0; updateAdminGrandTotal(); };
          });
          sc.querySelectorAll('.cq-item-del').forEach((btn) => {
            const idx = Number(btn.dataset.del);
            btn.onclick = () => { if (adminItems.length > 1) { adminItems.splice(idx, 1); renderAllAdminItems(); } };
          });
          sc.querySelectorAll('.cq-field-mic').forEach((btn) => {
            btn.onclick = () => startAdminItemMic(btn.dataset.cqfield, btn);
          });
        };

        const renderAllAdminItems = () => {
          const container = submodalContainer.querySelector('#cq-items-container');
          if (!container) return;
          container.innerHTML = adminItems.map((it, idx) => renderAdminItemBlock(it, idx)).join('');
          wireAdminItemEvents();
          updateAdminGrandTotal();
        };

        submodalContainer.innerHTML = `
          <div class="a-modal-backdrop" id="cq-sub-backdrop" style="z-index:1100">
            <div class="a-modal-card" style="max-width:520px;max-height:92vh;display:flex;flex-direction:column;overflow:hidden">
              <div class="a-modal-header" style="background:#fee2e2;border-bottom:1.5px solid #fecaca;flex-shrink:0">
                <div>
                  <h3 style="margin:0;font-size:1.1rem;font-weight:800;color:#991b1b">🔴 ${isHi ? 'नया उधार दर्ज करें' : 'New Debit Entry'}</h3>
                  <div style="font-size:.8rem;color:#7f1d1d;margin-top:1px">${escapeHtml(c.name)} · ${escapeHtml(c.village || '')}</div>
                </div>
                <button class="a-page-btn" id="cq-sub-close">✕</button>
              </div>

              <!-- Grand Total Banner -->
              <div id="cq-grand-total" style="background:#fef2f2;border-bottom:2px solid #fecaca;padding:10px 16px;text-align:center;font-size:1.05rem;font-weight:900;color:#991b1b;flex-shrink:0">
                कुल उधार बिल: ₹—
              </div>

              <!-- Scrollable body -->
              <div class="a-modal-body" id="cq-sub-body" style="padding:12px 16px;overflow-y:auto;flex:1">
                <!-- Items Container -->
                <div id="cq-items-container"></div>
                <!-- Add Another Item -->
                <button type="button" id="cq-add-item-btn" class="btn-add-item" style="margin-bottom:14px">
                  ➕ एक और सामान जोड़ें
                </button>
                <!-- Due Date -->
                <div style="margin-bottom:12px">
                  <label style="font-weight:700;font-size:.85rem;color:#0f172a;display:block;margin-bottom:5px">⏰ ${isHi ? 'कब तक देंगे? (Due Date)' : 'Due Date'}</label>
                  <div class="chip-row" id="cq-sub-due-chips">
                    <button type="button" class="chip chip--on" data-days="none">${isHi ? 'तय नहीं' : 'None'}</button>
                    <button type="button" class="chip" data-days="7">7 ${isHi ? 'दिन' : 'days'}</button>
                    <button type="button" class="chip" data-days="15">15 ${isHi ? 'दिन' : 'days'}</button>
                    <button type="button" class="chip" data-days="30">1 ${isHi ? 'महीना' : 'month'}</button>
                    <button type="button" class="chip" data-days="custom">${isHi ? 'तारीख चुनें' : 'Pick Date'}</button>
                  </div>
                  <div id="cq-due-date-wrap" style="margin-top:6px;display:none">
                    <input type="date" id="cq-due-date-input" class="entry-input" />
                  </div>
                </div>
                <!-- Notes -->
                <div style="margin-bottom:12px">
                  <label style="font-weight:700;font-size:.82rem;color:#64748b;display:block;margin-bottom:4px">${isHi ? 'नोट / विवरण' : 'Notes'}</label>
                  <input type="text" id="cq-sub-note" class="entry-input" placeholder="${isHi ? 'वैकल्पिक विवरण...' : 'Optional notes...'}" />
                </div>
              </div>

              <!-- Footer Buttons -->
              <div style="padding:10px 14px;border-top:1.5px solid #fecaca;display:flex;gap:10px;flex-shrink:0;background:#fff">
                <button type="button" id="cq-sub-cancel" class="a-page-btn" style="flex:1;padding:11px;background:#f1f5f9;color:#475569">
                  ${isHi ? 'रद्द करें' : 'Cancel'}
                </button>
                <button type="button" id="cq-sub-save" class="a-page-btn" style="flex:2;padding:11px;background:#dc2626;color:#ffffff;font-weight:800">
                  ✓ ${isHi ? 'उधार जोड़ें' : 'Save Debit'}
                </button>
              </div>
            </div>
          </div>`;

        // Initial render
        renderAllAdminItems();

        const closeSub = () => { stopCQMic(); submodalContainer.innerHTML = ''; };
        document.getElementById('cq-sub-close').onclick = closeSub;
        document.getElementById('cq-sub-cancel').onclick = closeSub;
        document.getElementById('cq-sub-backdrop').onclick = (e) => { if (e.target.id === 'cq-sub-backdrop') closeSub(); };

        // Add Another Item
        document.getElementById('cq-add-item-btn').onclick = () => {
          adminItems.push({ name: '', brand: '', qty: 1, unit: 'पीस', rate: '', amount: '' });
          renderAllAdminItems();
          const body = document.getElementById('cq-sub-body');
          if (body) setTimeout(() => { body.scrollTop = body.scrollHeight; }, 50);
        };

        // Due Date Chips
        const dueDateWrap = document.getElementById('cq-due-date-wrap');
        const dueDateInput = document.getElementById('cq-due-date-input');
        document.querySelectorAll('#cq-sub-due-chips button').forEach((btn) => {
          btn.onclick = () => {
            document.querySelectorAll('#cq-sub-due-chips button').forEach((b) => b.classList.remove('chip--on'));
            btn.classList.add('chip--on');
            const dVal = btn.dataset.days;
            if (dVal === 'none') { adminDueDateDays = null; adminDueDateCustom = ''; dueDateWrap.style.display = 'none'; }
            else if (dVal === 'custom') { adminDueDateDays = null; dueDateWrap.style.display = 'block'; dueDateInput.focus(); }
            else { adminDueDateDays = Number(dVal); adminDueDateCustom = ''; dueDateWrap.style.display = 'none'; }
          };
        });

        // Save
        document.getElementById('cq-sub-save').onclick = async () => {
          const validItems = adminItems.filter((it) => (it.name || '').trim() && Number(it.amount) > 0);
          if (!validItems.length) {
            toast(isHi ? 'कृपया कम से कम एक सामान का नाम और रकम भरें' : 'Please fill item name and amount');
            return;
          }
          const totalAmt = validItems.reduce((s, it) => s + (Number(it.amount) || 0), 0);
          if (totalAmt <= 0) { toast(isHi ? 'कृपया सही उधार रकम डालें' : 'Enter valid amount'); return; }

          const finalItemStr = validItems.map((it) => `${it.name}${Number(it.qty) > 1 ? ` (${it.qty} ${it.unit})` : ''}`).join(', ');

          let dueDate = null; let dueDateNote = '';
          if (dueDateWrap.style.display !== 'none' && dueDateInput.value) {
            dueDate = dueDateInput.value; dueDateNote = isHi ? 'तारीख तय' : 'Date set';
          } else if (adminDueDateDays) {
            dueDate = new Date(Date.now() + adminDueDateDays * 86400000).toISOString().slice(0, 10);
            dueDateNote = `${adminDueDateDays} ${isHi ? 'दिन में' : 'days'}`;
          }

          const note = (document.getElementById('cq-sub-note')?.value || '').trim();
          const saveBtn = document.getElementById('cq-sub-save');
          saveBtn.disabled = true;
          try {
            await api('/entries', {
              method: 'POST',
              body: {
                customerId: c._id,
                shopId: c.shopId,
                type: 'sale',
                amount: totalAmt,
                item: finalItemStr,
                items: validItems.map((it) => ({
                  name: it.name, brand: it.brand || '',
                  qty: Number(it.qty) || 1, unit: it.unit || 'पीस',
                  rate: Number(it.rate) || 0, amount: Number(it.amount) || 0,
                })),
                dueDate: dueDate || undefined,
                dueDateNote: dueDateNote || undefined,
                note, notes: note,
                enteredVia: 'admin-passbook-multi-item',
              },
            });
            playChime();
            toast(isHi ? `✅ उधार ₹${totalAmt.toLocaleString('hi-IN')} (${finalItemStr}) दर्ज हुआ!` : `✅ Debit ₹${totalAmt.toLocaleString('en-IN')} recorded!`);
            closeSub();
            openCustomerLedgerModal(customerId);
          } catch (err) {
            toast(err.message);
            saveBtn.disabled = false;
            updateAdminGrandTotal();
          }
        };
      };

      // Wire Quick Jama
      document.getElementById('cq-open-jama').onclick = () => {
        const curBal = Number(c.balance || 0);
        let selectedMode = 'cash';

        submodalContainer.innerHTML = `
          <div class="a-modal-backdrop" id="cq-sub-backdrop" style="z-index:1100">
            <div class="a-modal-card" style="max-width:500px">
              <div class="a-modal-header" style="background:#dcfce7;border-bottom:1px solid #bbf7d0">
                <h3 style="margin:0;font-size:1.15rem;font-weight:800;color:#166534">🟢 जमा राशि दर्ज करें (Credit Payment)</h3>
                <button class="a-page-btn" id="cq-sub-close">✕</button>
              </div>
              <div class="a-modal-body" style="padding:16px 20px">
                <!-- Voice Mic -->
                <div class="pb-quick-voice-wrap">
                  <button type="button" class="pb-quick-mic-btn pb-mic--jama" id="cq-sub-mic">
                    <span class="pb-qmic-icon">🎤</span>
                    <span id="cq-sub-mic-label">${isHi ? 'बोलकर भरें (जैसे: 500 नकद जमा)' : 'Voice Input (e.g. 500 cash)'}</span>
                  </button>
                  <div id="cq-sub-transcript" class="pb-mic-transcript hidden"></div>
                </div>

                <div style="margin-top:14px">
                  <label style="font-weight:700;font-size:.85rem;color:#0f172a;display:block;margin-bottom:6px">
                    ${isHi ? 'त्वरित रकम चुनें' : 'Quick Amount Presets'}:
                  </label>
                  <div class="chip-row" id="cq-sub-amt-chips">
                    ${curBal > 0 ? `<button type="button" class="chip chip--on" data-amt="${curBal}">${isHi ? 'पूरा चुकता' : 'Full Settle'} (${inr(curBal)})</button>` : ''}
                    <button type="button" class="chip" data-amt="500">₹500</button>
                    <button type="button" class="chip" data-amt="1000">₹1,000</button>
                    <button type="button" class="chip" data-amt="2000">₹2,000</button>
                  </div>
                </div>

                <div style="margin-top:14px">
                  <label style="font-weight:700;font-size:.88rem;color:#0f172a;display:block;margin-bottom:6px">
                    ${isHi ? 'जमा रकम (Amount)' : 'Payment Amount'} <span style="color:#dc2626">*</span>
                  </label>
                  <div class="pb-amt-input-wrap">
                    <span class="pb-rupee-sign" style="color:#059669">₹</span>
                    <input type="number" id="cq-sub-amt" class="pb-amt-input" value="${curBal > 0 ? curBal : ''}" placeholder="0" autofocus />
                  </div>
                </div>

                <div style="margin-top:14px">
                  <label style="font-weight:700;font-size:.88rem;color:#0f172a;display:block;margin-bottom:6px">
                    ${isHi ? 'माध्यम (Payment Mode)' : 'Mode'}
                  </label>
                  <div class="chip-row" id="cq-sub-mode-chips">
                    <button type="button" class="chip chip--on" data-mode="cash">💵 ${isHi ? 'नकद' : 'Cash'}</button>
                    <button type="button" class="chip" data-mode="upi">📱 UPI / PhonePe</button>
                    <button type="button" class="chip" data-mode="bank">🏦 Bank</button>
                  </div>
                </div>

                <div style="margin-top:14px">
                  <label style="font-weight:700;font-size:.85rem;color:#64748b;display:block;margin-bottom:4px">
                    ${isHi ? 'नोट / विवरण' : 'Notes'}
                  </label>
                  <input type="text" id="cq-sub-note" class="entry-input" placeholder="Optional notes..." />
                </div>

                <div style="margin-top:20px;display:flex;gap:10px">
                  <button type="button" id="cq-sub-cancel" class="a-page-btn" style="flex:1;padding:12px;background:#f1f5f9;color:#475569">
                    ${isHi ? 'रद्द करें' : 'Cancel'}
                  </button>
                  <button type="button" id="cq-sub-save" class="a-page-btn" style="flex:2;padding:12px;background:#059669;color:#ffffff;font-weight:800">
                    ✓ ${isHi ? 'जमा दर्ज करें' : 'Save Payment'}
                  </button>
                </div>
              </div>
            </div>
          </div>`;

        const closeSub = () => { submodalContainer.innerHTML = ''; };
        document.getElementById('cq-sub-close').onclick = closeSub;
        document.getElementById('cq-sub-cancel').onclick = closeSub;
        document.getElementById('cq-sub-backdrop').onclick = (e) => { if (e.target.id === 'cq-sub-backdrop') closeSub(); };

        // Presets
        document.querySelectorAll('#cq-sub-amt-chips button').forEach((btn) => {
          btn.onclick = () => {
            document.querySelectorAll('#cq-sub-amt-chips button').forEach((b) => b.classList.remove('chip--on'));
            btn.classList.add('chip--on');
            document.getElementById('cq-sub-amt').value = btn.dataset.amt;
          };
        });

        // Modes
        document.querySelectorAll('#cq-sub-mode-chips button').forEach((btn) => {
          btn.onclick = () => {
            document.querySelectorAll('#cq-sub-mode-chips button').forEach((b) => b.classList.remove('chip--on'));
            btn.classList.add('chip--on');
            selectedMode = btn.dataset.mode;
          };
        });

        // Mic
        const subMic = document.getElementById('cq-sub-mic');
        const subTranscript = document.getElementById('cq-sub-transcript');
        if (subMic) {
          subMic.onclick = async () => {
            if (!window.VoiceEngine) return;
            subMic.classList.add('mic-pulsing');
            subTranscript.classList.remove('hidden');
            subTranscript.textContent = isHi ? 'सुन रहे हैं...' : 'Listening...';
            const eng = new window.VoiceEngine({ silenceMs: 2500 });
            eng.onPartial = (p) => { if (p) subTranscript.textContent = p; };
            try {
              const spoken = await eng.listenOnce(6000);
              if (spoken) {
                subTranscript.textContent = `"${spoken}"`;
                try {
                  const { parsed } = await api('/entries/parse-speech', { method: 'POST', body: { text: spoken } });
                  if (parsed && parsed.amount) document.getElementById('cq-sub-amt').value = parsed.amount;
                } catch {}
              }
            } catch {}
            subMic.classList.remove('mic-pulsing');
          };
        }

        // Save
        document.getElementById('cq-sub-save').onclick = async () => {
          const amt = Number(document.getElementById('cq-sub-amt').value);
          if (!amt || amt <= 0) {
            toast(isHi ? 'कृपया सही जमा रकम डालें' : 'Please enter valid amount');
            return;
          }
          const note = document.getElementById('cq-sub-note').value.trim();

          const saveBtn = document.getElementById('cq-sub-save');
          saveBtn.disabled = true;
          try {
            await api('/entries', {
              method: 'POST',
              body: {
                customerId: c._id,
                shopId: c.shopId,
                type: 'payment',
                amount: amt,
                paymentMode: selectedMode,
                note,
                notes: note,
                enteredVia: 'admin-passbook-quick',
              },
            });
            playChime();
            toast(isHi ? `जमा ${inr(amt)} सफलतापूर्वक दर्ज हुआ!` : `Payment of ${inr(amt)} recorded!`);
            closeSub();
            openCustomerLedgerModal(customerId);
          } catch (err) {
            toast(err.message);
            saveBtn.disabled = false;
          }
        };
      };

    } catch (err) {
      document.getElementById('cq-mod-body').innerHTML = `<div style="color:#dc2626;padding:24px">${escapeHtml(err.message)}</div>`;
    }
  }

  // ─── ADMIN: LABOUR & PAYROLL MANAGEMENT ─────────────────────────────────────
  async function loadLabour() {
    const el = document.getElementById('a-content');
    const isHi = state.lang === 'hi';

    el.innerHTML = `
      <!-- KPI Metric Summary Cards -->
      <div class="a-labour-kpi-grid" id="al-kpi-row">
        <div class="a-labour-kpi-card" style="border-left:4px solid #3b82f6">
          <div class="muted" style="font-size:.8rem;font-weight:700">${isHi ? '👷 सक्रिय मज़दूर / स्टाफ' : 'Active Labours / Staff'}</div>
          <div class="a-labour-kpi-val" id="al-active-count" style="color:#1d4ed8">—</div>
          <div style="font-size:.75rem;color:#64748b" id="al-total-sub">लोड हो रहा है…</div>
        </div>
        <div class="a-labour-kpi-card" style="border-left:4px solid #10b981">
          <div class="muted" style="font-size:.8rem;font-weight:700">${isHi ? '💸 इस महीने दिया गया भुगतान' : 'Total Paid This Month'}</div>
          <div class="a-labour-kpi-val" id="al-paid-month" style="color:#059669">—</div>
          <div style="font-size:.75rem;color:#64748b">${isHi ? 'सैलरी व एडवांस भुगतान' : 'Salary + Advance payouts'}</div>
        </div>
        <div class="a-labour-kpi-card" style="border-left:4px solid #f59e0b">
          <div class="muted" style="font-size:.8rem;font-weight:700">${isHi ? '⏳ कुल देय बाकी वेतन' : 'Net Wages Pending'}</div>
          <div class="a-labour-kpi-val" id="al-pending-wage" style="color:#b45309">—</div>
          <div style="font-size:.75rem;color:#64748b">${isHi ? 'मज़दूरों को भुगतान करना बाकी' : 'Owed to labours'}</div>
        </div>
        <div class="a-labour-kpi-card" style="border-left:4px solid #06b6d4">
          <div class="muted" style="font-size:.8rem;font-weight:700">${isHi ? '💼 कुल बकाया एडवांस' : 'Advance Outstanding'}</div>
          <div class="a-labour-kpi-val" id="al-advance-out" style="color:#0891b2">—</div>
          <div style="font-size:.75rem;color:#64748b">${isHi ? 'स्टाफ के पास जमा एडवांस' : 'Advance with staff'}</div>
        </div>
      </div>

      <!-- Filter Controls Toolbar -->
      <div class="a-filter-bar">
        <div class="a-search-box">
          <svg class="a-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input id="al-search-input" placeholder="${isHi ? 'मज़दूर का नाम, काम, फोन से खोजें...' : 'Search by name, role, phone...'}" />
        </div>

        <select class="a-select" id="al-shop-select">
          <option value="all">${t('allShops')}</option>
          <option value="shop1">${isHi ? 'दुकान 1 (Shop 1)' : 'Shop 1'}</option>
          <option value="shop2">${isHi ? 'दुकान 2 (Shop 2)' : 'Shop 2'}</option>
        </select>

        <select class="a-select" id="al-status-select">
          <option value="active">${isHi ? 'काम पर हैं (Active)' : 'Active Labours'}</option>
          <option value="inactive">${isHi ? 'पुराने (Inactive)' : 'Inactive Labours'}</option>
          <option value="all">${isHi ? 'सभी मज़दूर (All)' : 'All Labours'}</option>
        </select>

        <button type="button" class="a-page-btn" id="al-btn-add" style="background:#1d4ed8;color:#ffffff;font-weight:700;display:inline-flex;align-items:center;gap:6px;padding:8px 16px;white-space:nowrap">
          <span>➕</span>
          <span>${isHi ? 'नया मज़दूर जोड़ें' : 'Add Labour'}</span>
        </button>
      </div>

      <!-- Labour Data Table Container -->
      <div class="a-table-container">
        <div class="a-table-scroll">
          <div id="al-table-wrap">
            <p class="muted" style="text-align:center;padding:48px">${isHi ? 'मज़दूर सूची लोड हो रही है…' : 'Loading labour directory…'}</p>
          </div>
        </div>
      </div>

      <!-- Modals Root -->
      <div id="al-modal-container"></div>`;

    // Load Metrics
    const loadMetrics = async () => {
      try {
        const shopId = document.getElementById('al-shop-select')?.value || 'all';
        const res = await api(`/labour/metrics?shopId=${shopId}`);
        document.getElementById('al-active-count').textContent = res.activeCount || '0';
        document.getElementById('al-total-sub').textContent = `${isHi ? 'कुल दर्ज' : 'Total registered'}: ${res.totalCount || 0} (Shop 1: ${res.shop1Count || 0}, Shop 2: ${res.shop2Count || 0})`;
        document.getElementById('al-paid-month').textContent = inr(res.totalPaidThisMonth || 0);
        document.getElementById('al-pending-wage').textContent = inr(res.totalPendingWage || 0);
        document.getElementById('al-advance-out').textContent = inr(res.totalAdvanceWithLabour || 0);
      } catch (e) {
        console.warn('Metrics failed:', e);
      }
    };

    // Load Labours
    const fetchLabours = async () => {
      const q = (document.getElementById('al-search-input')?.value || '').trim();
      const shopId = document.getElementById('al-shop-select')?.value || 'all';
      const status = document.getElementById('al-status-select')?.value || 'active';

      const wrap = document.getElementById('al-table-wrap');
      if (!wrap) return;

      try {
        const params = new URLSearchParams();
        if (q) params.set('q', q);
        if (shopId !== 'all') params.set('shopId', shopId);
        if (status !== 'all') params.set('status', status);

        const { labours } = await api(`/labour?${params}`);
        if (!labours || !labours.length) {
          wrap.innerHTML = `
            <div style="text-align:center;padding:48px;color:#64748b">
              <p style="font-size:1.1rem;font-weight:700;margin:0 0 6px">${isHi ? 'कोई मज़दूर रिकॉर्ड नहीं मिला' : 'No labour records found'}</p>
              <p style="font-size:.85rem;margin:0">${isHi ? "ऊपर '➕ नया मज़दूर जोड़ें' बटन से नया स्टाफ दर्ज करें।" : "Click 'Add Labour' button above to register staff."}</p>
            </div>`;
          return;
        }

        wrap.innerHTML = `
          <table class="a-table">
            <thead>
              <tr>
                <th>${isHi ? 'मज़दूर (Labour)' : 'Labour Profile'}</th>
                <th>${isHi ? 'दुकान (Shop)' : 'Shop'}</th>
                <th>${isHi ? 'संपर्क (Contact)' : 'Phone'}</th>
                <th>${isHi ? 'तय वेतन दर' : 'Wage Rate'}</th>
                <th>${isHi ? 'कुल बना / कुल दिया' : 'Earned / Paid'}</th>
                <th>${isHi ? 'शुद्ध बाकी स्थिति' : 'Net Balance'}</th>
                <th style="text-align:right">${isHi ? 'कार्य (Actions)' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              ${labours.map((l) => {
                const isOwed = l.balance > 0;
                const isAdvance = l.balance < 0;
                const balClass = isOwed ? 'color:#b45309;background:#fef3c7;border:1px solid #fde68a' :
                                 isAdvance ? 'color:#0369a1;background:#e0f2fe;border:1px solid #bae6fd' :
                                 'color:#15803d;background:#dcfce7;border:1px solid #bbf7d0';
                const balText = isOwed ? `${isHi ? 'देना बाकी' : 'Owed'}: ${inr(l.balance)}` :
                                isAdvance ? `${isHi ? 'एडवांस जमा' : 'Advance'}: ${inr(Math.abs(l.balance))}` :
                                `${isHi ? 'चुकता ✓' : 'Settled ✓'}`;

                const wageStr = l.wageAmount ? `₹${l.wageAmount.toLocaleString(isHi ? 'hi-IN' : 'en-IN')} / ${l.wageType === 'daily' ? (isHi ? 'दिन' : 'day') : (isHi ? 'माह' : 'mo')}` : '—';

                return `
                  <tr>
                    <td>
                      <div style="display:flex;align-items:center;gap:10px">
                        <div style="width:36px;height:36px;border-radius:10px;background:#eff6ff;color:#1d4ed8;font-weight:900;display:grid;place-items:center;font-size:1.05rem">
                          ${escapeHtml((l.name || 'L')[0].toUpperCase())}
                        </div>
                        <div>
                          <div style="font-weight:800;color:#0f172a">${escapeHtml(l.name)}</div>
                          <div style="font-size:.76rem;color:#1d4ed8;font-weight:700">${escapeHtml(l.roleTitle || 'कारीगर')}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span class="a-badge-pill shop">${escapeHtml(l.shopId)}</span>
                    </td>
                    <td>
                      ${l.phone ? `<a href="tel:${escapeHtml(l.phone)}" style="color:#0369a1;font-weight:600;text-decoration:none">📞 ${escapeHtml(l.phone)}</a>` : '<span class="muted">—</span>'}
                    </td>
                    <td>
                      <strong style="color:#0f172a">${wageStr}</strong>
                    </td>
                    <td>
                      <div style="font-size:.82rem">
                        <span style="color:#059669;font-weight:700">+${inr(l.totalEarned || 0)}</span>
                        <span style="color:#64748b"> / </span>
                        <span style="color:#dc2626;font-weight:700">−${inr(l.totalPaid || 0)}</span>
                      </div>
                    </td>
                    <td>
                      <span style="display:inline-block;padding:4px 10px;border-radius:10px;font-size:.82rem;font-weight:800;${balClass}">
                        ${balText}
                      </span>
                    </td>
                    <td style="text-align:right">
                      <div style="display:inline-flex;gap:6px">
                        <button type="button" class="a-page-btn al-btn-ledger" data-id="${l._id}" style="padding:6px 10px;font-size:.82rem;font-weight:700;background:#092c20;color:#ffffff">
                          📖 ${isHi ? 'बहीखाता' : 'Ledger'}
                        </button>
                        <button type="button" class="a-page-btn al-btn-pay" data-id="${l._id}" data-name="${escapeHtml(l.name)}" style="padding:6px 10px;font-size:.82rem;font-weight:700;background:#dc2626;color:#ffffff">
                          💸 ${isHi ? 'भुगतान' : 'Pay'}
                        </button>
                        <button type="button" class="a-action-btn edit al-btn-edit" data-id="${l._id}" title="Edit Profile">
                          ✏️
                        </button>
                      </div>
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>`;

        // Wire Ledger Drilldown
        wrap.querySelectorAll('.al-btn-ledger').forEach((b) => {
          b.onclick = () => openLabourPassbookModal(b.dataset.id);
        });

        // Wire Quick Pay
        wrap.querySelectorAll('.al-btn-pay').forEach((b) => {
          b.onclick = () => {
            const targetLabour = labours.find((x) => x._id === b.dataset.id);
            if (targetLabour) openAdminLabourPayModal(targetLabour, () => { loadMetrics(); fetchLabours(); });
          };
        });

        // Wire Edit Profile
        wrap.querySelectorAll('.al-btn-edit').forEach((b) => {
          b.onclick = () => {
            const targetLabour = labours.find((x) => x._id === b.dataset.id);
            if (targetLabour) openLabourProfileModal(targetLabour, () => { loadMetrics(); fetchLabours(); });
          };
        });

      } catch (err) {
        wrap.innerHTML = `<div style="color:#dc2626;padding:24px">${escapeHtml(err.message)}</div>`;
      }
    };

    // Wire Filters
    let timer = null;
    document.getElementById('al-search-input').oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(fetchLabours, 180);
    };
    document.getElementById('al-shop-select').onchange = () => { loadMetrics(); fetchLabours(); };
    document.getElementById('al-status-select').onchange = fetchLabours;

    // Wire Add Labour Button
    document.getElementById('al-btn-add').onclick = () => {
      openLabourProfileModal(null, () => { loadMetrics(); fetchLabours(); });
    };

    loadMetrics();
    fetchLabours();
  }

  // ─── ADMIN: LABOUR PROFILE CREATE / EDIT MODAL ──────────────────────────────
  function openLabourProfileModal(existingLabour, onSaved) {
    const isEdit = !!existingLabour;
    const isHi = state.lang === 'hi';
    const container = document.getElementById('al-modal-container') || document.body;

    const modal = document.createElement('div');
    modal.className = 'a-modal-backdrop';
    modal.style.zIndex = '1050';

    modal.innerHTML = `
      <div class="a-modal-card" style="max-width:520px;border-radius:18px;overflow:hidden">
        <div class="a-modal-header" style="background:#eff6ff;border-bottom:1.5px solid #bfdbfe">
          <h3 style="margin:0;font-size:1.15rem;font-weight:800;color:#1e40af">
            ${isEdit ? (isHi ? '✏️ मज़दूर विवरण बदलें' : 'Edit Labour Profile') : (isHi ? '➕ नया मज़दूर जोड़ें' : 'Add New Labour Profile')}
          </h3>
          <button class="a-page-btn" id="lpm-close">✕</button>
        </div>
        <div class="a-modal-body" style="padding:16px 20px;max-height:80vh;overflow-y:auto">
          <!-- Name -->
          <div class="entry-field-row" style="margin-bottom:12px">
            <label style="font-weight:700;font-size:.85rem;display:block;margin-bottom:4px">${isHi ? 'मज़दूर का पूरा नाम' : 'Full Name'} <span style="color:#dc2626">*</span></label>
            <input class="entry-input" id="lpm-name" value="${escapeHtml(existingLabour?.name || '')}" placeholder="जैसे: रमेश कुमार" autofocus />
          </div>

          <!-- Shop & Role -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
            <div>
              <label style="font-weight:700;font-size:.85rem;display:block;margin-bottom:4px">${isHi ? 'दुकान (Shop)' : 'Shop'}</label>
              <select class="a-select" id="lpm-shop" style="width:100%">
                <option value="shop1" ${(existingLabour?.shopId || '') === 'shop1' ? 'selected' : ''}>Shop 1 (दुकान 1)</option>
                <option value="shop2" ${(existingLabour?.shopId || '') === 'shop2' ? 'selected' : ''}>Shop 2 (दुकान 2)</option>
              </select>
            </div>
            <div>
              <label style="font-weight:700;font-size:.85rem;display:block;margin-bottom:4px">${isHi ? 'पद / काम (Role)' : 'Role'}</label>
              <input class="entry-input" id="lpm-role" value="${escapeHtml(existingLabour?.roleTitle || 'कारीगर')}" placeholder="कारीगर, हेल्पर, दर्जी..." />
            </div>
          </div>

          <!-- Phone & Status -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
            <div>
              <label style="font-weight:700;font-size:.85rem;display:block;margin-bottom:4px">${isHi ? 'मोबाइल नंबर' : 'Phone'}</label>
              <input class="entry-input" type="tel" id="lpm-phone" value="${escapeHtml(existingLabour?.phone || '')}" placeholder="10-digit mobile" />
            </div>
            <div>
              <label style="font-weight:700;font-size:.85rem;display:block;margin-bottom:4px">${isHi ? 'स्थिति (Status)' : 'Status'}</label>
              <select class="a-select" id="lpm-status" style="width:100%">
                <option value="active" ${(existingLabour?.status || 'active') === 'active' ? 'selected' : ''}>Active (काम पर हैं)</option>
                <option value="inactive" ${(existingLabour?.status || '') === 'inactive' ? 'selected' : ''}>Inactive (पुराने)</option>
              </select>
            </div>
          </div>

          <!-- Wage Type & Amount -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
            <div>
              <label style="font-weight:700;font-size:.85rem;display:block;margin-bottom:4px">${isHi ? 'वेतन प्रकार' : 'Wage Type'}</label>
              <select class="a-select" id="lpm-wage-type" style="width:100%">
                <option value="monthly" ${(existingLabour?.wageType || 'monthly') === 'monthly' ? 'selected' : ''}>मासिक वेतन (Monthly)</option>
                <option value="daily" ${(existingLabour?.wageType || '') === 'daily' ? 'selected' : ''}>दैनिक दिहाड़ी (Daily)</option>
              </select>
            </div>
            <div>
              <label style="font-weight:700;font-size:.85rem;display:block;margin-bottom:4px">${isHi ? 'तय वेतन रकम ₹' : 'Wage Rate ₹'}</label>
              <input class="entry-input" type="number" id="lpm-wage-amt" value="${existingLabour?.wageAmount || ''}" placeholder="0" />
            </div>
          </div>

          <!-- Notes -->
          <div style="margin-bottom:14px">
            <label style="font-weight:700;font-size:.85rem;display:block;margin-bottom:4px">${isHi ? 'टिप्पणी / विवरण' : 'Notes'}</label>
            <input class="entry-input" id="lpm-notes" value="${escapeHtml(existingLabour?.notes || '')}" placeholder="${isHi ? 'अतिरिक्त विवरण...' : 'Optional notes...'}" />
          </div>

          <div style="display:flex;gap:10px;margin-top:16px">
            <button type="button" id="lpm-cancel" class="a-page-btn" style="flex:1;padding:12px;background:#f1f5f9;color:#475569">
              ${isHi ? 'रद्द करें' : 'Cancel'}
            </button>
            <button type="button" id="lpm-save" class="a-page-btn" style="flex:2;padding:12px;background:#1d4ed8;color:#ffffff;font-weight:800">
              ${isEdit ? (isHi ? '✓ बदलाव सहेजें' : 'Save Changes') : (isHi ? '✓ मज़दूर जोड़ें' : 'Register Labour')}
            </button>
          </div>
        </div>
      </div>`;

    container.appendChild(modal);

    const closeModal = () => { modal.remove(); };
    modal.querySelector('#lpm-close').onclick = closeModal;
    modal.querySelector('#lpm-cancel').onclick = closeModal;
    modal.onclick = (e) => { if (e.target === modal) closeModal(); };

    modal.querySelector('#lpm-save').onclick = async () => {
      const name = modal.querySelector('#lpm-name').value.trim();
      if (!name) { toast(isHi ? 'कृपया मज़दूर का नाम लिखें' : 'Name is required'); return; }

      const shopId = modal.querySelector('#lpm-shop').value;
      const roleTitle = modal.querySelector('#lpm-role').value.trim();
      const phone = modal.querySelector('#lpm-phone').value.trim();
      const status = modal.querySelector('#lpm-status').value;
      const wageType = modal.querySelector('#lpm-wage-type').value;
      const wageAmount = Number(modal.querySelector('#lpm-wage-amt').value) || 0;
      const notes = modal.querySelector('#lpm-notes').value.trim();

      const saveBtn = modal.querySelector('#lpm-save');
      saveBtn.disabled = true;

      try {
        if (isEdit) {
          await api(`/labour/${existingLabour._id}`, {
            method: 'PUT',
            body: { name, shopId, roleTitle, phone, status, wageType, wageAmount, notes },
          });
          toast(isHi ? '✅ विवरण अपडेट हो गया' : 'Labour profile updated');
        } else {
          await api('/labour', {
            method: 'POST',
            body: { name, shopId, roleTitle, phone, status, wageType, wageAmount, notes },
          });
          toast(isHi ? `✅ मज़दूर "${name}" दर्ज हुए` : 'Labour registered');
        }
        playChime();
        closeModal();
        if (onSaved) onSaved();
      } catch (err) {
        toast(err.message || 'Error saving labour');
        saveBtn.disabled = false;
      }
    };
  }

  // ─── ADMIN: QUICK PAY (ADVANCE / SALARY) MODAL ───────────────────────────────
  function openAdminLabourPayModal(labour, onSaved) {
    const isHi = state.lang === 'hi';
    const container = document.getElementById('al-modal-container') || document.body;

    const modal = document.createElement('div');
    modal.className = 'a-modal-backdrop';
    modal.style.zIndex = '1060';

    let selectedMode = 'cash';
    let selectedCat = 'advance';

    modal.innerHTML = `
      <div class="a-modal-card" style="max-width:480px;border-radius:18px;overflow:hidden">
        <div class="a-modal-header" style="background:#fee2e2;border-bottom:1.5px solid #fecaca">
          <div>
            <h3 style="margin:0;font-size:1.15rem;font-weight:800;color:#991b1b">
              💸 ${isHi ? 'मज़दूर को भुगतान दर्ज करें' : 'Record Labour Payment'}
            </h3>
            <div style="font-size:.82rem;color:#7f1d1d;margin-top:2px">
              ${escapeHtml(labour.name)} (${escapeHtml(labour.roleTitle || 'कारीगर')}) · ${escapeHtml(labour.shopId)}
            </div>
          </div>
          <button class="a-page-btn" id="lpay-close">✕</button>
        </div>
        <div class="a-modal-body" style="padding:16px 20px">
          <!-- Quick Presets -->
          <div style="margin-bottom:10px">
            <label style="font-weight:700;font-size:.82rem;color:#0f172a;display:block;margin-bottom:4px">
              ${isHi ? 'त्वरित रकम चुनें' : 'Presets'}:
            </label>
            <div class="chip-row" id="lpay-presets">
              <button type="button" class="chip" data-amt="500">₹500</button>
              <button type="button" class="chip" data-amt="1000">₹1,000</button>
              <button type="button" class="chip" data-amt="2000">₹2,000</button>
              <button type="button" class="chip" data-amt="5000">₹5,000</button>
            </div>
          </div>

          <div>
            <label style="font-weight:700;font-size:.88rem;color:#0f172a;display:block;margin-bottom:4px">
              ${isHi ? 'भुगतान रकम' : 'Payment Amount'} <span style="color:#dc2626">*</span>
            </label>
            <div class="pb-amt-input-wrap">
              <span class="pb-rupee-sign" style="color:#dc2626">₹</span>
              <input type="number" id="lpay-amt" class="pb-amt-input" placeholder="0" autofocus />
            </div>
          </div>

          <div style="margin-top:12px">
            <label style="font-weight:700;font-size:.85rem;color:#0f172a;display:block;margin-bottom:4px">
              ${isHi ? 'भुगतान प्रकार' : 'Category'}:
            </label>
            <div class="chip-row" id="lpay-cat-chips">
              <button type="button" class="chip chip--on" data-cat="advance">${isHi ? 'एडवांस (Advance)' : 'Advance'}</button>
              <button type="button" class="chip" data-cat="salary">${isHi ? 'सैलरी भुगतान' : 'Salary Payout'}</button>
              <button type="button" class="chip" data-cat="kharcha">${isHi ? 'खर्चा' : 'Expense'}</button>
            </div>
          </div>

          <div style="margin-top:12px">
            <label style="font-weight:700;font-size:.85rem;color:#0f172a;display:block;margin-bottom:4px">
              ${isHi ? 'माध्यम' : 'Payment Mode'}:
            </label>
            <div class="chip-row" id="lpay-mode-chips">
              <button type="button" class="chip chip--on" data-mode="cash">💵 ${isHi ? 'नकद' : 'Cash'}</button>
              <button type="button" class="chip" data-mode="upi">📱 UPI / PhonePe</button>
              <button type="button" class="chip" data-mode="bank">🏦 Bank</button>
            </div>
          </div>

          <div style="margin-top:12px">
            <label style="font-weight:700;font-size:.85rem;color:#64748b;display:block;margin-bottom:4px">
              ${isHi ? 'टिप्पणी / विवरण' : 'Description'}
            </label>
            <input type="text" id="lpay-desc" class="entry-input" placeholder="${isHi ? 'जैसे: घर खर्च, दवा के लिए' : 'Optional description...'}" />
          </div>

          <div style="display:flex;gap:10px;margin-top:18px">
            <button type="button" id="lpay-cancel" class="a-page-btn" style="flex:1;padding:12px;background:#f1f5f9;color:#475569">
              ${isHi ? 'रद्द करें' : 'Cancel'}
            </button>
            <button type="button" id="lpay-save" class="a-page-btn" style="flex:2;padding:12px;background:#dc2626;color:#ffffff;font-weight:800">
              ✓ ${isHi ? 'भुगतान दर्ज करें' : 'Save Payment'}
            </button>
          </div>
        </div>
      </div>`;

    container.appendChild(modal);

    const closeModal = () => { modal.remove(); };
    modal.querySelector('#lpay-close').onclick = closeModal;
    modal.querySelector('#lpay-cancel').onclick = closeModal;
    modal.onclick = (e) => { if (e.target === modal) closeModal(); };

    modal.querySelectorAll('#lpay-presets button').forEach((b) => {
      b.onclick = () => {
        modal.querySelectorAll('#lpay-presets button').forEach((x) => x.classList.remove('chip--on'));
        b.classList.add('chip--on');
        modal.querySelector('#lpay-amt').value = b.dataset.amt;
      };
    });

    modal.querySelectorAll('#lpay-cat-chips button').forEach((b) => {
      b.onclick = () => {
        modal.querySelectorAll('#lpay-cat-chips button').forEach((x) => x.classList.remove('chip--on'));
        b.classList.add('chip--on');
        selectedCat = b.dataset.cat;
      };
    });

    modal.querySelectorAll('#lpay-mode-chips button').forEach((b) => {
      b.onclick = () => {
        modal.querySelectorAll('#lpay-mode-chips button').forEach((x) => x.classList.remove('chip--on'));
        b.classList.add('chip--on');
        selectedMode = b.dataset.mode;
      };
    });

    modal.querySelector('#lpay-save').onclick = async () => {
      const amt = Number(modal.querySelector('#lpay-amt').value);
      if (!amt || amt <= 0) { toast(isHi ? 'कृपया सही रकम डालें' : 'Valid amount required'); return; }

      const desc = modal.querySelector('#lpay-desc').value.trim();
      const saveBtn = modal.querySelector('#lpay-save');
      saveBtn.disabled = true;

      try {
        await api(`/labour/${labour._id}/entries`, {
          method: 'POST',
          body: {
            type: 'payment',
            amount: amt,
            category: selectedCat,
            paymentMode: selectedMode,
            description: desc,
          },
        });
        playChime();
        toast(isHi ? `✅ भुगतान ${inr(amt)} दर्ज हुआ` : 'Payment recorded');
        closeModal();
        if (onSaved) onSaved();
      } catch (err) {
        toast(err.message || 'Payment failed');
        saveBtn.disabled = false;
      }
    };
  }

  // ─── ADMIN: LABOUR PASSBOOK / LEDGER DRILL-DOWN MODAL ────────────────────────
  async function openLabourPassbookModal(labourId) {
    const isHi = state.lang === 'hi';
    const container = document.getElementById('al-modal-container') || document.body;

    const modal = document.createElement('div');
    modal.className = 'a-modal-backdrop';
    modal.style.zIndex = '1050';

    modal.innerHTML = `
      <div class="a-modal-card" style="max-width:820px;width:95%;max-height:92vh;display:flex;flex-direction:column;border-radius:20px;overflow:hidden">
        <div class="a-modal-header" style="background:linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%);color:#ffffff;flex-shrink:0">
          <div>
            <h3 id="lpb-title" style="margin:0;font-size:1.25rem;font-weight:900">📖 मज़दूर बहीखाता (Labour Ledger)</h3>
            <div id="lpb-sub" style="font-size:.85rem;color:#bfdbfe;margin-top:2px">लोड हो रहा है…</div>
          </div>
          <button class="a-page-btn" id="lpb-close" style="background:rgba(255,255,255,.2);color:#ffffff;border:none">✕</button>
        </div>

        <div style="overflow-y:auto;flex:1;padding:16px 20px" id="lpb-body">
          <p class="muted" style="text-align:center;padding:32px">लोड हो रहा है…</p>
        </div>

        <div style="padding:12px 18px;border-top:1px solid #e2e8f0;background:#f8fafc;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;flex-shrink:0">
          <div style="display:flex;gap:8px">
            <button type="button" class="a-page-btn" id="lpb-add-pay" style="background:#dc2626;color:#ffffff;font-weight:800;padding:8px 14px">
              🔴 💸 ${isHi ? 'पैसा दिया (Payment)' : 'Record Payment'}
            </button>
            <button type="button" class="a-page-btn" id="lpb-add-wage" style="background:#059669;color:#ffffff;font-weight:800;padding:8px 14px">
              🟢 🗓️ ${isHi ? 'वेतन जोड़ा (Credit Wage)' : 'Credit Wage'}
            </button>
          </div>
          <div style="display:flex;gap:8px">
            <button type="button" class="a-page-btn" id="lpb-wa" style="background:#25D366;color:#ffffff;font-weight:800;padding:8px 12px;border:none">
              📲 WhatsApp
            </button>
            <button type="button" class="a-page-btn" onclick="window.print()" style="padding:8px 12px;background:#ffffff;border:1px solid #cbd5e1">
              🖨️ ${isHi ? 'प्रिंट' : 'Print'}
            </button>
          </div>
        </div>
      </div>`;

    container.appendChild(modal);

    const closeModal = () => { modal.remove(); };
    modal.querySelector('#lpb-close').onclick = closeModal;
    modal.onclick = (e) => { if (e.target === modal) closeModal(); };

    const refreshPassbook = async () => {
      try {
        const { labour, entries } = await api(`/labour/${labourId}/entries`);
        modal.querySelector('#lpb-title').textContent = `📖 ${labour.name} — बहीखाता Passbook`;
        modal.querySelector('#lpb-sub').textContent = `${escapeHtml(labour.roleTitle || 'कारीगर')} · ${escapeHtml(labour.shopId)} · तय दर: ₹${(labour.wageAmount || 0).toLocaleString('hi-IN')} / ${labour.wageType === 'daily' ? 'दिन' : 'माह'}`;

        const isOwed = labour.balance > 0;
        const isAdvance = labour.balance < 0;
        const balLabel = isOwed ? (isHi ? 'बाकी वेतन देना है (Owed)' : 'Wages Owed to Labour') :
                         isAdvance ? (isHi ? 'एडवांस जमा है (Advance with Labour)' : 'Advance with Staff') :
                         (isHi ? 'खाता चुकता है ✓' : 'Account Settled ✓');
        const balColor = isOwed ? '#b45309' : isAdvance ? '#0369a1' : '#15803d';

        const body = modal.querySelector('#lpb-body');
        body.innerHTML = `
          <!-- Summary Banner -->
          <div style="background:#f8fafc;border:2px solid #e2e8f0;border-radius:16px;padding:16px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
            <div>
              <div style="font-size:.85rem;color:#64748b;font-weight:700">${balLabel}</div>
              <div style="font-size:2rem;font-weight:900;color:${balColor};margin-top:2px">
                ${inr(Math.abs(labour.balance || 0))}
              </div>
            </div>
            <div style="text-align:right">
              <div style="font-size:.85rem;color:#64748b">
                कुल बना: <strong style="color:#059669">${inr(labour.totalEarned || 0)}</strong>
              </div>
              <div style="font-size:.85rem;color:#64748b;margin-top:2px">
                कुल भुगतान: <strong style="color:#dc2626">${inr(labour.totalPaid || 0)}</strong>
              </div>
            </div>
          </div>

          <!-- Entries Table -->
          <table class="a-table">
            <thead>
              <tr>
                <th>${isHi ? 'तारीख' : 'Date'}</th>
                <th>${isHi ? 'प्रकार' : 'Type'}</th>
                <th>${isHi ? 'माध्यम' : 'Mode'}</th>
                <th>${isHi ? 'विवरण' : 'Description'}</th>
                <th>${isHi ? 'रकम' : 'Amount'}</th>
                <th>${isHi ? 'बाकी' : 'Running Bal'}</th>
                <th style="text-align:right">✕</th>
              </tr>
            </thead>
            <tbody>
              ${!entries.length ? `<tr><td colspan="7" style="text-align:center;padding:32px;color:#64748b">${isHi ? 'कोई लेन-देन नहीं है' : 'No transactions recorded'}</td></tr>` : entries.map((e) => {
                const isPay = e.type === 'payment';
                const dStr = new Date(e.date || e.createdAt).toLocaleDateString(isHi ? 'hi-IN' : 'en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                return `
                  <tr>
                    <td><strong>${dStr}</strong></td>
                    <td>
                      <span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:.78rem;font-weight:800;background:${isPay ? '#fee2e2;color:#991b1b' : '#dcfce7;color:#166534'}">
                        ${isPay ? (isHi ? '🔴 भुगतान' : 'Payment') : (isHi ? '🟢 वेतन जुड़ा' : 'Credit')} (${escapeHtml(e.category || '')})
                      </span>
                    </td>
                    <td>${e.paymentMode ? `<span class="pb-mode-pill">${escapeHtml(e.paymentMode.toUpperCase())}</span>` : '—'}</td>
                    <td>${escapeHtml(e.description || '—')}</td>
                    <td>
                      <strong style="color:${isPay ? '#dc2626' : '#059669'}">${isPay ? '−' : '+'}${inr(e.amount)}</strong>
                    </td>
                    <td>
                      <strong style="color:#0f172a">${inr(Math.abs(e.runningBalance || 0))}</strong>
                    </td>
                    <td style="text-align:right">
                      <button type="button" class="lpb-del-btn" data-eid="${e._id}" style="background:none;border:none;color:#dc2626;cursor:pointer;font-weight:800;font-size:1rem" title="Delete">🗑</button>
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>`;

        // Wire delete entry
        body.querySelectorAll('.lpb-del-btn').forEach((btn) => {
          btn.onclick = async () => {
            if (!confirm(isHi ? 'क्या आप इस एंट्री को हटाना चाहते हैं?' : 'Delete this entry?')) return;
            try {
              await api(`/labour/${labourId}/entries/${btn.dataset.eid}`, { method: 'DELETE' });
              toast(isHi ? 'एंट्री हटा दी गई' : 'Entry deleted');
              refreshPassbook();
            } catch (err) {
              toast(err.message);
            }
          };
        });

        // WhatsApp Share
        modal.querySelector('#lpb-wa').onclick = () => {
          const shopTitle = labour.shopId === 'shop2' ? 'दुकान 2' : 'दुकान 1';
          let msg = `*${shopTitle} — मज़दूर वेतन व हिसाब विवरण*\n`;
          msg += `मज़दूर: *${labour.name}* (${labour.roleTitle || 'कारीगर'})\n`;
          if (labour.wageAmount) {
            msg += `तय दर: ₹${(labour.wageAmount || 0).toLocaleString('hi-IN')} / ${labour.wageType === 'daily' ? 'दिन' : 'माह'}\n`;
          }
          msg += `--------------------------------\n`;
          msg += `कुल अर्जित वेतन: ₹${(labour.totalEarned || 0).toLocaleString('hi-IN')}\n`;
          msg += `कुल भुगतान (एडवांस+वेतन): ₹${(labour.totalPaid || 0).toLocaleString('hi-IN')}\n`;
          msg += `*वर्तमान स्थिति: ${balLabel} — ${inr(Math.abs(labour.balance || 0))}*\n`;
          msg += `--------------------------------\n`;
          msg += `हालिया लेन-देन:\n`;
          entries.slice(0, 5).forEach((e) => {
            const d = new Date(e.date || e.createdAt).toLocaleDateString('hi-IN', { day: '2-digit', month: 'short' });
            msg += `• ${d}: ${e.type === 'salary_credit' ? '+ वेतन' : '- भुगतान'} ₹${(e.amount || 0).toLocaleString('hi-IN')}${e.description ? ` (${e.description})` : ''}\n`;
          });
          msg += `\n_धन्यवाद!_\n*${shopTitle}*`;

          const phone = (labour.phone || '').replace(/\D/g, '');
          const url = `https://wa.me/${phone.length === 10 ? '91' + phone : phone}?text=${encodeURIComponent(msg)}`;
          window.open(url, '_blank');
        };

        // Modal Action: Add Payment
        modal.querySelector('#lpb-add-pay').onclick = () => {
          openAdminLabourPayModal(labour, () => refreshPassbook());
        };

        // Modal Action: Add Wage Credit
        modal.querySelector('#lpb-add-wage').onclick = async () => {
          const amtStr = prompt(isHi ? 'जोड़ने वाली वेतन रकम दर्ज करें (₹):' : 'Enter wage amount to credit (₹):', labour.wageAmount || '');
          if (!amtStr) return;
          const amt = Number(amtStr);
          if (!amt || amt <= 0) { toast('Invalid amount'); return; }
          const desc = prompt(isHi ? 'विवरण (जैसे: मई महीने का वेतन):' : 'Description (e.g. Monthly Salary):', labour.wageType === 'daily' ? 'हाज़िरी / दिहाड़ी' : 'महीने का वेतन') || '';

          try {
            await api(`/labour/${labourId}/entries`, {
              method: 'POST',
              body: {
                type: 'salary_credit',
                amount: amt,
                category: labour.wageType === 'daily' ? 'daily_wage' : 'salary',
                description: desc,
              },
            });
            playChime();
            toast(isHi ? '✅ वेतन जोड़ा गया' : 'Wage credited');
            refreshPassbook();
          } catch (err) {
            toast(err.message);
          }
        };

      } catch (err) {
        modal.querySelector('#lpb-body').innerHTML = `<div style="color:#dc2626;padding:24px">${escapeHtml(err.message)}</div>`;
      }
    };

    refreshPassbook();
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
