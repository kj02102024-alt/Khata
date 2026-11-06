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
      audit: 'Audit Log', logout: 'Log out', outstanding: 'Total Outstanding',
      collections: 'Today\'s Collections', activeCust: 'Active Customers',
      pendingPhotos: 'Pending Diary Photos', approvePost: 'Approve & Post',
      reject: 'Reject', noPending: 'No diary pages waiting.',
      zoomIn: 'Zoom +', zoomOut: 'Zoom −', resetView: 'Reset',
      customer: 'Customer', item: 'Item', brand: 'Brand', meters: 'Meters',
      qty: 'Qty', rate: 'Rate', amount: 'Amount', notes: 'Notes',
      shop: 'Shop', date: 'Date', actions: 'Actions', softDelete: 'Delete',
      restore: 'Restore', type: 'Type', status: 'Status', welcome: 'Pro Admin Portal',
      honorific: 'Honorific', diaryNo: 'Diary No.', identifierNote: 'Identifier',
      time: 'Time', paymentMode: 'Payment Mode', enteredVia: 'Entered Via',
      noData: 'No data yet.',
    },
    hi: {
      overview: 'सारांश', review: 'डायरी जाँच', ledger: 'खाता बही',
      audit: 'ऑडिट लॉग', logout: 'बाहर निकलें', outstanding: 'कुल बचा',
      collections: 'आज की वसूली', activeCust: 'चालू ग्राहक',
      pendingPhotos: 'लंबित डायरी फोटो', approvePost: 'मंज़ूर करें और खाते में डालें',
      reject: 'रद्द', noPending: 'कोई डायरी पेज जाँच के लिए नहीं है।',
      zoomIn: 'बड़ा', zoomOut: 'छोटा', resetView: 'रीसेट',
      customer: 'ग्राहक', item: 'सामान', brand: 'ब्रांड', meters: 'मीटर',
      qty: 'नग', rate: 'रेट', amount: 'रकम', notes: 'नोट',
      shop: 'दुकान', date: 'तारीख', actions: 'कार्य', softDelete: 'हटाएँ',
      restore: 'वापस लाएँ', type: 'प्रकार', status: 'स्थिति', welcome: 'एडमिन पोर्टल',
      honorific: 'आदर', diaryNo: 'डायरी क्रमांक', identifierNote: 'पहचान',
      time: 'समय', paymentMode: 'भुगतान', enteredVia: 'कैसे लिखा',
      noData: 'अभी कोई डेटा नहीं।',
    },
  };
  function t(key) { return i18n[state.lang][key] || i18n.en[key] || key; }

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

    try {
      const { user } = await api('/auth/me');
      state.user = user;
      route();
    } catch {
      renderLogin();
    }
  }

  function route() {
    if (!state.user) return renderLogin();
    if (state.user.role === 'admin') return renderAdmin();
    return renderShop();
  }

  // ─── LOGIN ────────────────────────────────────────────────────────────────────
  function renderLogin() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="login-shell">
        <div class="login-bg-pattern"></div>
        <div class="login-center" id="login-center"></div>
      </div>`;
    // Check for remembered shop
    const remembered = localStorage.getItem('khata_remembered_shop');
    if (remembered) {
      try {
        const { shopId, shopLabel } = JSON.parse(remembered);
        renderPinScreen(shopId, shopLabel);
      } catch {
        renderRolePicker();
      }
    } else {
      renderRolePicker();
    }
  }

  function renderRolePicker() {
    const center = document.getElementById('login-center');
    center.innerHTML = `
      <div class="login-brand">
        <svg class="brand-ledger" viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <rect x="6" y="4" width="28" height="40" rx="4" fill="#0f3d2e" opacity=".9"/>
          <rect x="10" y="4" width="28" height="40" rx="4" fill="#1a5c45" opacity=".8"/>
          <rect x="14" y="4" width="28" height="40" rx="4" fill="#2d7a5c"/>
          <line x1="20" y1="16" x2="36" y2="16" stroke="#f4efe4" stroke-width="2" stroke-linecap="round"/>
          <line x1="20" y1="22" x2="36" y2="22" stroke="#f4efe4" stroke-width="2" stroke-linecap="round"/>
          <line x1="20" y1="28" x2="30" y2="28" stroke="#f4efe4" stroke-width="2" stroke-linecap="round" opacity=".6"/>
        </svg>
        <h1 class="login-wordmark">खाता</h1>
        <p class="login-tagline">आपका हिसाब, आपकी आवाज़ में</p>
      </div>
      <div class="login-role-cards" role="group" aria-label="भूमिका चुनें">
        <button class="login-role-card" id="role-shop" type="button" aria-label="दुकान का हिसाब">
          <span class="role-icon">🧵</span>
          <span class="role-label">दुकान का हिसाब</span>
          <span class="role-sub">PIN से लॉगिन</span>
        </button>
        <button class="login-role-card login-role-card--admin" id="role-admin" type="button" aria-label="मालिक Admin">
          <span class="role-icon">📊</span>
          <span class="role-label">मालिक (Admin)</span>
          <span class="role-sub">Password से</span>
        </button>
      </div>`;

    document.getElementById('role-shop').onclick = renderShopPicker;
    document.getElementById('role-admin').onclick = renderAdminLogin;
  }

  function renderShopPicker() {
    const center = document.getElementById('login-center');
    center.innerHTML = `
      <div class="login-brand login-brand--small">
        <h1 class="login-wordmark">खाता</h1>
        <p class="login-tagline">दुकान चुनें</p>
      </div>
      <div class="shop-cards" id="shop-cards"><div class="login-loading">लोड हो रहा है…</div></div>
      <button class="login-back" id="back-roles" type="button">← वापस</button>`;

    document.getElementById('back-roles').onclick = renderRolePicker;

    api('/auth/shops')
      .then(({ shops }) => renderShopCards(shops))
      .catch(() => renderShopCards([
        { shopId: 'shop1', nameHi: 'दुकान 1' },
        { shopId: 'shop2', nameHi: 'दुकान 2' },
      ]));
  }

  function renderShopCards(shops) {
    const box = document.getElementById('shop-cards');
    if (!box) return;
    box.innerHTML = shops.map((s) => `
      <button class="shop-pick-card" type="button" data-shopid="${escapeHtml(s.shopId)}" data-label="${escapeHtml(s.nameHi)}">
        <span class="shop-pick-icon">🏪</span>
        <span>${escapeHtml(s.nameHi)}</span>
      </button>`).join('');
    box.querySelectorAll('.shop-pick-card').forEach((btn) => {
      btn.onclick = () => renderPinScreen(btn.dataset.shopid, btn.dataset.label);
    });
  }

  function renderPinScreen(shopId, label) {
    const center = document.getElementById('login-center');
    if (!center) {
      // Page might not have login-center, rebuild shell
      const app = document.getElementById('app');
      app.innerHTML = `<div class="login-shell"><div class="login-bg-pattern"></div><div class="login-center" id="login-center"></div></div>`;
      return renderPinScreen(shopId, label);
    }

    let pin = '';
    let failCount = parseInt(localStorage.getItem(`khata_fails_${shopId}`) || '0', 10);
    const lockKey = `khata_lock_${shopId}`;
    const lockedUntil = parseInt(localStorage.getItem(lockKey) || '0', 10);

    center.innerHTML = `
      <div class="login-brand login-brand--small">
        <h1 class="login-wordmark">${escapeHtml(label)}</h1>
        <p class="login-tagline">पिन डालें</p>
      </div>
      <div class="pin-dots" id="pin-dots" aria-live="polite" aria-label="PIN dots">
        <span class="dot" data-idx="0"></span>
        <span class="dot" data-idx="1"></span>
        <span class="dot" data-idx="2"></span>
        <span class="dot" data-idx="3"></span>
      </div>
      <div id="pin-err" class="pin-err" role="alert"></div>
      <div class="pin-pad" id="pin-pad" role="group" aria-label="Number pad"></div>
      <div class="pin-footer">
        <label class="remember-label">
          <input type="checkbox" id="remember-me" checked /> इस फ़ोन पर याद रखें
        </label>
        <button class="pin-forgot" type="button" id="pin-forgot">पिन भूल गए?</button>
      </div>
      <button class="login-back" id="back-shops" type="button">← दूसरी दुकान</button>`;

    // Build keypad
    const pad = document.getElementById('pin-pad');
    const keys = ['1','2','3','4','5','6','7','8','9','⌫','0','✓'];
    keys.forEach((k) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pin-key' + (k === '✓' ? ' pin-key--ok' : k === '⌫' ? ' pin-key--del' : '');
      btn.textContent = k;
      btn.setAttribute('aria-label', k === '⌫' ? 'हटाएँ' : k === '✓' ? 'ठीक है' : k);
      btn.onclick = () => {
        // Haptic
        if (navigator.vibrate) navigator.vibrate(10);
        if (k === '⌫') { pin = pin.slice(0, -1); }
        else if (k === '✓') { submitPin(); return; }
        else if (pin.length < 4) { pin += k; }
        updateDots();
        if (pin.length === 4) submitPin();
      };
      pad.appendChild(btn);
    });

    // Check lockout
    if (Date.now() < lockedUntil) {
      showLockout();
    }

    document.getElementById('back-shops').onclick = renderShopPicker;
    document.getElementById('pin-forgot').onclick = () => showForgotPin(shopId);

    function updateDots() {
      document.querySelectorAll('.dot').forEach((d, i) => {
        d.classList.toggle('filled', i < pin.length);
      });
    }

    async function submitPin() {
      const errEl = document.getElementById('pin-err');
      const now = Date.now();
      const lu = parseInt(localStorage.getItem(lockKey) || '0', 10);
      if (now < lu) { showLockout(); return; }

      errEl.textContent = '';
      pad.querySelectorAll('.pin-key').forEach((b) => (b.disabled = true));
      errEl.textContent = 'जाँच हो रहा है…';
      try {
        const { user } = await api('/auth/pin-login', { method: 'POST', body: { shopId, pin } });
        localStorage.removeItem(`khata_fails_${shopId}`);
        localStorage.removeItem(lockKey);
        if (document.getElementById('remember-me')?.checked) {
          localStorage.setItem('khata_remembered_shop', JSON.stringify({ shopId, shopLabel: label }));
        } else {
          localStorage.removeItem('khata_remembered_shop');
        }
        state.user = user;
        if (user.mustChangeSecret) {
          renderChangePinScreen(shopId, label);
        } else {
          route();
        }
      } catch (e) {
        pin = '';
        updateDots();
        failCount++;
        localStorage.setItem(`khata_fails_${shopId}`, String(failCount));
        if (failCount >= 5 || e.status === 423) {
          const until = Date.now() + 5 * 60 * 1000;
          localStorage.setItem(lockKey, String(until));
          showLockout();
        } else {
          pad.querySelectorAll('.pin-key').forEach((b) => (b.disabled = false));
          errEl.textContent = e.message || 'पिन ग़लत है, फिर से कोशिश कीजिए';
          // Shake animation
          const dots = document.getElementById('pin-dots');
          if (dots) { dots.classList.add('shake'); setTimeout(() => dots.classList.remove('shake'), 500); }
        }
      }
    }

    function showLockout() {
      const lu = parseInt(localStorage.getItem(lockKey) || '0', 10);
      const mins = Math.max(1, Math.ceil((lu - Date.now()) / 60000));
      document.getElementById('pin-err').textContent = `पिन बंद है — ${mins} मिनट बाद फिर कोशिश करें`;
      pad.querySelectorAll('.pin-key').forEach((b) => (b.disabled = true));
      setTimeout(() => {
        if (Date.now() >= lu) {
          localStorage.removeItem(lockKey);
          localStorage.removeItem(`khata_fails_${shopId}`);
          pad.querySelectorAll('.pin-key').forEach((b) => (b.disabled = false));
          document.getElementById('pin-err').textContent = '';
          failCount = 0;
        }
      }, (lu - Date.now()) + 1000);
    }
  }

  function showForgotPin(shopId) {
    // Try to get admin phone from localStorage if cached
    const adminPhone = localStorage.getItem('khata_admin_phone') || '';
    const msg = adminPhone
      ? `मालिक को फ़ोन करें: ${adminPhone}`
      : 'मालिक से संपर्क करें — वे Admin Portal में पिन बदल सकते हैं।';
    toast(msg, { ms: 8000 });
  }

  function renderChangePinScreen(shopId, label) {
    const center = document.getElementById('login-center');
    if (!center) return route();
    center.innerHTML = `
      <div class="login-brand login-brand--small">
        <h1 class="login-wordmark">नया पिन बनाएँ</h1>
        <p class="login-tagline">पहली बार में पिन बदलना ज़रूरी है</p>
      </div>
      <div class="change-pin-form">
        <div class="field">
          <label for="old-pin">पुराना पिन</label>
          <input id="old-pin" type="password" inputmode="numeric" maxlength="6" placeholder="····" autocomplete="current-password" />
        </div>
        <div class="field">
          <label for="new-pin">नया पिन (4 अंक)</label>
          <input id="new-pin" type="password" inputmode="numeric" maxlength="4" placeholder="····" autocomplete="new-password" />
        </div>
        <div class="field">
          <label for="confirm-pin">नया पिन फिर से</label>
          <input id="confirm-pin" type="password" inputmode="numeric" maxlength="4" placeholder="····" autocomplete="new-password" />
        </div>
        <div id="cp-err" class="pin-err" role="alert"></div>
        <button class="btn-save" type="button" id="save-pin">✅ पिन बदलें</button>
      </div>`;

    document.getElementById('save-pin').onclick = async () => {
      const old = document.getElementById('old-pin').value;
      const nw = document.getElementById('new-pin').value;
      const conf = document.getElementById('confirm-pin').value;
      const errEl = document.getElementById('cp-err');
      errEl.textContent = '';
      if (nw.length !== 4 || !/^\d{4}$/.test(nw)) {
        errEl.textContent = 'नया पिन 4 अंक का होना चाहिए'; return;
      }
      if (nw !== conf) {
        errEl.textContent = 'दोनों पिन एक जैसे नहीं हैं'; return;
      }
      try {
        await api('/auth/change-secret', { method: 'POST', body: { currentSecret: old, newSecret: nw } });
        state.user = { ...state.user, mustChangeSecret: false };
        toast('पिन बदल गया ✓');
        route();
      } catch (e) {
        errEl.textContent = e.message || 'बदलाव नहीं हुआ';
      }
    };
  }

  function renderAdminLogin() {
    const center = document.getElementById('login-center');
    center.innerHTML = `
      <div class="admin-login-wrap">
        <div class="admin-login-brand">
          <h1>Khata</h1>
          <p>Pro Admin Portal</p>
        </div>
        <form class="admin-login-form" id="admin-form" novalidate>
          <div class="field">
            <label for="adm-user">Username</label>
            <input id="adm-user" name="username" autocomplete="username" inputmode="text"
                   required placeholder="admin" aria-required="true" />
          </div>
          <div class="field">
            <label for="adm-pass">Password</label>
            <div class="pass-wrap">
              <input id="adm-pass" name="password" type="password" autocomplete="current-password"
                     required placeholder="••••••••" aria-required="true" />
              <button type="button" class="eye-btn" id="eye-toggle" aria-label="पासवर्ड दिखाएँ">👁</button>
            </div>
          </div>
          <label class="remember-label" style="margin-bottom:16px">
            <input type="checkbox" id="adm-remember" /> Remember me
          </label>
          <div id="adm-err" class="login-err" role="alert"></div>
          <button class="btn-admin-login" type="submit" id="adm-submit">
            <span id="adm-btn-text">Sign in →</span>
          </button>
        </form>
        <button class="login-back" id="back-roles-adm" type="button">← वापस</button>
      </div>`;

    document.getElementById('back-roles-adm').onclick = renderRolePicker;
    document.getElementById('eye-toggle').onclick = () => {
      const inp = document.getElementById('adm-pass');
      inp.type = inp.type === 'password' ? 'text' : 'password';
    };

    document.getElementById('admin-form').onsubmit = async (e) => {
      e.preventDefault();
      const username = document.getElementById('adm-user').value.trim();
      const password = document.getElementById('adm-pass').value;
      const errEl = document.getElementById('adm-err');
      const btn = document.getElementById('adm-submit');
      errEl.textContent = '';
      if (!username || !password) { errEl.textContent = 'Username and password required'; return; }
      btn.disabled = true;
      document.getElementById('adm-btn-text').textContent = 'Signing in…';
      try {
        const { user } = await api('/auth/login', { method: 'POST', body: { username, password } });
        state.user = user;
        route();
      } catch (err) {
        errEl.textContent = err.message || 'Login failed';
        btn.disabled = false;
        document.getElementById('adm-btn-text').textContent = 'Sign in →';
      }
    };
  }

  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* */ }
    state.user = null;
    // Clear remembered shop on logout
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
    app.innerHTML = `
      <div class="admin-shell" data-lang="${state.lang}">
        <nav class="admin-nav" role="navigation" aria-label="Admin navigation">
          <div class="nav-brand">Khata</div>
          <p class="nav-tag">${t('welcome')}</p>
          <button class="nav-item ${state.adminView === 'overview' ? 'active' : ''}" data-view="overview">${t('overview')}</button>
          <button class="nav-item ${state.adminView === 'review' ? 'active' : ''}" data-view="review">${t('review')}</button>
          <button class="nav-item ${state.adminView === 'ledger' ? 'active' : ''}" data-view="ledger">${t('ledger')}</button>
          <button class="nav-item ${state.adminView === 'customers' ? 'active' : ''}" data-view="customers">${state.lang === 'hi' ? 'ग्राहक' : 'Customers'}</button>
          <button class="nav-item ${state.adminView === 'audit' ? 'active' : ''}" data-view="audit">${t('audit')}</button>
          <div class="lang-switch" role="group" aria-label="Language">
            <button type="button" data-lang="en" class="${state.lang === 'en' ? 'active' : ''}">EN</button>
            <button type="button" data-lang="hi" class="${state.lang === 'hi' ? 'active' : ''}">हिं</button>
          </div>
          <button class="nav-item" id="admin-logout" style="margin-top:16px;opacity:.7">${t('logout')}</button>
        </nav>
        <main class="admin-main" role="main">
          <header class="admin-header">
            <h1 id="admin-title"></h1>
          </header>
          <div id="admin-content"></div>
        </main>
      </div>`;

    app.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
      btn.onclick = () => { state.adminView = btn.dataset.view; renderAdmin(); };
    });
    document.getElementById('admin-logout').onclick = logout;
    app.querySelectorAll('.lang-switch button').forEach((btn) => {
      btn.onclick = () => {
        state.lang = btn.dataset.lang;
        localStorage.setItem('khata_lang', state.lang);
        renderAdmin();
      };
    });

    const titles = {
      overview: t('overview'), review: t('review'), ledger: t('ledger'),
      audit: t('audit'), customers: state.lang === 'hi' ? 'ग्राहक' : 'Customers',
    };
    document.getElementById('admin-title').textContent = titles[state.adminView] || '';

    if (state.adminView === 'overview') loadOverview();
    else if (state.adminView === 'review') loadReviewQueue();
    else if (state.adminView === 'ledger') loadLedger();
    else if (state.adminView === 'customers') loadCustomers();
    else if (state.adminView === 'audit') loadAudit();
  }

  // ─── ADMIN: OVERVIEW ─────────────────────────────────────────────────────────
  async function loadOverview() {
    const el = document.getElementById('admin-content');
    el.innerHTML = '<p class="muted">Loading…</p>';
    try {
      const m = await api('/admin/metrics');
      const hasData = m.activeCustomers > 0 || m.totalOutstanding > 0;
      el.innerHTML = `
        <div class="metrics">
          <div class="metric"><div class="label">${t('outstanding')}</div><div class="value warn">${inr(m.totalOutstanding)}</div></div>
          <div class="metric"><div class="label">${t('collections')}</div><div class="value ok">${inr(m.todayCollections)}</div></div>
          <div class="metric"><div class="label">${t('activeCust')}</div><div class="value">${m.activeCustomers}</div></div>
          <div class="metric"><div class="label">${t('pendingPhotos')}</div><div class="value warn">${m.pendingPhotos}</div></div>
        </div>
        <div class="panel">
          <h3 style="margin:0 0 12px">${t('shop')} — ${state.lang === 'hi' ? 'दुकानवार' : 'By shop'}</h3>
          ${!hasData ? `<p class="empty-state">${t('noData')}<br><small style="font-weight:500">${state.lang === 'hi' ? 'ग्राहक जोड़ें और हिसाब लिखें।' : 'Add customers and entries to see data here.'}</small></p>` : `
          <table class="data-table">
            <thead><tr><th>${t('shop')}</th><th>${t('outstanding')}</th><th>${t('activeCust')}</th></tr></thead>
            <tbody>
              ${(m.byShop || []).map((s) =>
                `<tr><td>${escapeHtml(s._id)}</td><td>${inr(s.outstanding)}</td><td>${s.count}</td></tr>`
              ).join('') || `<tr><td colspan="3" class="muted">${t('noData')}</td></tr>`}
            </tbody>
          </table>`}
        </div>`;
    } catch (e) {
      el.innerHTML = `<p class="muted">${escapeHtml(e.message)}</p>`;
    }
  }

  // ─── ADMIN: DIARY REVIEW QUEUE ───────────────────────────────────────────────
  async function loadReviewQueue() {
    const el = document.getElementById('admin-content');
    el.innerHTML = '<p class="muted">Loading…</p>';
    try {
      const { entries } = await api('/entries/pending-review');
      if (!entries.length) {
        el.innerHTML = `<div class="panel"><p class="empty-state">${t('noPending')}<br><small style="font-weight:500">${state.lang === 'hi' ? 'दुकान से डायरी फोटो आने पर यहाँ दिखेगी।' : 'Diary photos from the shop will appear here.'}</small></p></div>`;
        return;
      }
      state._reviewEntries = entries;
      state._reviewIndex = 0;
      renderReviewUI(el);
    } catch (e) {
      el.innerHTML = `<p class="muted">${escapeHtml(e.message)}</p>`;
    }
  }

  function renderReviewUI(el) {
    const entries = state._reviewEntries || [];
    const idx = state._reviewIndex || 0;
    const entry = entries[idx];
    if (!entry) {
      el.innerHTML = `<div class="panel"><p class="empty-state">${t('noPending')}</p></div>`;
      return;
    }
    const c = entry.customer || {};
    el.innerHTML = `
      <div class="queue-list">
        ${entries.map((e, i) => `
          <button class="queue-item ${i === idx ? 'active' : ''}" type="button" data-i="${i}">
            ${escapeHtml(e.shopId)} · ${escapeHtml((e.customer && (e.customer.displayName || e.customer.name)) || '—')} · ${new Date(e.createdAt).toLocaleString('hi-IN')}
          </button>`).join('')}
      </div>
      <div class="split-review">
        <div class="viewer-pane">
          <div class="viewer-toolbar">
            <button type="button" id="zoom-in">${t('zoomIn')}</button>
            <button type="button" id="zoom-out">${t('zoomOut')}</button>
            <button type="button" id="zoom-reset">${t('resetView')}</button>
          </div>
          <div class="viewer-stage" id="viewer-stage">
            ${entry.imageUrl ? `<img id="viewer-img" src="${escapeHtml(entry.imageUrl)}" alt="diary page" draggable="false" />` : '<p class="muted" style="padding:24px">No image</p>'}
          </div>
        </div>
        <div class="form-pane">
          <h3>${t('review')}</h3>
          <div class="form-grid">
            <div><label>${t('customer')}</label><input id="rv-customer" value="${escapeHtml(c.displayName || c.name || '')}" /></div>
            <div><label>${t('honorific')}</label>
              <div class="chip-row">
                ${['श्री','श्रीमती','कुमारी',''].map((h) => `<button class="chip ${(entry.honorific||'')=== h?'chip--on':''}" type="button" data-h="${h}">${h||'—'}</button>`).join('')}
              </div>
              <input id="rv-honorific" type="hidden" value="${escapeHtml(entry.honorific || '')}" />
            </div>
            <div><label>${t('identifierNote')}</label><input id="rv-identifier" value="${escapeHtml(c.identifierNote || c.relationNote || '')}" /></div>
            <div><label>${t('diaryNo')}</label><input id="rv-diary-no" type="number" value="${c.diaryNo || ''}" /></div>
            <div><label>${t('item')}</label><input id="rv-item" value="${escapeHtml(entry.item || '')}" /></div>
            <div><label>${t('brand')}</label><input id="rv-brand" value="${escapeHtml(entry.brand || '')}" /></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <div><label>${t('qty')}</label><input id="rv-qty" type="number" value="${entry.quantity || 1}" /></div>
              <div><label>${t('rate')}</label><input id="rv-rate" type="number" value="${entry.rate || 0}" /></div>
            </div>
            <div><label>${t('amount')}</label><input id="rv-amount" type="number" value="${entry.amount || 0}" /></div>
            <div><label>${t('time')}</label><input id="rv-time" type="datetime-local" value="${entry.entryTime ? new Date(entry.entryTime).toISOString().slice(0,16) : ''}" /></div>
            <div><label>${t('paymentMode')}</label>
              <select id="rv-payment-mode">
                <option value="">—</option>
                <option value="cash" ${entry.paymentMode==='cash'?'selected':''}>नकद</option>
                <option value="upi" ${entry.paymentMode==='upi'?'selected':''}>UPI</option>
              </select>
            </div>
            <div><label>${t('notes')}</label><textarea id="rv-notes" rows="2">${escapeHtml(entry.notes || entry.note || '')}</textarea></div>
            ${entry.enteredVia ? `<div><label>${t('enteredVia')}</label><span class="badge">${escapeHtml(entry.enteredVia)}</span></div>` : ''}
          </div>
          <div class="form-actions">
            <button class="approve" type="button" id="rv-approve">${t('approvePost')}</button>
            <button class="reject" type="button" id="rv-reject">${t('reject')}</button>
          </div>
        </div>
      </div>`;

    el.querySelectorAll('.queue-item').forEach((btn) => {
      btn.onclick = () => { state._reviewIndex = Number(btn.dataset.i); renderReviewUI(el); };
    });
    el.querySelectorAll('.chip[data-h]').forEach((btn) => {
      btn.onclick = () => {
        document.getElementById('rv-honorific').value = btn.dataset.h;
        el.querySelectorAll('.chip[data-h]').forEach((b) => b.classList.remove('chip--on'));
        btn.classList.add('chip--on');
      };
    });

    initImageViewer();

    document.getElementById('rv-approve').onclick = async () => {
      try {
        let customerId = c._id;
        const name = document.getElementById('rv-customer').value.trim();
        if (name && name !== (c.displayName || c.name)) {
          const resolved = await api('/customers/resolve', { method: 'POST', body: { name, shopId: entry.shopId, createIfMissing: true } });
          if (resolved.customer) customerId = resolved.customer._id;
        }
        await api(`/entries/${entry._id}/approve`, {
          method: 'POST',
          body: {
            customerId,
            item: document.getElementById('rv-item').value,
            brand: document.getElementById('rv-brand').value,
            quantity: document.getElementById('rv-qty').value,
            rate: document.getElementById('rv-rate').value,
            amount: document.getElementById('rv-amount').value,
            notes: document.getElementById('rv-notes').value,
            paymentMode: document.getElementById('rv-payment-mode').value,
            entryTime: document.getElementById('rv-time').value,
            honorific: document.getElementById('rv-honorific').value,
          },
        });
        toast(state.lang === 'hi' ? 'खाते में डाल दिया ✓' : 'Posted to ledger');
        loadReviewQueue();
      } catch (e) { toast(e.message); }
    };

    document.getElementById('rv-reject').onclick = async () => {
      try {
        await api(`/entries/${entry._id}/reject`, { method: 'POST', body: { reason: 'Rejected by admin' } });
        toast(state.lang === 'hi' ? 'रद्द' : 'Rejected');
        loadReviewQueue();
      } catch (e) { toast(e.message); }
    };
  }

  // ─── ADMIN: LEDGER ──────────────────────────────────────────────────────────
  async function loadLedger() {
    const el = document.getElementById('admin-content');
    el.innerHTML = `
      <div class="panel">
        <div class="ledger-filter">
          <select id="lf-shop"><option value="">All shops</option><option value="shop1">दुकान 1</option><option value="shop2">दुकान 2</option></select>
          <select id="lf-type"><option value="">All types</option><option value="sale">उधार</option><option value="payment">जमा</option></select>
          <button class="btn-sm" id="lf-load">Load</button>
        </div>
        <div id="ledger-table"><p class="muted">Loading…</p></div>
      </div>`;
    const load = async () => {
      const shopId = document.getElementById('lf-shop').value;
      const type = document.getElementById('lf-type').value;
      const q = new URLSearchParams({ limit: '200' });
      if (shopId) q.set('shopId', shopId);
      if (type) q.set('type', type);
      const tbl = document.getElementById('ledger-table');
      tbl.innerHTML = '<p class="muted">Loading…</p>';
      try {
        const { entries } = await api(`/admin/ledger?${q}`);
        if (!entries.length) {
          tbl.innerHTML = `<p class="empty-state">${t('noData')}<br><small>${state.lang==='hi'?'दुकान से हिसाब आने पर यहाँ दिखेगा।':'Entries from the shop will appear here.'}</small></p>`;
          return;
        }
        tbl.innerHTML = `<table class="data-table">
          <thead><tr>
            <th>${t('date')}</th><th>${t('time')}</th><th>${t('customer')}</th>
            <th>${t('honorific')}</th><th>${t('identifierNote')}</th>
            <th>${t('item')}</th><th>${t('brand')}</th>
            <th>${t('qty')}</th><th>${t('rate')}</th><th>${t('amount')}</th>
            <th>${t('paymentMode')}</th><th>${t('enteredVia')}</th>
            <th>${t('shop')}</th><th>${t('status')}</th>
          </tr></thead>
          <tbody>
            ${entries.map((e) => {
              const c = e.customer || {};
              return `<tr class="${e.isCleared ? 'row-cleared' : ''}">
                <td>${new Date(e.date).toLocaleDateString('hi-IN')}</td>
                <td>${e.entryTime ? new Date(e.entryTime).toLocaleTimeString('hi-IN',{hour:'2-digit',minute:'2-digit'}) : '—'}</td>
                <td>${escapeHtml(c.displayName || c.name || '—')}</td>
                <td>${escapeHtml(c.honorific || '')}</td>
                <td>${escapeHtml(c.identifierNote || c.relationNote || '')}</td>
                <td>${escapeHtml(e.itemLabel || e.item || '—')}</td>
                <td>${escapeHtml(e.brand || '')}</td>
                <td>${e.quantity || '—'}</td>
                <td>${e.rate ? inr(e.rate) : '—'}</td>
                <td class="${e.type==='payment'?'ok':'warn'}">${inr(e.amount)}</td>
                <td>${escapeHtml(e.paymentMode || '—')}</td>
                <td>${e.enteredVia ? `<span class="badge">${escapeHtml(e.enteredVia)}</span>` : '—'}</td>
                <td>${escapeHtml(e.shopId || '')}</td>
                <td>${escapeHtml(e.type==='payment'?'जमा':'उधार')}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`;
      } catch (err) {
        tbl.innerHTML = `<p class="muted">${escapeHtml(err.message)}</p>`;
      }
    };
    document.getElementById('lf-load').onclick = load;
    load();
  }

  // ─── ADMIN: CUSTOMERS ────────────────────────────────────────────────────────
  async function loadCustomers() {
    const el = document.getElementById('admin-content');
    el.innerHTML = `
      <div class="panel">
        <div class="ledger-filter">
          <input id="cq" placeholder="${state.lang==='hi'?'नाम / गाँव / फ़ोन':'Name / Village / Phone'}" style="flex:1" />
          <select id="cq-shop"><option value="">All shops</option><option value="shop1">दुकान 1</option><option value="shop2">दुकान 2</option></select>
          <button class="btn-sm" id="cq-load">Search</button>
        </div>
        <div id="cust-table"><p class="muted">Loading…</p></div>
      </div>`;
    const load = async () => {
      const q = document.getElementById('cq').value.trim();
      const shopId = document.getElementById('cq-shop').value;
      const params = new URLSearchParams({ all: '1' });
      if (q) params.set('q', q);
      if (shopId) params.set('shopId', shopId);
      const tbl = document.getElementById('cust-table');
      tbl.innerHTML = '<p class="muted">Loading…</p>';
      try {
        const { customers } = await api(`/customers?${params}`);
        if (!customers.length) {
          tbl.innerHTML = `<p class="empty-state">${t('noData')}<br><small>${state.lang==='hi'?'ग्राहक अभी तक नहीं जोड़े गए।':'No customers yet.'}</small></p>`;
          return;
        }
        tbl.innerHTML = `<table class="data-table">
          <thead><tr>
            <th>${t('diaryNo')}</th><th>${t('honorific')}</th><th>${state.lang==='hi'?'नाम':'Name'}</th>
            <th>${t('identifierNote')}</th><th>${state.lang==='hi'?'गाँव':'Village'}</th>
            <th>${state.lang==='hi'?'मोबाइल':'Mobile'}</th><th>${t('outstanding')}</th><th>${t('shop')}</th>
          </tr></thead>
          <tbody>
            ${customers.map((c) => `<tr>
              <td>${c.diaryNo || '—'}</td>
              <td>${escapeHtml(c.honorific || '')}</td>
              <td>${escapeHtml(c.name)}</td>
              <td>${escapeHtml(c.identifierNote || c.relationNote || '')}</td>
              <td>${escapeHtml(c.village || '—')}</td>
              <td>${escapeHtml(c.phone || '—')}${c.mobile2 ? ' / '+escapeHtml(c.mobile2) : ''}</td>
              <td class="${c.balance>0?'warn':'ok'}">${inr(c.balance)}</td>
              <td>${escapeHtml(c.shopId)}</td>
            </tr>`).join('')}
          </tbody>
        </table>`;
      } catch (err) {
        tbl.innerHTML = `<p class="muted">${escapeHtml(err.message)}</p>`;
      }
    };
    document.getElementById('cq-load').onclick = load;
    document.getElementById('cq').addEventListener('keydown', (e) => { if (e.key === 'Enter') load(); });
    load();
  }

  // ─── ADMIN: AUDIT ────────────────────────────────────────────────────────────
  async function loadAudit() {
    const el = document.getElementById('admin-content');
    el.innerHTML = '<p class="muted">Loading…</p>';
    try {
      const { logs } = await api('/admin/audit?limit=100');
      if (!logs.length) {
        el.innerHTML = `<div class="panel"><p class="empty-state">${t('noData')}<br><small>Audit logs will appear as actions are taken.</small></p></div>`;
        return;
      }
      el.innerHTML = `<div class="panel"><table class="data-table">
        <thead><tr><th>Time</th><th>Action</th><th>User</th><th>${t('shop')}</th><th>Details</th></tr></thead>
        <tbody>
          ${logs.map((l) => `<tr>
            <td>${new Date(l.createdAt).toLocaleString()}</td>
            <td>${escapeHtml(l.action)}</td>
            <td>${escapeHtml(l.userId?.username || '—')}</td>
            <td>${escapeHtml(l.shopId || '—')}</td>
            <td style="font-size:.85rem;max-width:220px;word-break:break-all">${escapeHtml(JSON.stringify(l.details || {}))}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>`;
    } catch (e) {
      el.innerHTML = `<p class="muted">${escapeHtml(e.message)}</p>`;
    }
  }

  // ─── IMAGE VIEWER ─────────────────────────────────────────────────────────────
  function initImageViewer() {
    const img = document.getElementById('viewer-img');
    const stage = document.getElementById('viewer-stage');
    if (!img || !stage) return;
    let scale = 1, ox = 0, oy = 0, dragging = false, startX, startY;
    const apply = () => { img.style.transform = `translate(${ox}px,${oy}px) scale(${scale})`; };
    const zi = document.getElementById('zoom-in');
    const zo = document.getElementById('zoom-out');
    const zr = document.getElementById('zoom-reset');
    if (zi) zi.onclick = () => { scale = Math.min(4, scale + 0.3); apply(); };
    if (zo) zo.onclick = () => { scale = Math.max(0.5, scale - 0.3); apply(); };
    if (zr) zr.onclick = () => { scale = 1; ox = 0; oy = 0; apply(); };
    img.onmousedown = (e) => { dragging = true; startX = e.clientX - ox; startY = e.clientY - oy; };
    img.onmousemove = (e) => { if (!dragging) return; ox = e.clientX - startX; oy = e.clientY - startY; apply(); };
    img.onmouseup = () => (dragging = false);
    stage.addEventListener('wheel', (e) => { e.preventDefault(); scale = Math.min(4, Math.max(0.5, scale - e.deltaY * 0.001)); apply(); }, { passive: false });
  }

  // ─── Expose & Boot ───────────────────────────────────────────────────────────
  g.KhataApp = { route, renderLogin, logout };
  document.addEventListener('DOMContentLoaded', boot);
})(window);
