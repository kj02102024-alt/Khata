/**
 * Khata Parent (Shop) Portal v2
 * Screens: home → हिसाब लिखें | ग्राहक खोजें | डायरी फोटो
 */
(function (g) {
  const { api, getUser, inr, toast, escapeHtml, playChime, sendWhatsAppStatement, generateWhatsAppStatement } = g.KhataAPI;

  const ITEM_CHIPS = ['साड़ी', 'सूटिंग', 'पर्दा', 'गद्दा', 'रुई/कपास', 'कंबल', 'पैंट-शरट', 'चादर', 'तौलिया', 'अन्य'];
  const UNIT_CHIPS = ['पीस', 'मीटर', 'जोड़ी', 'सेट'];
  const HONORIFIC_CHIPS = ['श्री', 'श्रीमती', 'कुमारी', '—'];

  // ─── Entry form state ────────────────────────────────────────────────────────
  function emptyItem() {
    return { name: '', brand: '', qty: 1, unit: 'पीस', rate: 0, amount: 0 };
  }
  function emptyForm() {
    const now = new Date();
    return {
      diaryNo: '', honorific: '', name: '', identifierNote: '', village: '',
      phone: '', mobile2: '', customerId: null, customerBalance: 0,
      txType: 'sale', // 'sale' = उधार, 'payment' = जमा
      items: [emptyItem()],
      date: fmtDate(now), time: fmtTime(now),
      dueDate: '', dueDateDays: null,
      paymentAmount: 0, paymentMode: 'cash',
      note: '',
      enteredVia: 'typed',
    };
  }
  function fmtDate(d) {
    const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }
  function fmtTime(d) {
    return d.toTimeString().slice(0,5);
  }

  // ─── Active mic tracker ──────────────────────────────────────────────────────
  let _activeMicEngine = null;
  function stopActiveMic() {
    if (_activeMicEngine) { try { _activeMicEngine.cancel(); } catch{} _activeMicEngine = null; }
  }

  // ─── Parent module ───────────────────────────────────────────────────────────
  const Parent = {
    root: null,
    screen: 'home',
    stack: [],
    data: {},
    form: emptyForm(),
    engine: null,

    mount(el) {
      this.root = el;
      this._onlineHandlers();
      this.go('home');
    },

    _onlineHandlers() {
      const sync = async () => {
        if (!navigator.onLine) return;
        try { await g.KhataIDB.flush(api); this._updateSync(); } catch {}
      };
      window.addEventListener('online', sync);
      setInterval(sync, 20000);
      sync();
    },

    go(screen, data) {
      if (this.screen && this.screen !== screen) this.stack.push(this.screen);
      this.screen = screen;
      this.data = data || {};
      this.render();
    },

    back() {
      stopActiveMic();
      const prev = this.stack.pop() || 'home';
      this.screen = prev;
      this.render();
    },

    home() {
      stopActiveMic();
      this.stack = [];
      this.screen = 'home';
      this.render();
    },

    nav(hideHome) {
      return `<div class="p-nav">
        <button type="button" class="p-nav-btn" data-act="back">← पीछे</button>
        ${hideHome ? '' : '<button type="button" class="p-nav-btn" data-act="home">🏠 घर</button>'}
      </div>`;
    },

    async render() {
      const map = {
        home: () => this.viewHome(),
        entry: () => this.viewEntry(),
        search: () => this.viewSearch(),
        customer: () => this.viewCustomer(),
        diary: () => this.viewDiary(),
        pickVillage: () => this.viewPickVillage(),
        saved: () => this.viewSaved(),
        labour: () => this.viewLabour(),
        labourDetail: () => this.viewLabourDetail(),
      };
      await (map[this.screen] || map.home).call(this);
      this.root.querySelectorAll('[data-act="back"]').forEach((b) => (b.onclick = () => this.back()));
      this.root.querySelectorAll('[data-act="home"]').forEach((b) => (b.onclick = () => this.home()));
    },

    _updateSync() {
      const el = this.root?.querySelector('.sync-dot');
      if (!el) return;
      el.classList.toggle('offline', !navigator.onLine);
      el.querySelector('span').textContent = navigator.onLine ? 'जुड़ा' : 'ऑफ़लाइन';
    },

    // ─── HOME ──────────────────────────────────────────────────────────────────
    async viewHome() {
      const user = getUser() || {};
      let count = 0;
      try { ({ count } = await api('/entries/today-count')); } catch {}
      this.root.innerHTML = `
        <div class="p-shell">
          <div class="p-status">
            <span>आज: ${count} एंट्री</span>
            <span class="sync-dot ${navigator.onLine ? '' : 'offline'}"><i></i><span>${navigator.onLine ? 'जुड़ा' : 'ऑफ़लाइन'}</span></span>
          </div>
          <h1 class="p-brand">खाता</h1>
          <p class="p-sub">${escapeHtml(user.displayName || '')} · नमस्ते 🙏</p>

          <div class="p-actions">
            <button class="p-card p-card--voice" type="button" id="go-entry">
              <span class="ico">✍️🎤</span>
              <span class="p-card-label">हिसाब लिखें</span>
              <span class="p-card-hint">बोलकर या लिखकर नया हिसाब</span>
            </button>
            <button class="p-card p-card--search" type="button" id="go-search">
              <span class="ico">🔍</span>
              <span class="p-card-label">ग्राहक खोजें</span>
              <span class="p-card-hint">बचा कितना है देखें</span>
            </button>
            <button class="p-card p-card--labour" type="button" id="go-labour">
              <span class="ico">👷</span>
              <span class="p-card-label">मज़दूर हिसाब</span>
              <span class="p-card-hint">हाज़िरी, एडवांस व वेतन खाता</span>
            </button>
            <button class="p-card p-card--photo" type="button" id="go-diary">
              <span class="ico">📷</span>
              <span class="p-card-label">पुरानी डायरी की फोटो</span>
              <span class="p-card-hint">फोटो खींचकर एडमिन को भेजें</span>
            </button>
          </div>
          <button type="button" id="logout" class="p-logout">दुकान बदलें / बाहर निकलें</button>
        </div>`;

      document.getElementById('go-entry').onclick = () => { this.form = emptyForm(); this.go('entry'); };
      document.getElementById('go-search').onclick = () => this.go('search');
      document.getElementById('go-labour').onclick = () => this.go('labour');
      document.getElementById('go-diary').onclick = () => this.go('diary');
      document.getElementById('logout').onclick = () => {
        g.KhataAPI.clearSession();
        localStorage.removeItem('khata_remembered_shop');
        if (g.KhataApp && g.KhataApp.logout) {
          g.KhataApp.logout();
        } else {
          location.reload();
        }
      };
    },

    // ─── हिसाब लिखें SCREEN ──────────────────────────────────────────────────
    viewEntry() {
      const f = this.form;
      this.root.innerHTML = `
        <div class="p-shell p-entry-shell">
          ${this.nav()}
          <h1 class="p-screen-title">✍️ हिसाब लिखें</h1>

          <!-- MASTER MIC -->
          <button class="master-mic-btn" type="button" id="master-mic">
            <span class="mic-pulse" id="master-pulse">🎤</span>
            <span>सब कुछ एक साथ बोलें</span>
          </button>
          <p class="entry-or-hint">या नीचे हर खाने में लिखिए / हर खाने के 🎤 से बोलिए</p>
          <div id="master-transcript" class="master-transcript hidden"></div>

          <!-- CARD A: ग्राहक की जानकारी -->
          <section class="entry-card" id="card-a">
            <h2 class="entry-card-title">📋 ग्राहक की जानकारी</h2>

            <div class="entry-field-row">
              <label class="entry-label">डायरी क्रमांक</label>
              <div class="entry-input-wrap">
                <input class="entry-input" id="f-diary-no" type="number" inputmode="numeric"
                       value="${escapeHtml(f.diaryNo)}" placeholder="जैसे 42" />
                <button class="field-mic" type="button" data-field="diaryNo" aria-label="बोलकर डायरी नंबर">🎤</button>
              </div>
            </div>

            <div class="entry-field-row">
              <label class="entry-label">आदर</label>
              <div class="chip-row" id="honorific-chips">
                ${HONORIFIC_CHIPS.map((h) => `<button class="chip ${(f.honorific || (h==='—'?'':h)) === (h==='—'?'':h) && f.honorific === (h==='—'?'':h) ? 'chip--on':''}" type="button" data-h="${h==='—'?'':h}">${escapeHtml(h)}</button>`).join('')}
              </div>
            </div>

            <div class="entry-field-row">
              <label class="entry-label">नाम <span class="req">*</span></label>
              <div class="entry-input-wrap">
                <input class="entry-input" id="f-name" type="text" lang="hi"
                       autocomplete="off" value="${escapeHtml(f.name)}" placeholder="जैसे संजय पटेल" />
                <button class="field-mic" type="button" data-field="name" aria-label="बोलकर नाम">🎤</button>
              </div>
              <div class="autocomplete-list" id="ac-name"></div>
              <div id="customer-match-box" class="customer-match-box hidden"></div>
            </div>

            <div class="entry-field-row">
              <label class="entry-label">पहचान / संबंध</label>
              <div class="entry-input-wrap">
                <input class="entry-input" id="f-identifier" type="text" lang="hi"
                       autocomplete="off" value="${escapeHtml(f.identifierNote)}"
                       placeholder="जैसे झोला वाले, संजय की बहन" />
                <button class="field-mic" type="button" data-field="identifierNote" aria-label="बोलकर पहचान">🎤</button>
              </div>
              <div class="autocomplete-list" id="ac-identifier"></div>
            </div>

            <div class="entry-field-row">
              <label class="entry-label">गाँव / पता <span class="req">*</span></label>
              <div class="entry-input-wrap">
                <input class="entry-input" id="f-village" type="text" lang="hi"
                       autocomplete="off" value="${escapeHtml(f.village)}" placeholder="जैसे सोनौरा" />
                <button class="field-mic" type="button" data-field="village" aria-label="बोलकर गाँव">🎤</button>
              </div>
              <div class="autocomplete-list" id="ac-village"></div>
            </div>

            <div class="entry-field-row">
              <label class="entry-label">मोबाइल नंबर</label>
              <div class="entry-input-wrap">
                <input class="entry-input" id="f-phone" type="tel" inputmode="numeric"
                       maxlength="10" value="${escapeHtml(f.phone)}" placeholder="98765 43210" />
                <button class="field-mic" type="button" data-field="phone" aria-label="बोलकर फोन">🎤</button>
                <button class="field-clear" type="button" data-clear="phone">✕</button>
              </div>
              <div id="phone-err" class="field-err hidden">मोबाइल 10 अंक का होना चाहिए (6-9 से शुरू)</div>
              <button class="chip chip--add" type="button" id="add-mobile2" style="${f.mobile2 ? 'display:none' : ''}">+ दूसरा नंबर</button>
            </div>
            <div class="entry-field-row ${f.mobile2 ? '' : 'hidden'}" id="mobile2-row">
              <label class="entry-label">दूसरा नंबर</label>
              <div class="entry-input-wrap">
                <input class="entry-input" id="f-mobile2" type="tel" inputmode="numeric"
                       maxlength="10" value="${escapeHtml(f.mobile2)}" placeholder="98765 43210" />
                <button class="field-clear" type="button" data-clear="mobile2">✕</button>
              </div>
            </div>
          </section>

          <!-- CARD B: सामान का हिसाब -->
          <section class="entry-card" id="card-b">
            <h2 class="entry-card-title">🧵 सामान का हिसाब</h2>
            <div id="items-container"></div>
            <button class="btn-add-item" type="button" id="add-item">➕ एक और सामान जोड़ें</button>
          </section>

          <!-- CARD C: तारीख, समय और रकम -->
          <section class="entry-card" id="card-c">
            <h2 class="entry-card-title">📅 तारीख, समय और रकम</h2>

            <div class="entry-field-row">
              <label class="entry-label">लेन-देन का प्रकार <span class="req">*</span></label>
              <div class="tx-type-toggle" role="group">
                <button class="tx-btn ${f.txType==='sale'?'tx-btn--on':''}" type="button" id="tx-sale">उधार (सामान दिया)</button>
                <button class="tx-btn ${f.txType==='payment'?'tx-btn--on':''}" type="button" id="tx-payment">जमा (पैसे मिले)</button>
              </div>
            </div>

            <div class="entry-field-row">
              <label class="entry-label">तारीख <span class="req">*</span></label>
              <div class="entry-input-wrap">
                <input class="entry-input" id="f-date" type="date" value="${escapeHtml(f.date)}" />
                <button class="field-mic" type="button" data-field="date" aria-label="बोलकर तारीख">🎤</button>
              </div>
            </div>

            <div class="entry-field-row">
              <label class="entry-label">समय <span class="req">*</span></label>
              <div class="entry-input-wrap">
                <input class="entry-input" id="f-time" type="time" value="${escapeHtml(f.time)}" />
                <button class="field-mic" type="button" data-field="time" aria-label="बोलकर समय">🎤</button>
              </div>
            </div>

            <!-- तगादा / कब तक देंगे? (Due Date) -->
            <div class="entry-field-row" id="due-date-section" style="${f.txType === 'sale' ? '' : 'display:none'}">
              <label class="entry-label">तगादा / कब तक देंगे? (Due Date)</label>
              <div class="chip-row due-chips" id="due-chips" style="margin-bottom:8px">
                <button class="chip ${f.dueDateDays === 7 ? 'chip--on' : ''}" type="button" data-due-days="7">7 दिन</button>
                <button class="chip ${f.dueDateDays === 15 ? 'chip--on' : ''}" type="button" data-due-days="15">15 दिन</button>
                <button class="chip ${f.dueDateDays === 30 ? 'chip--on' : ''}" type="button" data-due-days="30">1 महीना</button>
                <button class="chip ${f.dueDateDays === 'custom' ? 'chip--on' : ''}" type="button" data-due-days="custom">📅 तारीख चुनें</button>
              </div>
              <div class="entry-input-wrap ${f.dueDate ? '' : 'hidden'}" id="due-date-wrap">
                <input class="entry-input" id="f-due-date" type="date" value="${escapeHtml(f.dueDate || '')}" />
                <button class="field-clear" type="button" id="clear-due-date">✕</button>
              </div>
              <div class="item-auto-hint" id="due-date-hint" style="${f.dueDate ? '' : 'display:none'}">
                ⏰ नियत तारीख पर ग्राहक को ऑटो-रिमाइंडर संदेश जाएगा और एडमिन को अलर्ट दिखेगा
              </div>
            </div>

            <div class="entry-field-row" id="payment-section" style="${f.txType === 'payment' ? '' : 'display:none'}">
              <label class="entry-label">कितने मिले <span class="req">*</span></label>
              <div class="entry-input-wrap">
                <input class="entry-input" id="f-pay-amt" type="number" inputmode="numeric"
                       value="${f.paymentAmount || ''}" placeholder="₹" />
                <button class="field-mic" type="button" data-field="paymentAmount" aria-label="बोलकर रकम">🎤</button>
              </div>
              <div class="chip-row" style="margin-top:8px">
                <button class="chip ${f.paymentMode==='cash'?'chip--on':''}" type="button" data-pm="cash">नकद</button>
                <button class="chip ${f.paymentMode==='upi'?'chip--on':''}" type="button" data-pm="upi">UPI</button>
              </div>
              <button class="chip chip--full" type="button" id="pay-full" style="margin-top:8px">
                💯 पूरा चुकता (बचा: ${inr(f.customerBalance)})
              </button>
            </div>

            <div class="entry-field-row">
              <label class="entry-label">नोट (वैकल्पिक)</label>
              <div class="entry-input-wrap">
                <input class="entry-input" id="f-note" type="text" lang="hi"
                       value="${escapeHtml(f.note)}" placeholder="जैसे अगली बार तक, आधा बाद में देगा" />
                <button class="field-mic" type="button" data-field="note" aria-label="बोलकर नोट">🎤</button>
                <button class="field-clear" type="button" data-clear="note">✕</button>
              </div>
            </div>
          </section>

          <!-- STICKY BOTTOM BAR -->
          <div class="entry-sticky-bar" id="sticky-bar">
            <div class="sticky-summary" id="sticky-summary">इस बिल का कुल: ₹0</div>
            <button class="btn-save-entry" type="button" id="save-entry">✅ सेव करें</button>
          </div>
        </div>`;

      this._wireEntryForm();
    },

    _wireEntryForm() {
      const f = this.form;

      // Render items
      this._renderItems();
      this._updateStickyBar();

      // Honorific chips
      this.root.querySelectorAll('#honorific-chips .chip').forEach((btn) => {
        btn.onclick = () => {
          f.honorific = btn.dataset.h;
          this.root.querySelectorAll('#honorific-chips .chip').forEach((b) => b.classList.remove('chip--on'));
          btn.classList.add('chip--on');
        };
        // Set initial active state
        if (btn.dataset.h === f.honorific) btn.classList.add('chip--on');
        else btn.classList.remove('chip--on');
      });

      // Autocomplete: name
      const nameInp = document.getElementById('f-name');
      nameInp.oninput = () => { f.name = nameInp.value; this._autocomplete('name', nameInp.value, 'ac-name'); this._updateStickyBar(); };

      // Autocomplete: village
      const villageInp = document.getElementById('f-village');
      villageInp.oninput = () => { f.village = villageInp.value; this._autocomplete('village', villageInp.value, 'ac-village'); };

      // Autocomplete: identifier
      const idInp = document.getElementById('f-identifier');
      idInp.oninput = () => { f.identifierNote = idInp.value; this._autocomplete('identifierNote', idInp.value, 'ac-identifier'); };

      // Phone validation
      const phoneInp = document.getElementById('f-phone');
      phoneInp.oninput = () => {
        f.phone = phoneInp.value.replace(/\D/g, '');
        phoneInp.value = f.phone;
        const errEl = document.getElementById('phone-err');
        if (f.phone && (f.phone.length !== 10 || !/^[6-9]/.test(f.phone))) {
          errEl.classList.remove('hidden');
        } else {
          errEl.classList.add('hidden');
          if (f.phone.length === 10) this._lookupByMobile(f.phone);
        }
      };

      // Mobile2
      document.getElementById('add-mobile2').onclick = () => {
        document.getElementById('mobile2-row').classList.remove('hidden');
        document.getElementById('add-mobile2').style.display = 'none';
      };
      const m2 = document.getElementById('f-mobile2');
      if (m2) m2.oninput = () => { f.mobile2 = m2.value.replace(/\D/g, ''); m2.value = f.mobile2; };

      // Diary no
      const dno = document.getElementById('f-diary-no');
      dno.oninput = () => { f.diaryNo = dno.value; };
      // Auto-suggest next diary no if empty
      if (!f.diaryNo) {
        api('/customers/next-diary-no').then(({ nextDiaryNo }) => {
          if (!f.diaryNo && dno) { dno.placeholder = `рекомендуем: ${nextDiaryNo}`; }
        }).catch(() => {});
      }

      // TX type toggle
      document.getElementById('tx-sale').onclick = () => {
        f.txType = 'sale';
        document.getElementById('tx-sale').classList.add('tx-btn--on');
        document.getElementById('tx-payment').classList.remove('tx-btn--on');
        document.getElementById('payment-section').style.display = 'none';
        const dueSec = document.getElementById('due-date-section');
        if (dueSec) dueSec.style.display = '';
        this._updateStickyBar();
      };
      document.getElementById('tx-payment').onclick = () => {
        f.txType = 'payment';
        document.getElementById('tx-payment').classList.add('tx-btn--on');
        document.getElementById('tx-sale').classList.remove('tx-btn--on');
        document.getElementById('payment-section').style.display = '';
        const dueSec = document.getElementById('due-date-section');
        if (dueSec) dueSec.style.display = 'none';
        this._updateStickyBar();
      };

      // Due date (तगादा) chips & inputs
      this.root.querySelectorAll('#due-chips .chip').forEach((btn) => {
        btn.onclick = () => {
          const days = btn.dataset.dueDays;
          this.root.querySelectorAll('#due-chips .chip').forEach((b) => b.classList.remove('chip--on'));
          btn.classList.add('chip--on');
          const wrap = document.getElementById('due-date-wrap');
          const hint = document.getElementById('due-date-hint');
          const inp = document.getElementById('f-due-date');
          if (days === 'custom') {
            f.dueDateDays = 'custom';
            if (wrap) wrap.classList.remove('hidden');
            if (inp) inp.focus();
            if (hint) { hint.style.display = 'block'; hint.textContent = '⏰ इस तारीख तक हिसाब न होने पर ग्राहक को ऑटो-रिमाइंडर संदेश जाएगा'; }
          } else {
            const num = Number(days);
            f.dueDateDays = num;
            const target = new Date();
            target.setDate(target.getDate() + num);
            f.dueDate = fmtDate(target);
            if (inp) inp.value = f.dueDate;
            if (wrap) wrap.classList.remove('hidden');
            if (hint) {
              hint.style.display = 'block';
              hint.textContent = `⏰ ${num} दिन बाद (${new Date(f.dueDate).toLocaleDateString('hi-IN')}) तगादा होगा और ऑटो-रिमाइंडर संदेश जाएगा`;
            }
          }
        };
      });

      const dueDateInp = document.getElementById('f-due-date');
      if (dueDateInp) {
        dueDateInp.onchange = (e) => {
          f.dueDate = e.target.value;
          const hint = document.getElementById('due-date-hint');
          if (hint) {
            hint.style.display = f.dueDate ? 'block' : 'none';
            if (f.dueDate) hint.textContent = `⏰ ${new Date(f.dueDate).toLocaleDateString('hi-IN')} को ऑटो-रिमाइंडर संदेश जाएगा`;
          }
        };
      }

      const clearDueDateBtn = document.getElementById('clear-due-date');
      if (clearDueDateBtn) {
        clearDueDateBtn.onclick = () => {
          f.dueDate = '';
          f.dueDateDays = null;
          const inp = document.getElementById('f-due-date');
          if (inp) inp.value = '';
          const wrap = document.getElementById('due-date-wrap');
          if (wrap) wrap.classList.add('hidden');
          const hint = document.getElementById('due-date-hint');
          if (hint) hint.style.display = 'none';
          this.root.querySelectorAll('#due-chips .chip').forEach((b) => b.classList.remove('chip--on'));
        };
      }

      // Date / time
      document.getElementById('f-date').onchange = (e) => { f.date = e.target.value; };
      document.getElementById('f-time').onchange = (e) => { f.time = e.target.value; };

      // Payment amount
      const payAmt = document.getElementById('f-pay-amt');
      if (payAmt) payAmt.oninput = () => { f.paymentAmount = Number(payAmt.value) || 0; this._updateStickyBar(); };

      // Payment mode chips
      this.root.querySelectorAll('[data-pm]').forEach((btn) => {
        btn.onclick = () => {
          f.paymentMode = btn.dataset.pm;
          this.root.querySelectorAll('[data-pm]').forEach((b) => b.classList.remove('chip--on'));
          btn.classList.add('chip--on');
        };
      });

      // Pay full
      const payFull = document.getElementById('pay-full');
      if (payFull) payFull.onclick = () => {
        f.paymentAmount = f.customerBalance;
        const pa = document.getElementById('f-pay-amt');
        if (pa) pa.value = f.paymentAmount;
        this._updateStickyBar();
      };

      // Note
      const noteInp = document.getElementById('f-note');
      noteInp.oninput = () => { f.note = noteInp.value; };

      // Clear buttons
      this.root.querySelectorAll('[data-clear]').forEach((btn) => {
        btn.onclick = () => {
          const field = btn.dataset.clear;
          const inp = document.getElementById(`f-${field}`);
          if (inp) inp.value = '';
          f[field] = '';
        };
      });

      // Add item button
      document.getElementById('add-item').onclick = () => {
        f.items.push(emptyItem());
        this._renderItems();
      };

      // Per-field mics
      this.root.querySelectorAll('.field-mic').forEach((btn) => {
        btn.onclick = () => this._startFieldMic(btn.dataset.field, btn);
      });

      // Master mic
      document.getElementById('master-mic').onclick = () => this._startMasterMic();

      // Save
      document.getElementById('save-entry').onclick = () => this._saveEntryForm();
    },

    _renderItems() {
      const f = this.form;
      const container = document.getElementById('items-container');
      if (!container) return;
      container.innerHTML = f.items.map((it, idx) => `
        <div class="item-block" data-idx="${idx}">
          <div class="item-block-header">
            <span>सामान ${f.items.length > 1 ? idx + 1 : ''}</span>
            ${f.items.length > 1 ? `<button class="item-delete" type="button" data-del="${idx}">🗑</button>` : ''}
          </div>
          <div class="chip-row item-chips" data-idx="${idx}">
            ${ITEM_CHIPS.map((c) => `<button class="chip ${it.name === c ? 'chip--on' : ''}" type="button" data-item="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}
          </div>
          <div class="entry-field-row">
            <label class="entry-label">सामान का नाम</label>
            <div class="entry-input-wrap">
              <input class="entry-input item-name" data-idx="${idx}" type="text" lang="hi"
                     autocomplete="off" value="${escapeHtml(it.name)}" placeholder="जैसे साड़ी, गद्दा" />
              <button class="field-mic" type="button" data-field="item-${idx}" aria-label="बोलकर सामान">🎤</button>
            </div>
          </div>
          <div class="entry-field-row">
            <label class="entry-label">ब्रांड</label>
            <div class="entry-input-wrap">
              <input class="entry-input item-brand" data-idx="${idx}" type="text" lang="hi"
                     autocomplete="off" value="${escapeHtml(it.brand)}" placeholder="जैसे Raymond" />
              <button class="field-mic" type="button" data-field="brand-${idx}" aria-label="बोलकर ब्रांड">🎤</button>
            </div>
          </div>
          <div class="item-qty-row">
            <div class="entry-field-row" style="flex:1">
              <label class="entry-label">मात्रा</label>
              <div class="qty-stepper">
                <button class="qty-btn" type="button" data-step="-0.5" data-idx="${idx}">−</button>
                <input class="entry-input item-qty" data-idx="${idx}" type="number" inputmode="decimal"
                       value="${it.qty}" min="0.5" step="0.5" style="width:70px;text-align:center" />
                <button class="qty-btn" type="button" data-step="0.5" data-idx="${idx}">+</button>
              </div>
              <div class="chip-row unit-chips" data-idx="${idx}" style="margin-top:6px">
                ${UNIT_CHIPS.map((u) => `<button class="chip ${it.unit === u ? 'chip--on' : ''}" type="button" data-unit="${u}">${u}</button>`).join('')}
              </div>
            </div>
            <div class="entry-field-row" style="flex:1">
              <label class="entry-label">रेट (प्रति इकाई)</label>
              <div class="entry-input-wrap">
                <input class="entry-input item-rate" data-idx="${idx}" type="number" inputmode="numeric"
                       value="${it.rate || ''}" placeholder="₹" />
                <button class="field-mic" type="button" data-field="rate-${idx}" aria-label="बोलकर रेट">🎤</button>
              </div>
            </div>
          </div>
          <div class="entry-field-row">
            <label class="entry-label">रकम <span class="req">*</span></label>
            <div class="entry-input-wrap">
              <input class="entry-input item-amount" data-idx="${idx}" type="number" inputmode="numeric"
                     value="${it.amount || ''}" placeholder="₹" />
              <button class="field-mic" type="button" data-field="amount-${idx}" aria-label="बोलकर रकम">🎤</button>
            </div>
            <div class="item-auto-hint" id="auto-hint-${idx}"></div>
          </div>
        </div>`).join('');

      // Wire item events
      container.querySelectorAll('.item-chips .chip').forEach((btn) => {
        const idx = Number(btn.closest('[data-idx]').dataset.idx);
        btn.onclick = () => {
          container.querySelectorAll(`.item-chips[data-idx="${idx}"] .chip`).forEach((b) => b.classList.remove('chip--on'));
          btn.classList.add('chip--on');
          const nameInp = container.querySelector(`.item-name[data-idx="${idx}"]`);
          if (btn.dataset.item === 'अन्य') {
            // Don't save 'अन्य' — let user type/speak the actual item name
            f.items[idx].name = '';
            if (nameInp) {
              nameInp.value = '';
              nameInp.placeholder = 'सामान का नाम लिखें या 🎤 बोलें…';
              nameInp.style.borderColor = '#d97706';
              nameInp.style.background = '#fffbeb';
              nameInp.focus();
            }
          } else {
            f.items[idx].name = btn.dataset.item;
            if (nameInp) {
              nameInp.value = btn.dataset.item;
              nameInp.placeholder = 'जैसे साड़ी, गद्दा';
              nameInp.style.borderColor = '';
              nameInp.style.background = '';
            }
          }
          this._updateStickyBar();
        };
      });
      container.querySelectorAll('.unit-chips .chip').forEach((btn) => {
        const idx = Number(btn.closest('[data-idx]').dataset.idx);
        btn.onclick = () => {
          f.items[idx].unit = btn.dataset.unit;
          container.querySelectorAll(`.unit-chips[data-idx="${idx}"] .chip`).forEach((b) => b.classList.remove('chip--on'));
          btn.classList.add('chip--on');
        };
      });
      container.querySelectorAll('.item-name').forEach((inp) => {
        const idx = Number(inp.dataset.idx);
        inp.oninput = () => {
          f.items[idx].name = inp.value;
          // Reset highlight once user has typed something
          if (inp.value.trim()) {
            inp.style.borderColor = '';
            inp.style.background = '';
          }
          this._updateStickyBar();
        };
      });
      container.querySelectorAll('.item-brand').forEach((inp) => {
        const idx = Number(inp.dataset.idx);
        inp.oninput = () => { f.items[idx].brand = inp.value; };
      });
      container.querySelectorAll('.item-qty').forEach((inp) => {
        const idx = Number(inp.dataset.idx);
        inp.oninput = () => { f.items[idx].qty = Number(inp.value) || 1; this._autoAmount(idx); };
      });
      container.querySelectorAll('.qty-btn').forEach((btn) => {
        const idx = Number(btn.dataset.idx);
        btn.onclick = () => {
          const step = Number(btn.dataset.step);
          f.items[idx].qty = Math.max(0.5, (f.items[idx].qty || 1) + step);
          const inp = container.querySelector(`.item-qty[data-idx="${idx}"]`);
          if (inp) inp.value = f.items[idx].qty;
          this._autoAmount(idx);
        };
      });
      container.querySelectorAll('.item-rate').forEach((inp) => {
        const idx = Number(inp.dataset.idx);
        inp.oninput = () => { f.items[idx].rate = Number(inp.value) || 0; this._autoAmount(idx); };
      });
      container.querySelectorAll('.item-amount').forEach((inp) => {
        const idx = Number(inp.dataset.idx);
        inp.oninput = () => { f.items[idx].amount = Number(inp.value) || 0; this._updateStickyBar(); };
      });
      container.querySelectorAll('[data-del]').forEach((btn) => {
        const idx = Number(btn.dataset.del);
        btn.onclick = () => { f.items.splice(idx, 1); if (!f.items.length) f.items.push(emptyItem()); this._renderItems(); this._updateStickyBar(); };
      });
      // Per-field mics for items
      container.querySelectorAll('.field-mic').forEach((btn) => {
        btn.onclick = () => this._startFieldMic(btn.dataset.field, btn);
      });
    },

    _autoAmount(idx) {
      const it = this.form.items[idx];
      if (it.qty && it.rate) {
        it.amount = Math.round(it.qty * it.rate * 100) / 100;
        const amtInp = document.querySelector(`.item-amount[data-idx="${idx}"]`);
        if (amtInp) amtInp.value = it.amount;
        const hint = document.getElementById(`auto-hint-${idx}`);
        if (hint) hint.textContent = `${it.qty} × ₹${it.rate} = ₹${it.amount}`;
      }
      this._updateStickyBar();
    },

    _updateStickyBar() {
      const f = this.form;
      const bar = document.getElementById('sticky-summary');
      if (!bar) return;
      const total = f.txType === 'payment'
        ? (f.paymentAmount || 0)
        : f.items.reduce((s, it) => s + (it.amount || 0), 0);
      const old = f.customerBalance || 0;
      const remaining = f.txType === 'payment' ? Math.max(0, old - total) : old + total;
      const payFull = document.getElementById('pay-full');
      if (payFull) payFull.textContent = `💯 पूरा चुकता (बचा: ${inr(f.customerBalance)})`;
      bar.textContent = `इस बिल का कुल: ${inr(total)} · पुराना बचा: ${inr(old)} · नया बचा: ${inr(remaining)}`;
    },

    async _autocomplete(field, q, listId) {
      const list = document.getElementById(listId);
      if (!list) return;
      if (!q || q.length < 2) { list.innerHTML = ''; return; }
      try {
        const { suggestions } = await api(`/customers/autocomplete?field=${field}&q=${encodeURIComponent(q)}`);
        if (!suggestions || !suggestions.length) { list.innerHTML = ''; return; }
        list.innerHTML = suggestions.map((s) => {
          const display = typeof s === 'string' ? s : (s.displayName || s.name || s);
          return `<div class="ac-item" data-val="${escapeHtml(typeof s === 'object' ? JSON.stringify(s) : s)}" data-display="${escapeHtml(display)}">${escapeHtml(display)}</div>`;
        }).join('');
        list.querySelectorAll('.ac-item').forEach((item) => {
          item.onclick = () => {
            if (field === 'name') {
              try {
                const c = JSON.parse(item.dataset.val);
                this._fillCustomer(c);
              } catch {
                document.getElementById('f-name').value = item.dataset.display;
                this.form.name = item.dataset.display;
              }
            } else {
              const inp = document.getElementById(`f-${field === 'identifierNote' ? 'identifier' : field}`);
              if (inp) inp.value = item.dataset.display;
              this.form[field] = item.dataset.display;
            }
            list.innerHTML = '';
          };
        });
      } catch {}
    },

    _fillCustomer(c) {
      const f = this.form;
      f.customerId = c._id;
      f.name = c.name;
      f.honorific = c.honorific || '';
      f.identifierNote = c.identifierNote || c.relationNote || '';
      f.village = c.village || '';
      f.phone = c.phone || '';
      f.mobile2 = c.mobile2 || '';
      f.diaryNo = c.diaryNo || '';
      f.customerBalance = c.balance || 0;

      // Update inputs
      const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
      set('f-name', f.name);
      set('f-identifier', f.identifierNote);
      set('f-village', f.village);
      set('f-phone', f.phone);
      set('f-mobile2', f.mobile2);
      set('f-diary-no', f.diaryNo);

      // Show customer match box
      const box = document.getElementById('customer-match-box');
      if (box) {
        box.classList.remove('hidden');
        box.innerHTML = `✓ मौजूद ग्राहक: ${escapeHtml(c.displayName || c.name)}, ${escapeHtml(c.village || '')} · बचा ${inr(c.balance)}`;
      }
      // Clear autocomplete
      document.getElementById('ac-name').innerHTML = '';
      this._updateStickyBar();

      // Update honorific chips
      this.root.querySelectorAll('#honorific-chips .chip').forEach((btn) => {
        btn.classList.toggle('chip--on', btn.dataset.h === f.honorific);
      });
    },

    async _lookupByMobile(mobile) {
      try {
        const { customer } = await api(`/customers/by-mobile?mobile=${mobile}`);
        if (customer) this._fillCustomer(customer);
      } catch {}
    },

    // ─── FIELD MIC ─────────────────────────────────────────────────────────────
    _startFieldMic(field, btnEl) {
      stopActiveMic();
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (!g.VoiceEngine) { toast('आवाज़ इस ब्राउज़र में नहीं चलती'); return; }
      const engine = new g.VoiceEngine({ silenceMs: 2500 });
      _activeMicEngine = engine;
      this.form.enteredVia = 'voice-field';

      // Visual feedback
      const allMics = this.root.querySelectorAll('.field-mic');
      allMics.forEach((b) => b.classList.remove('mic-active'));
      btnEl.classList.add('mic-active');
      btnEl.textContent = '⏹';

      const setField = (val) => {
        const inp = this._getFieldInput(field);
        if (inp) inp.classList.remove('mic-live-transcribing');
        this._applyFieldValue(field, val);
        btnEl.classList.remove('mic-active');
        btnEl.textContent = '🎤';
        btnEl.onclick = () => this._startFieldMic(field, btnEl);
        stopActiveMic();
      };

      engine.onPartial = (full, interim) => {
        // Show live interim text in the target input with typing feedback
        const inp = this._getFieldInput(field);
        if (inp) {
          inp.value = full;
          inp.classList.add('mic-live-transcribing');
        }
      };

      engine.onComplete = (text) => {
        const inp = this._getFieldInput(field);
        if (inp) inp.classList.remove('mic-live-transcribing');
        const parsed = this._parseFieldValue(field, text);
        setField(parsed);
      };

      engine.onError = () => {
        const inp = this._getFieldInput(field);
        if (inp) inp.classList.remove('mic-live-transcribing');
        btnEl.classList.remove('mic-active');
        btnEl.textContent = '🎤';
        btnEl.onclick = () => this._startFieldMic(field, btnEl);
        stopActiveMic();
      };

      // Tap again = stop
      btnEl.onclick = () => { engine.done(); btnEl.onclick = () => this._startFieldMic(field, btnEl); };

      if (engine.supported) engine.start();
      else toast('आवाज़ उपलब्ध नहीं');
    },

    _getFieldInput(field) {
      const map = {
        name: 'f-name', village: 'f-village', identifierNote: 'f-identifier',
        phone: 'f-phone', diaryNo: 'f-diary-no', note: 'f-note',
        date: 'f-date', time: 'f-time', paymentAmount: 'f-pay-amt',
      };
      if (map[field]) return document.getElementById(map[field]);
      // Item sub-fields: "item-0", "brand-0", "rate-0", "amount-0"
      const m = field.match(/^(\w+)-(\d+)$/);
      if (m) {
        const [, sub, idx] = m;
        return document.querySelector(`.item-${sub}[data-idx="${idx}"]`);
      }
      return null;
    },

    _parseFieldValue(field, rawText) {
      const text = g.VoiceEngine?.cleanPhraseDuplicates ? g.VoiceEngine.cleanPhraseDuplicates(rawText) : String(rawText || '').trim();
      // Field-specific parsing
      if (field === 'phone') return g.KhataApp?.parsePhone ? g.KhataApp.parsePhone(text) : text.replace(/\D/g, '');
      if (field === 'paymentAmount' || field.startsWith('amount') || field.startsWith('rate')) {
        return this._parseAmount(text);
      }
      if (field === 'date') {
        const d = this._parseDateFromSpeech(text);
        return d ? d.toISOString().split('T')[0] : text;
      }
      if (field === 'time') {
        const t = this._parseTimeFromSpeech(text);
        return t ? t.toTimeString().slice(0, 5) : text;
      }
      if (field.startsWith('item')) {
        // Chip match first — but skip 'अन्य' so voice returns actual spoken name
        const lo = text.toLowerCase();
        for (const c of ITEM_CHIPS) {
          if (c === 'अन्य') continue;
          if (lo.includes(c.toLowerCase())) return c;
        }
        return text;
      }
      // For name: strip honorific
      if (field === 'name') {
        for (const h of ['श्रीमती', 'श्री', 'कुमारी']) {
          if (text.startsWith(h)) {
            const rest = text.replace(h, '').trim();
            this.form.honorific = h;
            this.root.querySelectorAll('#honorific-chips .chip').forEach((b) => b.classList.toggle('chip--on', b.dataset.h === h));
            return rest;
          }
        }
      }
      return text;
    },

    _applyFieldValue(field, val) {
      const f = this.form;
      const inp = this._getFieldInput(field);
      if (inp) inp.value = val;

      const m = field.match(/^(\w+)-(\d+)$/);
      if (m) {
        const [, sub, idx] = m;
        f.items[Number(idx)][sub] = sub === 'qty' || sub === 'rate' || sub === 'amount' ? Number(val) : val;
        if (sub === 'qty' || sub === 'rate') this._autoAmount(Number(idx));
      } else {
        f[field] = val;
      }
      if (field === 'name') this._autocomplete('name', val, 'ac-name');
      this._updateStickyBar();
    },

    _parseAmount(text) {
      const normalDigits = (s) => s.replace(/[०-९]/g, (d) => '०१२३४५६७८९'.indexOf(d));
      const t = normalDigits(text.toLowerCase());
      const FRACTIONS = { 'डेढ़': 1.5, 'ढाई': 2.5, 'सवा': 1.25, 'साढ़े': 1.5 };
      for (const [w, v] of Object.entries(FRACTIONS)) {
        if (t.includes(w)) {
          if (t.includes('सौ')) return v * 100;
          if (t.includes('हज़ार') || t.includes('हजार')) return v * 1000;
        }
      }
      const nums = [...t.matchAll(/\b(\d+(?:\.\d+)?)\b/g)].map((m) => Number(m[1]));
      return nums.length ? Math.max(...nums) : 0;
    },

    _parseDateFromSpeech(text) {
      const t = text.toLowerCase();
      const now = new Date();
      if (t.includes('आज')) return now;
      if (t.includes('कल')) { const d = new Date(now); d.setDate(d.getDate()-1); return d; }
      const m = t.match(/(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})/);
      if (m) {
        let [, day, mon, yr] = m;
        yr = Number(yr) < 100 ? 2000 + Number(yr) : Number(yr);
        return new Date(yr, Number(mon)-1, Number(day));
      }
      return null;
    },

    _parseTimeFromSpeech(text) {
      const t = text.toLowerCase();
      const isEve = t.includes('शाम') || t.includes('रात');
      const m = t.match(/(\d{1,2})(?::(\d{2}))?/);
      if (m) {
        let h = Number(m[1]), min = m[2] ? Number(m[2]) : 0;
        if (isEve && h < 12) h += 12;
        const d = new Date(); d.setHours(h, min, 0, 0); return d;
      }
      return null;
    },

    // ─── MASTER MIC ───────────────────────────────────────────────────────────
    _startMasterMic() {
      stopActiveMic();
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (!g.VoiceEngine) { toast('आवाज़ इस ब्राउज़र में नहीं चलती'); return; }

      const btn = document.getElementById('master-mic');
      const pulse = document.getElementById('master-pulse');
      const transcriptBox = document.getElementById('master-transcript');
      btn.classList.add('master-mic--active');
      pulse.textContent = '⏹';
      transcriptBox.classList.remove('hidden');
      transcriptBox.textContent = 'सुन रहा हूँ…';

      this.form.enteredVia = 'voice-master';

      const engine = new g.VoiceEngine({ silenceMs: 3000 });
      _activeMicEngine = engine;

      engine.onPartial = (full) => {
        transcriptBox.textContent = full || 'सुन रहा हूँ…';
        transcriptBox.classList.add('master-transcript--live');
      };
      engine.onComplete = async (text) => {
        transcriptBox.classList.remove('master-transcript--live');
        btn.classList.remove('master-mic--active');
        pulse.textContent = '🎤';
        btn.onclick = () => this._startMasterMic();
        transcriptBox.textContent = text || '';
        stopActiveMic();
        await this._parseMasterTranscript(text);
      };
      engine.onError = () => {
        transcriptBox.classList.remove('master-transcript--live');
        btn.classList.remove('master-mic--active');
        pulse.textContent = '🎤';
        btn.onclick = () => this._startMasterMic();
        stopActiveMic();
      };

      btn.onclick = () => { engine.done(); btn.onclick = () => this._startMasterMic(); };
      if (engine.supported) engine.start();
      else toast('आवाज़ उपलब्ध नहीं');
    },

    async _parseMasterTranscript(text) {
      if (!text || text.length < 2) { toast('कुछ सुनाई नहीं दिया'); return; }
      let parsed;
      try {
        ({ parsed } = await api('/entries/parse-speech', { method: 'POST', body: { text } }));
      } catch { toast('समझ नहीं पाया'); return; }

      // Fill form from parsed
      const f = this.form;
      if (parsed.name) { f.name = parsed.name; const el = document.getElementById('f-name'); if (el) el.value = f.name; }
      if (parsed.honorific) {
        f.honorific = parsed.honorific;
        this.root.querySelectorAll('#honorific-chips .chip').forEach((b) => b.classList.toggle('chip--on', b.dataset.h === f.honorific));
      }
      if (parsed.village) { f.village = parsed.village; const el = document.getElementById('f-village'); if (el) el.value = f.village; }
      if (parsed.phone) { f.phone = parsed.phone; const el = document.getElementById('f-phone'); if (el) el.value = f.phone; }
      if (parsed.identifierNote) { f.identifierNote = parsed.identifierNote; const el = document.getElementById('f-identifier'); if (el) el.value = f.identifierNote; }
      if (parsed.type) f.txType = parsed.type === 'payment' ? 'payment' : 'sale';
      if (parsed.items && parsed.items.length) {
        f.items = parsed.items.map((it) => ({ name: it.name||'', brand: it.brand||'', qty: it.qty||1, unit: it.unit||'पीस', rate: it.rate||0, amount: it.amount||0 }));
      } else if (parsed.item || parsed.amount) {
        f.items = [{ name: parsed.item || 'सामान', brand: parsed.brand || '', qty: parsed.qty || 1, unit: parsed.unit || 'पीस', rate: parsed.rate || 0, amount: parsed.amount || 0 }];
      }
      if (parsed.note) { f.note = parsed.note; const el = document.getElementById('f-note'); if (el) el.value = f.note; }
      if (parsed.dueDate) {
        const d = new Date(parsed.dueDate);
        if (!isNaN(d.getTime())) {
          f.dueDate = fmtDate(d);
          const wrap = document.getElementById('due-date-wrap');
          const inp = document.getElementById('f-due-date');
          const hint = document.getElementById('due-date-hint');
          if (inp) inp.value = f.dueDate;
          if (wrap) wrap.classList.remove('hidden');
          if (hint) {
            hint.style.display = 'block';
            hint.textContent = `⏰ नियत तारीख: ${d.toLocaleDateString('hi-IN')} को ऑटो-रिमाइंडर संदेश जाएगा`;
          }
        }
      }

      this._renderItems();
      this._updateStickyBar();

      // Check required fields and ask one at a time
      const required = f.txType === 'sale'
        ? [{ key: 'name', q: 'ग्राहक का नाम बताइए?' }, { key: 'village', q: 'गाँव का नाम बताइए?' }]
        : [{ key: 'name', q: 'ग्राहक का नाम बताइए?' }];
      const itemRequired = f.txType === 'sale' && !f.items.some((it) => it.amount > 0);

      for (const { key, q } of required) {
        if (!f[key]) {
          await this._askMissingField(key, q);
        }
      }
      if (itemRequired) {
        await this._askMissingField('item-0', 'कितने रुपये का सामान? रकम बताइए।');
      }

      // Read-back
      await this._speakReadback();
    },

    async _askMissingField(field, question) {
      if (!g.VoiceEngine) return;
      const engine = new g.VoiceEngine({ silenceMs: 2500 });
      await engine.speak(question, 0.85);
      return new Promise((resolve) => {
        engine.onComplete = (text) => {
          if (text) this._applyFieldValue(field, this._parseFieldValue(field, text));
          resolve();
        };
        engine.start();
      });
    },

    async _speakReadback() {
      const f = this.form;
      const totalAmt = f.txType === 'payment'
        ? f.paymentAmount
        : f.items.reduce((s, it) => s + (it.amount || 0), 0);
      const itemNames = f.items.map((it) => it.name || 'सामान').join(', ');
      const summary = `${f.name || 'ग्राहक'}, ${f.village || ''}, ${itemNames}, ${totalAmt} रुपये। क्या यह सही है?`;

      this.root.innerHTML += `
        <div class="readback-overlay" id="readback-overlay">
          <div class="readback-box">
            <p>${escapeHtml(summary)}</p>
            <div class="btn-row-big">
              <button class="btn-yes" type="button" id="rb-yes">✅ हाँ, सही है</button>
              <button class="btn-edit" type="button" id="rb-edit">✏️ बदलें</button>
            </div>
          </div>
        </div>`;

      document.getElementById('rb-yes').onclick = () => {
        document.getElementById('readback-overlay')?.remove();
        this._saveEntryForm();
      };
      document.getElementById('rb-edit').onclick = () => {
        document.getElementById('readback-overlay')?.remove();
      };

      if (g.VoiceEngine) {
        const engine = new g.VoiceEngine({ silenceMs: 10000 });
        await engine.speak(summary, 0.85);
        engine.listenOnce(10000).then((ans) => {
          if (!ans) return;
          const lo = ans.toLowerCase();
          const yes = ['हाँ','हां','सही','ठीक','जी','ok','yes'].some((y) => lo.includes(y));
          const no = ['नहीं','नही','ग़लत','गलत','बदल','no'].some((n) => lo.includes(n));
          if (yes) { document.getElementById('readback-overlay')?.remove(); this._saveEntryForm(); }
          else if (no) document.getElementById('readback-overlay')?.remove();
        });
      }
    },

    // ─── SAVE ENTRY ───────────────────────────────────────────────────────────
    async _saveEntryForm() {
      const f = this.form;

      // Validate
      if (!f.name) { toast('नाम ज़रूरी है'); return; }
      if (f.txType === 'sale' && !f.village) { toast('गाँव ज़रूरी है'); return; }
      const totalAmt = f.txType === 'payment'
        ? (f.paymentAmount || 0)
        : f.items.reduce((s, it) => s + (it.amount || 0), 0);
      if (!totalAmt) { toast('रकम ज़रूरी है'); return; }

      // Build payload
      const dateTime = new Date(`${f.date}T${f.time}:00`);
      const payload = {
        customerId: f.customerId || undefined,
        customerName: f.name,
        honorific: f.honorific,
        identifierNote: f.identifierNote,
        village: f.village,
        phone: f.phone || undefined,
        mobile2: f.mobile2 || undefined,
        diaryNo: f.diaryNo || undefined,
        type: f.txType === 'payment' ? 'payment' : 'sale',
        items: f.txType === 'sale' ? f.items : [],
        amount: totalAmt,
        date: dateTime.toISOString(),
        entryTime: dateTime.toISOString(),
        paymentMode: f.txType === 'payment' ? f.paymentMode : undefined,
        dueDate: f.txType === 'sale' && f.dueDate ? new Date(`${f.dueDate}T12:00:00`).toISOString() : undefined,
        dueDateNote: f.dueDateDays ? `${f.dueDateDays} दिन` : undefined,
        note: f.note,
        notes: f.note,
        enteredVia: f.enteredVia || 'typed',
        status: 'approved',
      };

      const btn = document.getElementById('save-entry');
      if (btn) btn.disabled = true;

      if (!navigator.onLine) {
        await g.KhataIDB.enqueue({ kind: 'entry', payload });
        toast('लिख लिया ✓ — इंटरनेट आने पर चला जाएगा', { ms: 5000 });
        this._showSaved('लिख लिया ✓\n(इंटरनेट आने पर चला जाएगा)');
        return;
      }

      try {
        const { entry, customer } = await api('/entries', { method: 'POST', body: payload });
        playChime();
        // Undo for 10 seconds
        const entryId = entry?._id;
        this._showSaved('लिख लिया ✓');
        // Reset form for next entry
        this.form = emptyForm();
      } catch (e) {
        if (btn) btn.disabled = false;
        // If ambiguous customer → show picker
        if (e.data?.match === 'ambiguous') {
          this.go('pickVillage', { customers: e.data.customers, parsed: { ...f }, prompt: e.data.promptHi || 'कौन से गाँव के?' });
          return;
        }
        toast(e.message || 'सेव नहीं हुआ, फिर कोशिश करें');
      }
    },

    // ─── SAVED FLASH ─────────────────────────────────────────────────────────
    _showSaved(msg) {
      this.root.innerHTML = `
        <div class="p-shell p-saved">
          <div class="saved-flash">
            <div class="check">✓</div>
            <h1>${escapeHtml(msg)}</h1>
            <button class="btn-huge btn-primary" type="button" id="back-home" style="margin-top:24px">🏠 घर</button>
            <button class="btn-huge btn-ghost" type="button" id="next-entry" style="margin-top:12px">➕ अगला हिसाब</button>
          </div>
        </div>`;
      document.getElementById('back-home').onclick = () => this.home();
      document.getElementById('next-entry').onclick = () => { this.form = emptyForm(); this.go('entry'); };
      setTimeout(() => this.home(), 3000);
    },

    // ─── PICK VILLAGE (disambiguation) ───────────────────────────────────────
    viewPickVillage() {
      const { customers, parsed, prompt } = this.data;
      this.root.innerHTML = `
        <div class="p-shell p-screen">
          ${this.nav()}
          <h1>${escapeHtml(prompt || 'कौन से गाँव के?')}</h1>
          <div class="btn-col" id="villages"></div>
        </div>`;
      const box = document.getElementById('villages');
      customers.forEach((c) => {
        const b = document.createElement('button');
        b.className = 'btn-huge btn-ink';
        b.type = 'button';
        b.innerHTML = `${escapeHtml(c.village || 'अन्य')}<br/><span style="font-size:18px;font-weight:600">${escapeHtml(c.displayName || c.name)} · बचा ${inr(c.balance)}</span>`;
        b.onclick = () => {
          this.form.customerId = c._id;
          this.form.name = c.name;
          this.form.village = c.village;
          this.form.customerBalance = c.balance;
          this._saveEntryForm();
        };
        box.appendChild(b);
      });
    },

    // ─── SEARCH ──────────────────────────────────────────────────────────────
    async viewSearch() {
      this.root.innerHTML = `
        <div class="p-shell p-screen">
          ${this.nav()}
          <h1>🔍 ग्राहक खोजें</h1>
          <div class="search-box">
            <input id="sq" placeholder="नाम / गाँव / फ़ोन" lang="hi" />
            <button class="mic-mini" type="button" id="s-mic" aria-label="बोलकर खोजें">🎤</button>
          </div>
          <div class="tabs" role="tablist">
            <button role="tab" type="button" class="on" data-tab="active">बचा है</button>
            <button role="tab" type="button" data-tab="settled">चुकता ग्राहक</button>
          </div>
          <div id="slist"><p class="empty">लोड…</p></div>
        </div>`;

      let tab = 'active';
      const load = async () => {
        const q = document.getElementById('sq')?.value.trim() || '';
        try {
          const params = new URLSearchParams({ q });
          if (tab === 'settled') params.set('settled', '1');
          const { customers } = await api(`/customers?${params}`);
          const box = document.getElementById('slist');
          if (!box) return;
          if (!customers.length) {
            box.innerHTML = `<p class="empty-state">${tab === 'settled' ? 'कोई चुकता खाता नहीं' : 'अभी कोई हिसाब नहीं है'}</p>`;
            return;
          }
          box.innerHTML = customers.map((c) => `
            <button class="cust-card" type="button" data-id="${c._id}">
              <div>
                <div class="nm">
                  ${c.diaryNo ? `<span class="hsi-diary-pill" style="display:inline-block;margin-right:6px">#${c.diaryNo}</span>` : ''}
                  ${c.honorific ? `${escapeHtml(c.honorific)} ` : ''}${escapeHtml(c.displayName || c.name)}
                </div>
                <div class="rel">
                  ${c.identifierNote || c.relationNote ? `${escapeHtml(c.identifierNote || c.relationNote)} · ` : ''}
                  📍 ${escapeHtml(c.village || '—')}
                  ${c.phone ? ' · 📞 ' + escapeHtml(c.phone) : ''}
                </div>
              </div>
              <div class="bacha" style="${tab === 'settled' ? 'color:#15803d' : ''}">${tab === 'settled' ? 'चुकता ✓' : 'बचा ' + inr(c.balance)}</div>
            </button>`).join('');
          // Use event delegation so child-element taps don't break navigation
          box.onclick = (e) => {
            const card = e.target.closest('.cust-card');
            if (card) this.go('customer', { id: card.dataset.id });
          };
        } catch {
          const b = document.getElementById('slist');
          if (b) b.innerHTML = '<p class="empty">सूची नहीं खुली</p>';
        }
      };

      document.getElementById('sq').oninput = () => { clearTimeout(this._st); this._st = setTimeout(load, 220); };
      this.root.querySelectorAll('.tabs button').forEach((b) => {
        b.onclick = () => {
          this.root.querySelectorAll('.tabs button').forEach((x) => x.classList.remove('on'));
          b.classList.add('on'); tab = b.dataset.tab; load();
        };
      });
      document.getElementById('s-mic').onclick = async () => {
        if (!g.VoiceEngine) return;
        const eng = new g.VoiceEngine({ silenceMs: 2500 });
        await eng.speak('किसका नाम ढूँढना है?', 0.85);
        const t = await eng.listenOnce(5000);
        if (t) { document.getElementById('sq').value = t; load(); }
      };
      load();
    },

    // ─── CUSTOMER DETAIL (PASSBOOK KHATA SHEET) ───────────────────────────────
    async viewCustomer() {
      try {
        const { customer, entries } = await api(`/customers/${this.data.id}`);
        const user = getUser() || {};
        const shopTitle = user.displayName || (customer.shopId === 'shop2' ? 'दुकान 2' : 'दुकान 1');

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
        const displayList = [...sortedChrono].reverse();

        const renderPassbookRows = (list) => {
          if (!list.length) {
            return `
              <div class="pb-empty-state">
                <div style="font-size:3rem;margin-bottom:8px">📖</div>
                <div style="font-weight:700;font-size:1.15rem;color:var(--forest)">अभी कोई हिसाब दर्ज नहीं है</div>
                <p style="color:var(--ink-soft);font-size:.9rem;margin:4px 0 0">सामान देने पर <strong>− उधार</strong> या पैसे मिलने पर <strong>+ जमा</strong> दबाएँ।</p>
              </div>`;
          }

          return list.map((e) => {
            const isPayment = e.type === 'payment';
            const cleared = e.isCleared || (e.settledAmount >= e.amount && !isPayment);
            const itemLabel = e.items && e.items.length
              ? e.items.map((it) => `${it.name}${it.qty && it.qty > 1 ? ` (${it.qty} ${it.unit || 'पीस'})` : ''}`).join(', ')
              : (e.item || (isPayment ? 'जमा भुगतान' : 'उधार सामान'));

            const dObj = new Date(e.date);
            const dateStr = dObj.toLocaleDateString('hi-IN', { day: '2-digit', month: 'short', year: 'numeric' });
            const timeStr = e.entryTime ? new Date(e.entryTime).toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit' }) : '';

            return `
              <div class="passbook-row ${isPayment ? 'pb-row--payment' : 'pb-row--sale'} ${cleared ? 'cleared' : ''}">
                <div class="pb-col-main">
                  <div class="pb-item-title">
                    <strong style="color:var(--ink);font-size:1.05rem">${escapeHtml(itemLabel)}</strong>
                    ${e.brand ? `<span class="pb-brand-tag">${escapeHtml(e.brand)}</span>` : ''}
                  </div>
                  <div class="pb-meta-line">
                    <span class="pb-date-pill">📅 ${dateStr}${timeStr ? ' · ⏰ ' + timeStr : ''}</span>
                    ${e.paymentMode ? `<span class="pb-mode-pill">${escapeHtml(e.paymentMode.toUpperCase())}</span>` : ''}
                  </div>
                  ${e.dueDate ? `
                    <div class="pb-due-chip">
                      ⏰ अंतिम भुगतान तिथि: ${new Date(e.dueDate).toLocaleDateString('hi-IN')}${e.dueDateNote ? ' (' + escapeHtml(e.dueDateNote) + ')' : ''}
                    </div>` : ''}
                  ${e.note || e.notes ? `<div class="pb-note-text">📝 ${escapeHtml(e.note || e.notes)}</div>` : ''}
                </div>

                <div class="pb-col-amt">
                  <div class="pb-amt-badge ${isPayment ? 'pb-jama' : 'pb-udaar'}">
                    <span class="pb-amt-type">${isPayment ? '↓ जमा' : '↑ उधार'}</span>
                    <span class="pb-amt-val">${isPayment ? '−' : '+'}${inr(e.amount)}</span>
                  </div>
                  <div class="pb-running-pill" title="इस लेन-देन के बाद बचा हुआ खाता">
                    <span class="pb-rp-label">बाकी:</span>
                    <span class="pb-rp-val">${inr(e.runningBalance)}</span>
                  </div>
                </div>
              </div>`;
          }).join('');
        };

        const isSettled = (customer.balance || 0) <= 0;

        this.root.innerHTML = `
          <div class="p-shell p-screen passbook-shell">
            ${this.nav()}

            <!-- Customer Passbook Header Card -->
            <div class="pinned-bacha passbook-header-card">
              <div class="cust-header">
                ${customer.diaryNo ? `<span class="pb-diary-badge">📖 #${customer.diaryNo}</span>` : ''}
                ${customer.honorific ? `<span class="honorific-badge">${escapeHtml(customer.honorific)}</span>` : ''}
                <span class="pb-cust-name">${escapeHtml(customer.name)}</span>
              </div>
              ${customer.identifierNote || customer.relationNote ? `<div class="cust-note">👤 ${escapeHtml(customer.identifierNote || customer.relationNote)}</div>` : ''}
              <div class="rel" style="color:rgba(255,255,255,.9);font-size:1rem;margin-top:2px">
                <span>📍 ${escapeHtml(customer.village || 'गाँव दर्ज नहीं')}</span>
                ${customer.phone ? ` · <a href="tel:${escapeHtml(customer.phone)}" class="pb-phone-link">📞 ${escapeHtml(customer.phone)}</a>` : ''}
              </div>

              <div class="pb-header-balance-wrap">
                <div class="pb-balance-box ${isSettled ? 'pb-bal-settled' : 'pb-bal-pending'}">
                  <div class="pb-bal-caption">कुल बाकी (Net Balance)</div>
                  <div class="pb-bal-figure">${inr(customer.balance || 0)}</div>
                  <div class="pb-bal-status">${isSettled ? 'खाता चुकता है ✓' : 'भुगतान शेष है ⚠️'}</div>
                </div>
              </div>

              <div class="pb-header-actions-row">
                <button type="button" class="pb-hdr-btn pb-btn-wa" id="pb-share-wa">
                  <span>📲 WhatsApp पर हिसाब भेजें</span>
                </button>
                <button type="button" class="pb-hdr-btn pb-btn-recalc" id="pb-recalc-btn" title="खाता पुनः जाँचे">
                  <span>🔄 रीकैलकुलेट</span>
                </button>
              </div>
            </div>

            <!-- Two Large Prominent Buttons: - उधार & + जमा -->
            <div class="passbook-action-dock" id="pb-action-dock">
              <button class="pb-dock-btn pb-dock-udaar" type="button" id="pb-open-udaar">
                <span class="dock-btn-icon">🔴 ✍️</span>
                <span class="dock-btn-label">− उधार</span>
                <span class="dock-btn-hint">सामान दिया (Debit)</span>
              </button>
              <button class="pb-dock-btn pb-dock-jama" type="button" id="pb-open-jama">
                <span class="dock-btn-icon">🟢 💰</span>
                <span class="dock-btn-label">+ जमा</span>
                <span class="dock-btn-hint">पैसा मिला (Credit)</span>
              </button>
            </div>

            <!-- Filter tabs -->
            <div class="tabs" role="tablist" id="pb-filter-tabs" style="margin-top:16px">
              <button role="tab" type="button" class="on" data-filter="all">सब हिसाब (${entries.length})</button>
              <button role="tab" type="button" data-filter="sale">केवल उधार</button>
              <button role="tab" type="button" data-filter="payment">केवल जमा</button>
            </div>

            <!-- Passbook Entries Container -->
            <div class="diary-page passbook-entries-list" id="pb-entries-container">
              ${renderPassbookRows(displayList)}
            </div>

            <!-- Bottom helper link to full manual entry if ever needed -->
            <div style="text-align:center;margin:24px 0 32px">
              <button type="button" id="pb-full-form-link" class="pb-secondary-link">
                ✍️ विस्तृत / बहु-सामान फ़ॉर्म खोलें →
              </button>
            </div>

            <!-- Modal Container for In-Page Udaar & Jama -->
            <div id="pb-inline-modal-root"></div>
          </div>`;

        // Wire Filter tabs
        this.root.querySelectorAll('#pb-filter-tabs button').forEach((b) => {
          b.onclick = () => {
            this.root.querySelectorAll('#pb-filter-tabs button').forEach((x) => x.classList.remove('on'));
            b.classList.add('on');
            const filter = b.dataset.filter;
            const filtered = filter === 'all' ? displayList : displayList.filter((e) => e.type === filter);
            const container = document.getElementById('pb-entries-container');
            if (container) container.innerHTML = renderPassbookRows(filtered);
          };
        });

        // Wire WhatsApp Statement
        document.getElementById('pb-share-wa').onclick = () => {
          sendWhatsAppStatement(customer, displayList, shopTitle);
        };

        // Wire Recalculate
        document.getElementById('pb-recalc-btn').onclick = async () => {
          try {
            await api(`/customers/${customer._id}/recalc`, { method: 'POST' });
            toast('खाता पुनः जाँचा गया ✓');
            this.viewCustomer();
          } catch (e) {
            toast('पुनः जाँच नहीं हो सकी: ' + e.message);
          }
        };

        // Wire Two Big Action Buttons
        document.getElementById('pb-open-udaar').onclick = () => {
          this._showQuickUdaarModal(customer, () => this.viewCustomer());
        };

        document.getElementById('pb-open-jama').onclick = () => {
          this._showQuickJamaModal(customer, () => this.viewCustomer());
        };

        // Wire Detailed Form
        document.getElementById('pb-full-form-link').onclick = () => {
          this.form = emptyForm();
          this._fillCustomer(customer);
          this.form.txType = 'sale';
          this.go('entry');
        };

      } catch (err) {
        toast('खाता नहीं खुला: ' + (err.message || 'त्रुटि'));
        this.back();
      }
    },

    // ─── QUICK UDAAR (DEBIT) IN-PAGE MODAL ─── Structured Multi-Item Form ───────
    _showQuickUdaarModal(customer, onSaved) {
      stopActiveMic();
      const modalRoot = document.getElementById('pb-inline-modal-root');
      if (!modalRoot) return;

      const UDAAR_ITEM_CHIPS = ['साड़ी', 'सूटिंग', 'पर्दा', 'गद्दा', 'रुई/कपास', 'कंबल', 'पैंट-शर्ट', 'चादर', 'तौलिया', 'अन्य'];
      const UDAAR_UNIT_CHIPS = ['पीस', 'मीटर', 'जोड़ी', 'सेट'];
      let items = [{ name: '', brand: '', qty: 1, unit: 'पीस', rate: '', amount: '' }];
      let dueDateDays = null;
      let dueDateCustom = '';

      // ── Helper: render one item block HTML ──
      const renderItemBlock = (it, idx) => `
        <div class="item-block qu-item-block" data-idx="${idx}" style="background:#fff5f5;border:1.5px solid #fecaca;border-radius:14px;padding:14px;margin-bottom:12px">
          <div class="item-block-header" style="margin-bottom:10px">
            <span style="font-weight:800;color:#991b1b">सामान ${items.length > 1 ? idx + 1 : ''}</span>
            ${items.length > 1 ? `<button type="button" class="qu-item-del" data-del="${idx}" style="background:none;border:none;color:#dc2626;font-size:1.1rem;cursor:pointer;padding:0 4px" title="हटाएँ">🗑 हटाएँ</button>` : ''}
          </div>
          <!-- Item Name Chips -->
          <div class="chip-row qu-item-chips" data-idx="${idx}" style="margin-bottom:8px">
            ${UDAAR_ITEM_CHIPS.map((c) => `<button class="chip ${it.name === c ? 'chip--on' : ''}" type="button" data-item="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}
          </div>
          <!-- Item Name Input -->
          <div class="entry-field-row">
            <label class="entry-label">सामान का नाम</label>
            <div class="entry-input-wrap">
              <input class="entry-input qu-item-name" data-idx="${idx}" type="text" lang="hi"
                     autocomplete="off" value="${escapeHtml(it.name)}"
                     placeholder="${it.name === 'अन्य' ? 'सामान का नाम लिखें या 🎤 बोलें…' : 'जैसे साड़ी, गद्दा'}"
                     style="${it.name === '' && UDAAR_ITEM_CHIPS.includes('अन्य') ? '' : ''}" />
              <button class="field-mic qu-field-mic" type="button" data-qfield="name-${idx}" aria-label="बोलकर सामान">🎤</button>
            </div>
          </div>
          <!-- Brand -->
          <div class="entry-field-row">
            <label class="entry-label">ब्रांड / कंपनी</label>
            <div class="entry-input-wrap">
              <input class="entry-input qu-item-brand" data-idx="${idx}" type="text" lang="hi"
                     autocomplete="off" value="${escapeHtml(it.brand)}" placeholder="जैसे Raymond, Siyaram" />
              <button class="field-mic qu-field-mic" type="button" data-qfield="brand-${idx}" aria-label="बोलकर ब्रांड">🎤</button>
            </div>
          </div>
          <!-- Qty + Unit -->
          <div class="item-qty-row" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:4px">
            <div class="entry-field-row" style="flex:1">
              <label class="entry-label">मात्रा</label>
              <div class="qty-stepper">
                <button class="qty-btn qu-qty-btn" type="button" data-step="-0.5" data-idx="${idx}">−</button>
                <input class="entry-input qu-item-qty" data-idx="${idx}" type="number" inputmode="decimal"
                       value="${it.qty}" min="0.5" step="0.5" style="width:70px;text-align:center" />
                <button class="qty-btn qu-qty-btn" type="button" data-step="0.5" data-idx="${idx}">+</button>
              </div>
              <div class="chip-row qu-unit-chips" data-idx="${idx}" style="margin-top:6px">
                ${UDAAR_UNIT_CHIPS.map((u) => `<button class="chip ${it.unit === u ? 'chip--on' : ''}" type="button" data-unit="${u}">${u}</button>`).join('')}
              </div>
            </div>
            <div class="entry-field-row" style="flex:1">
              <label class="entry-label">रेट (प्रति इकाई) ₹</label>
              <div class="entry-input-wrap">
                <input class="entry-input qu-item-rate" data-idx="${idx}" type="number" inputmode="numeric"
                       value="${it.rate || ''}" placeholder="₹" />
                <button class="field-mic qu-field-mic" type="button" data-qfield="rate-${idx}" aria-label="बोलकर रेट">🎤</button>
              </div>
            </div>
          </div>
          <!-- Amount -->
          <div class="entry-field-row" style="margin-top:4px">
            <label class="entry-label">रकम ₹ <span style="color:#dc2626">*</span> <span style="font-size:.78rem;color:#64748b">(qty × rate से auto)</span></label>
            <div class="entry-input-wrap">
              <input class="entry-input qu-item-amount" data-idx="${idx}" type="number" inputmode="numeric"
                     value="${it.amount || ''}" placeholder="₹" />
              <button class="field-mic qu-field-mic" type="button" data-qfield="amount-${idx}" aria-label="बोलकर रकम">🎤</button>
            </div>
          </div>
        </div>`;

      // ── Helper: compute & display grand total ──
      const updateGrandTotal = () => {
        const total = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
        const el = document.getElementById('qu-grand-total');
        if (el) el.textContent = total > 0 ? `कुल उधार बिल: ₹${total.toLocaleString('hi-IN')}` : 'कुल उधार बिल: ₹—';
        const saveBtn = document.getElementById('q-udaar-save');
        if (saveBtn) saveBtn.textContent = `✓ उधार खाता में जोड़ें${total > 0 ? ' (₹' + total.toLocaleString('hi-IN') + ')' : ''}`;
      };

      // ── Helper: re-render all item blocks ──
      const renderAllItems = () => {
        const container = document.getElementById('qu-items-container');
        if (!container) return;
        container.innerHTML = items.map((it, idx) => renderItemBlock(it, idx)).join('');
        wireItemEvents();
        updateGrandTotal();
      };

      // ── Auto-compute amount from qty × rate ──
      const autoAmount = (idx) => {
        const it = items[idx];
        const r = Number(it.rate) || 0;
        const q = Number(it.qty) || 1;
        if (r > 0) {
          it.amount = Math.round(q * r);
          const amtInp = document.querySelector(`.qu-item-amount[data-idx="${idx}"]`);
          if (amtInp) amtInp.value = it.amount;
        }
        updateGrandTotal();
      };

      // ── Active mic tracker for item field mics ──
      let _qActiveMic = null;
      const stopQMic = () => { if (_qActiveMic) { try { _qActiveMic.cancel(); } catch {} _qActiveMic = null; } };

      const startItemFieldMic = (qfield, btnEl) => {
        stopActiveMic(); stopQMic();
        if (!g.VoiceEngine) { toast('आवाज़ उपलब्ध नहीं है'); return; }
        const engine = new g.VoiceEngine({ silenceMs: 2000 });
        _qActiveMic = engine;
        btnEl.textContent = '⏹';
        btnEl.classList.add('mic-active');

        const m = qfield.match(/^(\w+)-(\d+)$/);
        if (!m) return;
        const [, sub, idxStr] = m;
        const idx = Number(idxStr);

        const inp = document.querySelector(`.qu-item-${sub}[data-idx="${idx}"]`);

        engine.onPartial = (p) => { if (inp && p) { inp.value = p; inp.classList.add('mic-live-transcribing'); } };
        engine.onComplete = (text) => {
          if (inp) { inp.classList.remove('mic-live-transcribing'); }
          btnEl.textContent = '🎤'; btnEl.classList.remove('mic-active');
          let val = text.trim();
          if (sub === 'rate' || sub === 'amount') {
            val = val.replace(/[^\d.]/g, '');
          }
          if (inp) inp.value = val;
          items[idx][sub] = (sub === 'qty' || sub === 'rate' || sub === 'amount') ? (Number(val) || 0) : val;
          if (sub === 'qty' || sub === 'rate') autoAmount(idx);
          else updateGrandTotal();
          stopQMic();
        };
        engine.onError = () => { btnEl.textContent = '🎤'; btnEl.classList.remove('mic-active'); stopQMic(); };
        btnEl.onclick = () => { engine.done(); btnEl.textContent = '🎤'; btnEl.classList.remove('mic-active'); btnEl.onclick = () => startItemFieldMic(qfield, btnEl); };
        if (engine.supported) engine.start();
        else toast('आवाज़ उपलब्ध नहीं');
      };

      // ── Wire all events on item blocks ──
      const wireItemEvents = () => {
        const container = document.getElementById('qu-items-container');
        if (!container) return;

        // Item chip clicks
        container.querySelectorAll('.qu-item-chips .chip').forEach((btn) => {
          const idx = Number(btn.closest('[data-idx]').dataset.idx);
          btn.onclick = () => {
            container.querySelectorAll(`.qu-item-chips[data-idx="${idx}"] .chip`).forEach((b) => b.classList.remove('chip--on'));
            btn.classList.add('chip--on');
            const nameInp = container.querySelector(`.qu-item-name[data-idx="${idx}"]`);
            if (btn.dataset.item === 'अन्य') {
              items[idx].name = '';
              if (nameInp) {
                nameInp.value = '';
                nameInp.placeholder = 'सामान का नाम लिखें या 🎤 बोलें…';
                nameInp.style.borderColor = '#d97706';
                nameInp.style.background = '#fffbeb';
                nameInp.focus();
              }
            } else {
              items[idx].name = btn.dataset.item;
              if (nameInp) {
                nameInp.value = btn.dataset.item;
                nameInp.placeholder = 'जैसे साड़ी, गद्दा';
                nameInp.style.borderColor = '';
                nameInp.style.background = '';
              }
            }
            updateGrandTotal();
          };
        });

        // Unit chip clicks
        container.querySelectorAll('.qu-unit-chips .chip').forEach((btn) => {
          const idx = Number(btn.closest('[data-idx]').dataset.idx);
          btn.onclick = () => {
            items[idx].unit = btn.dataset.unit;
            container.querySelectorAll(`.qu-unit-chips[data-idx="${idx}"] .chip`).forEach((b) => b.classList.remove('chip--on'));
            btn.classList.add('chip--on');
          };
        });

        // Name input
        container.querySelectorAll('.qu-item-name').forEach((inp) => {
          const idx = Number(inp.dataset.idx);
          inp.oninput = () => {
            items[idx].name = inp.value;
            if (inp.value.trim()) { inp.style.borderColor = ''; inp.style.background = ''; }
            updateGrandTotal();
          };
        });

        // Brand input
        container.querySelectorAll('.qu-item-brand').forEach((inp) => {
          const idx = Number(inp.dataset.idx);
          inp.oninput = () => { items[idx].brand = inp.value; };
        });

        // Qty stepper buttons
        container.querySelectorAll('.qu-qty-btn').forEach((btn) => {
          const idx = Number(btn.dataset.idx);
          btn.onclick = () => {
            const step = Number(btn.dataset.step);
            items[idx].qty = Math.max(0.5, (Number(items[idx].qty) || 1) + step);
            const inp = container.querySelector(`.qu-item-qty[data-idx="${idx}"]`);
            if (inp) inp.value = items[idx].qty;
            autoAmount(idx);
          };
        });

        // Qty input
        container.querySelectorAll('.qu-item-qty').forEach((inp) => {
          const idx = Number(inp.dataset.idx);
          inp.oninput = () => { items[idx].qty = Number(inp.value) || 1; autoAmount(idx); };
        });

        // Rate input
        container.querySelectorAll('.qu-item-rate').forEach((inp) => {
          const idx = Number(inp.dataset.idx);
          inp.oninput = () => { items[idx].rate = Number(inp.value) || 0; autoAmount(idx); };
        });

        // Amount input (manual override)
        container.querySelectorAll('.qu-item-amount').forEach((inp) => {
          const idx = Number(inp.dataset.idx);
          inp.oninput = () => { items[idx].amount = Number(inp.value) || 0; updateGrandTotal(); };
        });

        // Delete buttons
        container.querySelectorAll('.qu-item-del').forEach((btn) => {
          const idx = Number(btn.dataset.del);
          btn.onclick = () => {
            if (items.length > 1) {
              items.splice(idx, 1);
              renderAllItems();
            }
          };
        });

        // Per-field voice mics
        container.querySelectorAll('.qu-field-mic').forEach((btn) => {
          btn.onclick = () => startItemFieldMic(btn.dataset.qfield, btn);
        });
      };

      // ── Build modal HTML ──
      modalRoot.innerHTML = `
        <div class="a-modal-backdrop" id="q-udaar-backdrop">
          <div class="a-modal-card pb-modal-card" style="max-width:510px;max-height:92vh;display:flex;flex-direction:column;overflow:hidden">
            <!-- Header -->
            <div class="a-modal-header" style="background:#fee2e2;border-bottom:1.5px solid #fecaca;flex-shrink:0">
              <div>
                <h3 style="margin:0;font-size:1.15rem;font-weight:800;color:#991b1b">🔴 नया उधार दर्ज करें</h3>
                <div style="font-size:.82rem;color:#7f1d1d;margin-top:2px">
                  ${customer.honorific ? escapeHtml(customer.honorific) + ' ' : ''}<strong>${escapeHtml(customer.name)}</strong> · ${escapeHtml(customer.village || '')}
                </div>
              </div>
              <button class="a-page-btn" id="q-udaar-close" style="padding:4px 10px;font-size:1.1rem;flex-shrink:0">✕</button>
            </div>

            <!-- Scrollable Body -->
            <div class="a-modal-body" id="q-udaar-body" style="padding:14px 16px;overflow-y:auto;flex:1">

              <!-- Grand Total Banner -->
              <div id="qu-grand-total" style="background:#fef2f2;border:2px solid #fecaca;border-radius:12px;padding:10px 14px;text-align:center;font-size:1.1rem;font-weight:900;color:#991b1b;margin-bottom:14px">
                कुल उधार बिल: ₹—
              </div>

              <!-- Items Container -->
              <div id="qu-items-container"></div>

              <!-- Add Another Item Button -->
              <button type="button" id="qu-add-item-btn" class="btn-add-item" style="margin-bottom:16px">
                ➕ एक और सामान जोड़ें
              </button>

              <!-- Due Date -->
              <div style="margin-bottom:14px">
                <label style="font-weight:700;font-size:.9rem;color:var(--ink);display:block;margin-bottom:6px">
                  ⏰ कब तक देंगे? (Due Date)
                </label>
                <div class="chip-row" id="q-udaar-due-chips">
                  <button type="button" class="chip chip--on" data-days="none">तय नहीं</button>
                  <button type="button" class="chip" data-days="7">7 दिन में</button>
                  <button type="button" class="chip" data-days="15">15 दिन में</button>
                  <button type="button" class="chip" data-days="30">1 महीना</button>
                  <button type="button" class="chip" data-days="custom">तारीख चुनें</button>
                </div>
                <div id="q-udaar-custom-date-wrap" style="margin-top:8px;display:none">
                  <input type="date" id="q-udaar-custom-date" class="entry-input" />
                </div>
              </div>

              <!-- Note -->
              <div style="margin-bottom:14px">
                <label style="font-weight:700;font-size:.85rem;color:var(--ink-soft);display:block;margin-bottom:4px">
                  विवरण / नोट (वैकल्पिक)
                </label>
                <input type="text" id="q-udaar-note" class="entry-input" placeholder="जैसे: शादी का सामान, 2 पीस" lang="hi" />
              </div>
            </div>

            <!-- Footer Buttons (fixed) -->
            <div style="padding:12px 16px;border-top:1.5px solid #fecaca;display:flex;gap:10px;flex-shrink:0;background:#fff">
              <button type="button" id="q-udaar-cancel" class="a-page-btn" style="flex:1;padding:12px;font-size:1rem;background:#f1f5f9;color:#475569">
                रद्द करें
              </button>
              <button type="button" id="q-udaar-save" class="a-page-btn" style="flex:2;padding:12px;font-size:1rem;font-weight:800;background:#dc2626;color:#ffffff">
                ✓ उधार खाता में जोड़ें
              </button>
            </div>
          </div>
        </div>`;

      // Initial render
      renderAllItems();

      // Wire close / backdrop
      const close = () => { stopActiveMic(); stopQMic(); modalRoot.innerHTML = ''; };
      document.getElementById('q-udaar-close').onclick = close;
      document.getElementById('q-udaar-cancel').onclick = close;
      document.getElementById('q-udaar-backdrop').onclick = (e) => { if (e.target.id === 'q-udaar-backdrop') close(); };

      // Add Another Item
      document.getElementById('qu-add-item-btn').onclick = () => {
        items.push({ name: '', brand: '', qty: 1, unit: 'पीस', rate: '', amount: '' });
        renderAllItems();
        // Scroll to bottom
        const body = document.getElementById('q-udaar-body');
        if (body) setTimeout(() => { body.scrollTop = body.scrollHeight; }, 50);
      };

      // Due Date Chips
      const dateWrap = document.getElementById('q-udaar-custom-date-wrap');
      const dateInput = document.getElementById('q-udaar-custom-date');
      document.querySelectorAll('#q-udaar-due-chips button').forEach((btn) => {
        btn.onclick = () => {
          document.querySelectorAll('#q-udaar-due-chips button').forEach((b) => b.classList.remove('chip--on'));
          btn.classList.add('chip--on');
          const dVal = btn.dataset.days;
          if (dVal === 'none') {
            dueDateDays = null; dueDateCustom = '';
            dateWrap.style.display = 'none';
          } else if (dVal === 'custom') {
            dueDateDays = null;
            dateWrap.style.display = 'block';
            dateInput.focus();
          } else {
            dueDateDays = Number(dVal); dueDateCustom = '';
            dateWrap.style.display = 'none';
          }
        };
      });

      // Save
      document.getElementById('q-udaar-save').onclick = async () => {
        // Validate — at least one item with a name and amount
        const validItems = items.filter((it) => (it.name || '').trim() && Number(it.amount) > 0);
        if (!validItems.length) {
          toast('कृपया कम से कम एक सामान का नाम और रकम भरें');
          return;
        }

        const totalBill = validItems.reduce((s, it) => s + (Number(it.amount) || 0), 0);
        if (totalBill <= 0) {
          toast('कृपया सही उधार रकम डालें');
          return;
        }

        const finalItemString = validItems.map((it) =>
          `${it.name}${Number(it.qty) > 1 ? ` (${it.qty} ${it.unit})` : ''}`
        ).join(', ');

        let computedDueDate = null;
        let computedDueDateNote = '';
        if (dateWrap.style.display !== 'none' && dateInput.value) {
          computedDueDate = dateInput.value;
          computedDueDateNote = 'तारीख तय';
        } else if (dueDateDays) {
          const d = new Date(Date.now() + dueDateDays * 86400000);
          computedDueDate = d.toISOString().slice(0, 10);
          computedDueDateNote = `${dueDateDays} दिन में`;
        }

        const noteVal = (document.getElementById('q-udaar-note')?.value || '').trim();

        const saveBtn = document.getElementById('q-udaar-save');
        saveBtn.disabled = true;
        saveBtn.textContent = 'जोड़ रहे हैं...';

        try {
          await api('/entries', {
            method: 'POST',
            body: {
              customerId: customer._id,
              shopId: customer.shopId,
              type: 'sale',
              amount: totalBill,
              item: finalItemString,
              items: validItems.map((it) => ({
                name: it.name,
                brand: it.brand || '',
                qty: Number(it.qty) || 1,
                unit: it.unit || 'पीस',
                rate: Number(it.rate) || 0,
                amount: Number(it.amount) || 0,
              })),
              dueDate: computedDueDate || undefined,
              dueDateNote: computedDueDateNote || undefined,
              note: noteVal,
              notes: noteVal,
              enteredVia: 'passbook-multi-item',
            },
          });
          playChime();
          toast(`✅ उधार ₹${totalBill.toLocaleString('hi-IN')} (${finalItemString}) सफलतापूर्वक दर्ज हुआ!`);
          close();
          if (onSaved) onSaved();
        } catch (err) {
          toast(err.message || 'उधार दर्ज नहीं हो सका');
          saveBtn.disabled = false;
          updateGrandTotal();
        }
      };
    },

    // ─── QUICK JAMA (CREDIT) IN-PAGE MODAL ─────────────────────────────────────
    _showQuickJamaModal(customer, onSaved) {
      stopActiveMic();
      const modalRoot = document.getElementById('pb-inline-modal-root');
      if (!modalRoot) return;

      const currentBal = Number(customer.balance || 0);
      let selectedMode = 'cash';

      modalRoot.innerHTML = `
        <div class="a-modal-backdrop" id="q-jama-backdrop">
          <div class="a-modal-card pb-modal-card">
            <div class="a-modal-header" style="background:#dcfce7;border-bottom:1px solid #bbf7d0">
              <div>
                <h3 style="margin:0;font-size:1.2rem;font-weight:800;color:#166534">🟢 जमा राशि दर्ज करें (Credit)</h3>
                <div style="font-size:.85rem;color:#14532d;margin-top:2px">
                  ${customer.honorific ? customer.honorific + ' ' : ''}<strong>${escapeHtml(customer.name)}</strong> · वर्तमान बाकी: <strong>${inr(currentBal)}</strong>
                </div>
              </div>
              <button class="a-page-btn" id="q-jama-close" style="padding:4px 10px;font-size:1.1rem">✕</button>
            </div>

            <div class="a-modal-body" style="padding:16px 20px">
              <!-- Live Voice Mic -->
              <div class="pb-quick-voice-wrap">
                <button type="button" class="pb-quick-mic-btn pb-mic--jama" id="q-jama-mic">
                  <span class="pb-qmic-icon">🎤</span>
                  <span id="q-jama-mic-text">बोलकर भरें (जैसे: 500 नकद जमा)</span>
                </button>
                <div id="q-jama-transcript" class="pb-mic-transcript hidden"></div>
              </div>

              <!-- Quick Amount Preset Chips -->
              <div style="margin-top:14px">
                <label style="font-weight:700;font-size:.85rem;color:var(--ink);display:block;margin-bottom:6px">
                  त्वरित रकम चुनें (Quick Amount):
                </label>
                <div class="chip-row" id="q-jama-amt-chips">
                  ${currentBal > 0 ? `<button type="button" class="chip chip--on" data-amt="${currentBal}">पूरा चुकता (${inr(currentBal)})</button>` : ''}
                  <button type="button" class="chip" data-amt="500">₹500</button>
                  <button type="button" class="chip" data-amt="1000">₹1,000</button>
                  <button type="button" class="chip" data-amt="2000">₹2,000</button>
                  <button type="button" class="chip" data-amt="5000">₹5,000</button>
                </div>
              </div>

              <!-- Amount Input (Large ₹) -->
              <div style="margin-top:14px">
                <label style="font-weight:700;font-size:.9rem;color:var(--ink);display:block;margin-bottom:6px">
                  जमा रकम (Amount) <span style="color:#dc2626">*</span>
                </label>
                <div class="pb-amt-input-wrap">
                  <span class="pb-rupee-sign" style="color:#059669">₹</span>
                  <input type="number" inputmode="numeric" id="q-jama-amt" class="pb-amt-input" value="${currentBal > 0 ? currentBal : ''}" placeholder="0" autofocus />
                </div>
              </div>

              <!-- Payment Mode Chips -->
              <div style="margin-top:14px">
                <label style="font-weight:700;font-size:.9rem;color:var(--ink);display:block;margin-bottom:6px">
                  भुगतान का माध्यम (Payment Mode)
                </label>
                <div class="chip-row" id="q-jama-mode-chips">
                  <button type="button" class="chip chip--on" data-mode="cash">💵 नकद (Cash)</button>
                  <button type="button" class="chip" data-mode="upi">📱 PhonePe / UPI</button>
                  <button type="button" class="chip" data-mode="bank">🏦 बैंक ट्रांसफर</button>
                </div>
              </div>

              <!-- Notes (Optional) -->
              <div style="margin-top:14px">
                <label style="font-weight:700;font-size:.85rem;color:var(--ink-soft);display:block;margin-bottom:4px">
                  विवरण / नोट (वैकल्पिक)
                </label>
                <input type="text" id="q-jama-note" class="entry-input" placeholder="जैसे: लड़के ने दिया, UPI 4920" lang="hi" />
              </div>

              <!-- Save / Cancel Buttons -->
              <div style="margin-top:20px;display:flex;gap:10px">
                <button type="button" id="q-jama-cancel" class="a-page-btn" style="flex:1;padding:12px;font-size:1rem;background:#f1f5f9;color:#475569">
                  रद्द करें
                </button>
                <button type="button" id="q-jama-save" class="a-page-btn" style="flex:2;padding:12px;font-size:1.05rem;font-weight:800;background:#059669;color:#ffffff">
                  ✓ जमा दर्ज करें
                </button>
              </div>
            </div>
          </div>
        </div>`;

      const close = () => { stopActiveMic(); modalRoot.innerHTML = ''; };
      document.getElementById('q-jama-close').onclick = close;
      document.getElementById('q-jama-cancel').onclick = close;
      document.getElementById('q-jama-backdrop').onclick = (e) => { if (e.target.id === 'q-jama-backdrop') close(); };

      // Wire Amount Presets
      document.querySelectorAll('#q-jama-amt-chips button').forEach((btn) => {
        btn.onclick = () => {
          document.querySelectorAll('#q-jama-amt-chips button').forEach((b) => b.classList.remove('chip--on'));
          btn.classList.add('chip--on');
          document.getElementById('q-jama-amt').value = btn.dataset.amt;
        };
      });

      // Wire Mode Chips
      document.querySelectorAll('#q-jama-mode-chips button').forEach((btn) => {
        btn.onclick = () => {
          document.querySelectorAll('#q-jama-mode-chips button').forEach((b) => b.classList.remove('chip--on'));
          btn.classList.add('chip--on');
          selectedMode = btn.dataset.mode;
        };
      });

      // Wire Voice Mic for Jama
      const micBtn = document.getElementById('q-jama-mic');
      const micText = document.getElementById('q-jama-mic-text');
      const transcriptBox = document.getElementById('q-jama-transcript');
      if (micBtn) {
        micBtn.onclick = async () => {
          stopActiveMic();
          if (!g.VoiceEngine) { toast('आवाज़ उपलब्ध नहीं है'); return; }
          micBtn.classList.add('mic-pulsing');
          micText.textContent = 'सुन रहे हैं... बोलिए';
          transcriptBox.classList.remove('hidden');
          transcriptBox.textContent = 'बोलिए...';

          const eng = new g.VoiceEngine({ silenceMs: 2500 });
          _activeMicEngine = eng;
          eng.onPartial = (p) => {
            if (p) transcriptBox.textContent = p;
          };

          try {
            const spoken = await eng.listenOnce(6000);
            if (spoken) {
              transcriptBox.textContent = `"${spoken}"`;
              try {
                const { parsed } = await api('/entries/parse-speech', { method: 'POST', body: { text: spoken } });
                if (parsed) {
                  if (parsed.amount) {
                    document.getElementById('q-jama-amt').value = parsed.amount;
                  }
                  if (parsed.paymentMode) {
                    const chip = document.querySelector(`#q-jama-mode-chips button[data-mode="${parsed.paymentMode}"]`);
                    if (chip) chip.click();
                  }
                }
              } catch {}
            }
          } catch {}
          micBtn.classList.remove('mic-pulsing');
          micText.textContent = 'बोलकर भरें (जैसे: 500 नकद जमा)';
        };
      }

      // Wire Save Button
      document.getElementById('q-jama-save').onclick = async () => {
        const amtVal = Number(document.getElementById('q-jama-amt').value);
        if (!amtVal || amtVal <= 0) {
          toast('कृपया सही जमा रकम डालें');
          document.getElementById('q-jama-amt').focus();
          return;
        }

        const noteVal = document.getElementById('q-jama-note').value.trim();

        const saveBtn = document.getElementById('q-jama-save');
        saveBtn.disabled = true;
        saveBtn.textContent = 'दर्ज कर रहे हैं...';

        try {
          await api('/entries', {
            method: 'POST',
            body: {
              customerId: customer._id,
              shopId: customer.shopId,
              type: 'payment',
              amount: amtVal,
              paymentMode: selectedMode,
              note: noteVal,
              notes: noteVal,
              enteredVia: 'passbook-quick',
            },
          });
          playChime();
          toast(`जमा ${inr(amtVal)} सफलतापूर्वक दर्ज हुआ!`);
          close();
          if (onSaved) onSaved();
        } catch (err) {
          toast(err.message || 'जमा दर्ज नहीं हो सका');
          saveBtn.disabled = false;
          saveBtn.textContent = '✓ जमा दर्ज करें';
        }
      };
    },

    // ─── DIARY PHOTO ─────────────────────────────────────────────────────────
    viewDiary() {
      this.root.innerHTML = `
        <div class="p-shell p-screen">
          ${this.nav()}
          <h1>📷 डायरी की फोटो</h1>
          <p class="p-lead">पुरानी डायरी का पेज फोटो खींचकर भेजें। एडमिन जाँच करेंगे।</p>
          <input type="file" accept="image/*" capture="environment" multiple id="files" style="position:absolute;opacity:0;width:1px;height:1px" aria-hidden="true" />
          <button class="btn-huge btn-primary" type="button" id="cam">📷 कैमरा / गैलरी</button>
          <div class="thumbs" id="thumbs"></div>
          <div class="field"><label>ग्राहक का नाम (ज़रूरी नहीं)</label><input id="hint" placeholder="जैसे रमेश" lang="hi" /></div>
          <button class="btn-huge btn-ok" type="button" id="send" disabled>भेजें</button>
        </div>`;

      const files = [];
      const thumbs = document.getElementById('thumbs');
      const refresh = () => {
        document.getElementById('send').disabled = !files.length;
        thumbs.innerHTML = files.map((f, i) => `<figure><img src="${f.preview}" alt="" /><figcaption id="st-${i}">तैयार</figcaption></figure>`).join('');
      };

      async function compress(file) {
        const bmp = await createImageBitmap(file);
        const max = 1600;
        const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bmp.width * scale);
        canvas.height = Math.round(bmp.height * scale);
        canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.8));
        return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
      }

      document.getElementById('cam').onclick = () => document.getElementById('files').click();
      document.getElementById('files').onchange = async (e) => {
        for (const file of [...e.target.files]) {
          const c = await compress(file);
          files.push({ file: c, preview: URL.createObjectURL(c) });
        }
        refresh();
      };

      document.getElementById('send').onclick = async () => {
        const hint = document.getElementById('hint').value.trim();
        if (!navigator.onLine) {
          await g.KhataIDB.enqueue({ kind: 'diary', payload: { blobs: files.map((f) => ({ name: f.file.name, blob: f.file })), customerHint: hint } });
          toast('इंटरनेट नहीं है। फोटो सुरक्षित है, बाद में चली जाएगी।');
          this.home(); return;
        }
        const fd = new FormData();
        files.forEach((f, i) => {
          fd.append('photos', f.file);
          const cap = document.getElementById(`st-${i}`);
          if (cap) cap.textContent = 'भेज रहा है…';
        });
        if (hint) fd.append('customerHint', hint);
        try {
          const res = await api('/diary/upload', { method: 'POST', body: fd });
          playChime();
          setTimeout(() => {
            this.root.innerHTML = `<div class="p-shell"><div class="saved-flash"><div class="check">✓</div><h1>${escapeHtml(res.messageHi || 'फोटो पहुँच गई।')}</h1><button class="btn-huge btn-primary" type="button" id="bh" style="margin-top:20px">🏠 घर</button></div></div>`;
            document.getElementById('bh').onclick = () => this.home();
          }, 600);
        } catch (e) {
          toast(e.message || 'फोटो नहीं गई');
        }
      };
    },

    // ─── LABOUR MANAGEMENT: DIRECTORY & QUICK ENTRY ──────────────────────────
    async viewLabour() {
      this.root.innerHTML = `
        <div class="p-shell p-screen">
          ${this.nav()}
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;flex-wrap:wrap">
            <div>
              <h1 style="margin:0;font-size:1.6rem;font-weight:900;color:var(--forest,#092c20)">👷 मज़दूर हिसाब</h1>
              <p style="margin:2px 0 0;font-size:.9rem;color:var(--ink-soft,#64748b)">हाज़िरी, दैनिक मजदूरी, एडवांस व वेतन खाता</p>
            </div>
            <button type="button" id="btn-add-labour" class="a-page-btn" style="background:#1d4ed8;color:#ffffff;font-weight:800;font-size:.95rem;padding:10px 16px;border-radius:12px">
              ➕ नया मज़दूर जोड़ें
            </button>
          </div>

          <!-- Quick Search -->
          <div class="search-box">
            <input id="labour-search" placeholder="मज़दूर का नाम या काम खोजें..." lang="hi" />
            <button class="mic-mini" type="button" id="labour-mic" aria-label="बोलकर खोजें">🎤</button>
          </div>

          <!-- Status filter tabs -->
          <div class="tabs" role="tablist" id="labour-status-tabs" style="margin-bottom:14px">
            <button role="tab" type="button" class="on" data-status="active">काम पर हैं (Active)</button>
            <button role="tab" type="button" data-status="inactive">पुराने (Inactive)</button>
            <button role="tab" type="button" data-status="all">सब मज़दूर</button>
          </div>

          <!-- Labour list container -->
          <div id="labour-list-box"><p class="empty">लोड हो रहा है…</p></div>

          <!-- Modal Container -->
          <div id="labour-modal-root"></div>
        </div>`;

      let currentStatus = 'active';
      const searchInp = document.getElementById('labour-search');

      const loadLabours = async () => {
        const q = (searchInp?.value || '').trim();
        const box = document.getElementById('labour-list-box');
        if (!box) return;

        try {
          const params = new URLSearchParams();
          if (q) params.set('q', q);
          if (currentStatus !== 'all') params.set('status', currentStatus);

          const { labours } = await api(`/labour?${params}`);
          if (!labours || !labours.length) {
            box.innerHTML = `<div class="a-card" style="text-align:center;padding:32px;color:#64748b">
              <p style="font-size:1.1rem;font-weight:700;margin:0 0 6px">कोई मज़दूर नहीं मिला</p>
              <p style="font-size:.85rem;margin:0">ऊपर '➕ नया मज़दूर जोड़ें' बटन से नया नाम दर्ज करें।</p>
            </div>`;
            return;
          }

          box.innerHTML = labours.map((l) => {
            const isOwed = l.balance > 0;
            const isAdvance = l.balance < 0;
            const balClass = isOwed ? 'labour-bal-pending' : isAdvance ? 'labour-bal-advance' : 'labour-bal-settled';
            const balLabel = isOwed ? `बचा वेतन: ${inr(l.balance)} देना है` : isAdvance ? `एडवांस जमा: ${inr(Math.abs(l.balance))}` : 'हिसाब चुकता ✓';
            const wageText = l.wageAmount ? `₹${l.wageAmount.toLocaleString('hi-IN')} / ${l.wageType === 'daily' ? 'दिन' : 'माह'}` : 'वेतन तय नहीं';

            return `
              <div class="labour-card" data-id="${l._id}">
                <div class="labour-header-row">
                  <div>
                    <span class="labour-name-title">${escapeHtml(l.name)}</span>
                    <span class="labour-role-tag">${escapeHtml(l.roleTitle || 'कारीगर')}</span>
                  </div>
                  <div class="labour-bal-badge ${balClass}">
                    ${balLabel}
                  </div>
                </div>
                <div class="labour-meta-grid">
                  <span>💰 तय वेतन: <strong>${wageText}</strong></span>
                  ${l.phone ? `<span>📞 <a href="tel:${escapeHtml(l.phone)}" style="color:#0369a1;text-decoration:none" onclick="event.stopPropagation()">${escapeHtml(l.phone)}</a></span>` : ''}
                  <span>📅 जुड़ा: ${new Date(l.joiningDate || l.createdAt).toLocaleDateString('hi-IN', { month: 'short', year: 'numeric' })}</span>
                </div>
              </div>`;
          }).join('');

          box.querySelectorAll('.labour-card').forEach((card) => {
            card.onclick = () => {
              const id = card.dataset.id;
              if (id) this.go('labourDetail', { id });
            };
          });
        } catch (err) {
          if (box) box.innerHTML = `<p class="empty" style="color:#dc2626">लोड करने में समस्या आई: ${escapeHtml(err.message)}</p>`;
        }
      };

      // Search debounce
      let timer = null;
      if (searchInp) {
        searchInp.oninput = () => {
          clearTimeout(timer);
          timer = setTimeout(loadLabours, 200);
        };
      }

      // Voice Mic on Search
      const micBtn = document.getElementById('labour-mic');
      if (micBtn) {
        micBtn.onclick = async () => {
          stopActiveMic();
          if (!g.VoiceEngine) { toast('आवाज़ उपलब्ध नहीं है'); return; }
          micBtn.classList.add('mic-pulsing');
          const eng = new g.VoiceEngine({ silenceMs: 2500 });
          _activeMicEngine = eng;
          try {
            const spoken = await eng.listenOnce(5000);
            if (spoken && searchInp) {
              searchInp.value = spoken;
              loadLabours();
            }
          } catch {}
          micBtn.classList.remove('mic-pulsing');
        };
      }

      // Filter tabs
      this.root.querySelectorAll('#labour-status-tabs button').forEach((b) => {
        b.onclick = () => {
          this.root.querySelectorAll('#labour-status-tabs button').forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
          currentStatus = b.dataset.status;
          loadLabours();
        };
      });

      // Wire Add Labour Modal
      document.getElementById('btn-add-labour').onclick = () => {
        this._showAddLabourModal(() => loadLabours());
      };

      loadLabours();
    },

    // ─── ADD LABOUR MODAL ────────────────────────────────────────────────────
    _showAddLabourModal(onSaved) {
      stopActiveMic();
      const modalRoot = document.getElementById('labour-modal-root');
      if (!modalRoot) return;

      const roles = ['कारीगर / मास्टर', 'हेल्पर', 'दर्जी', 'पल्लेदार', 'सिलाई ऑपरेटर', 'दुकान सहायक'];
      let selectedRole = 'कारीगर / मास्टर';
      let selectedWageType = 'monthly';

      modalRoot.innerHTML = `
        <div class="a-modal-backdrop" id="add-labour-backdrop">
          <div class="a-modal-card pb-modal-card" style="max-width:500px">
            <div class="a-modal-header" style="background:#eff6ff;border-bottom:1.5px solid #bfdbfe">
              <h3 style="margin:0;font-size:1.15rem;font-weight:800;color:#1e40af">➕ नया मज़दूर जोड़ें</h3>
              <button class="a-page-btn" id="add-labour-close" style="padding:4px 10px;font-size:1.1rem">✕</button>
            </div>
            <div class="a-modal-body" style="padding:16px 20px;max-height:80vh;overflow-y:auto">
              <!-- Name -->
              <div class="entry-field-row">
                <label class="entry-label">मज़दूर का नाम <span style="color:#dc2626">*</span></label>
                <input class="entry-input" id="nl-name" placeholder="जैसे: रमेश कुमार" lang="hi" autofocus />
              </div>

              <!-- Phone -->
              <div class="entry-field-row" style="margin-top:10px">
                <label class="entry-label">मोबाइल नंबर (वैकल्पिक)</label>
                <input class="entry-input" type="tel" inputmode="numeric" id="nl-phone" placeholder="10 अंक का फोन नंबर" />
              </div>

              <!-- Role Chips -->
              <div class="entry-field-row" style="margin-top:10px">
                <label class="entry-label">काम / पद (Role)</label>
                <div class="chip-row" id="nl-role-chips">
                  ${roles.map((r) => `<button type="button" class="chip ${r === selectedRole ? 'chip--on' : ''}" data-role="${escapeHtml(r)}">${escapeHtml(r)}</button>`).join('')}
                </div>
                <input class="entry-input" id="nl-role-custom" placeholder="या अन्य काम लिखें..." style="margin-top:6px;display:none" />
              </div>

              <!-- Wage Type & Amount -->
              <div class="entry-field-row" style="margin-top:10px">
                <label class="entry-label">वेतन का प्रकार व तय रकम</label>
                <div class="chip-row" id="nl-wage-type-chips" style="margin-bottom:8px">
                  <button type="button" class="chip chip--on" data-wtype="monthly">🗓 मासिक वेतन (Monthly)</button>
                  <button type="button" class="chip" data-wtype="daily">⏰ दैनिक दिहाड़ी (Daily Wage)</button>
                </div>
                <div class="pb-amt-input-wrap">
                  <span class="pb-rupee-sign" style="color:#1d4ed8">₹</span>
                  <input type="number" id="nl-wage-amt" class="pb-amt-input" placeholder="0" />
                </div>
              </div>

              <!-- Opening Balance (Optional) -->
              <div style="margin-top:14px;background:#f8fafc;padding:12px;border-radius:12px;border:1px dashed #cbd5e1">
                <label style="font-weight:700;font-size:.85rem;color:#475569;display:block;margin-bottom:6px">
                  पिछला पुराना हिसाब (वैकल्पिक):
                </label>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                  <div>
                    <label style="font-size:.78rem;color:#64748b;display:block;margin-bottom:2px">पुराना एडवांस दिया ₹</label>
                    <input type="number" id="nl-init-adv" class="entry-input" placeholder="₹0" />
                  </div>
                  <div>
                    <label style="font-size:.78rem;color:#64748b;display:block;margin-bottom:2px">पुराना वेतन बाकी ₹</label>
                    <input type="number" id="nl-init-wage" class="entry-input" placeholder="₹0" />
                  </div>
                </div>
              </div>

              <!-- Save / Cancel Buttons -->
              <div style="margin-top:20px;display:flex;gap:10px">
                <button type="button" id="nl-cancel" class="a-page-btn" style="flex:1;padding:12px;background:#f1f5f9;color:#475569">रद्द करें</button>
                <button type="button" id="nl-save" class="a-page-btn" style="flex:2;padding:12px;background:#1d4ed8;color:#ffffff;font-weight:800">✓ मज़दूर जोड़ें</button>
              </div>
            </div>
          </div>
        </div>`;

      const close = () => { modalRoot.innerHTML = ''; };
      document.getElementById('add-labour-close').onclick = close;
      document.getElementById('nl-cancel').onclick = close;
      document.getElementById('add-labour-backdrop').onclick = (e) => { if (e.target.id === 'add-labour-backdrop') close(); };

      // Role chips
      document.querySelectorAll('#nl-role-chips button').forEach((btn) => {
        btn.onclick = () => {
          document.querySelectorAll('#nl-role-chips button').forEach((b) => b.classList.remove('chip--on'));
          btn.classList.add('chip--on');
          selectedRole = btn.dataset.role;
        };
      });

      // Wage type chips
      document.querySelectorAll('#nl-wage-type-chips button').forEach((btn) => {
        btn.onclick = () => {
          document.querySelectorAll('#nl-wage-type-chips button').forEach((b) => b.classList.remove('chip--on'));
          btn.classList.add('chip--on');
          selectedWageType = btn.dataset.wtype;
        };
      });

      // Save
      document.getElementById('nl-save').onclick = async () => {
        const name = (document.getElementById('nl-name')?.value || '').trim();
        if (!name) { toast('कृपया मज़दूर का नाम लिखें'); return; }

        const phone = (document.getElementById('nl-phone')?.value || '').trim();
        const wageAmt = Number(document.getElementById('nl-wage-amt')?.value) || 0;
        const initAdv = Number(document.getElementById('nl-init-adv')?.value) || 0;
        const initWage = Number(document.getElementById('nl-init-wage')?.value) || 0;

        const saveBtn = document.getElementById('nl-save');
        saveBtn.disabled = true;
        saveBtn.textContent = 'जोड़ रहे हैं...';

        try {
          await api('/labour', {
            method: 'POST',
            body: {
              name,
              phone,
              roleTitle: selectedRole,
              wageType: selectedWageType,
              wageAmount: wageAmt,
              initialAdvance: initAdv,
              initialPendingWage: initWage,
            },
          });
          playChime();
          toast(`✅ मज़दूर "${name}" सफलतापूर्वक दर्ज हुए!`);
          close();
          if (onSaved) onSaved();
        } catch (err) {
          toast(err.message || 'मज़दूर नहीं जोड़ा जा सका');
          saveBtn.disabled = false;
          saveBtn.textContent = '✓ मज़दूर जोड़ें';
        }
      };
    },

    // ─── LABOUR DETAIL: DATE-WISE LEDGER & PASSBOOK ───────────────────────────
    async viewLabourDetail() {
      try {
        const { labour, entries } = await api(`/labour/${this.data.id}`);
        const user = getUser() || {};
        const shopTitle = user.displayName || (labour.shopId === 'shop2' ? 'दुकान 2' : 'दुकान 1');

        const isOwed = labour.balance > 0;
        const isAdvance = labour.balance < 0;
        const balLabel = isOwed ? 'बाकी वेतन (देना है)' : isAdvance ? 'एडवांस जमा (Labour के पास)' : 'हिसाब चुकता ✓';
        const balColor = isOwed ? '#f59e0b' : isAdvance ? '#38bdf8' : '#4ade80';

        this.root.innerHTML = `
          <div class="p-shell p-screen passbook-shell">
            ${this.nav()}

            <!-- Labour Header Card -->
            <div class="pinned-bacha" style="background:linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%);color:#ffffff;border-radius:20px;padding:20px;margin-bottom:16px">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
                <div>
                  <h2 style="margin:0;font-size:1.45rem;font-weight:900">${escapeHtml(labour.name)}</h2>
                  <div style="font-size:.9rem;color:#bfdbfe;margin-top:2px">
                    <span>👷 ${escapeHtml(labour.roleTitle || 'कारीगर')}</span>
                    ${labour.phone ? ` · 📞 <a href="tel:${escapeHtml(labour.phone)}" style="color:#ffffff;text-decoration:none">${escapeHtml(labour.phone)}</a>` : ''}
                  </div>
                  <div style="font-size:.82rem;color:rgba(255,255,255,.8);margin-top:4px">
                    💰 तय दर: <strong>₹${(labour.wageAmount || 0).toLocaleString('hi-IN')} / ${labour.wageType === 'daily' ? 'दिन' : 'माह'}</strong>
                    · 📅 जुड़ा: ${new Date(labour.joiningDate || labour.createdAt).toLocaleDateString('hi-IN')}
                  </div>
                </div>
                <button type="button" id="ld-wa-share" class="a-page-btn" style="background:#25D366;color:#ffffff;font-weight:800;font-size:.85rem;padding:8px 12px;border:none">
                  📲 WhatsApp
                </button>
              </div>

              <!-- Big Balance Display -->
              <div style="margin-top:16px;background:rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.2);border-radius:14px;padding:12px 16px;text-align:center">
                <div style="font-size:.85rem;color:rgba(255,255,255,.85)">${balLabel}</div>
                <div style="font-size:2rem;font-weight:900;color:${balColor};margin-top:2px">
                  ${inr(Math.abs(labour.balance))}
                </div>
                <div style="font-size:.8rem;color:rgba(255,255,255,.75);margin-top:4px">
                  कुल बना वेतन: ₹${(labour.totalEarned || 0).toLocaleString('hi-IN')} | कुल दिया (एडवांस+भुगतान): ₹${(labour.totalPaid || 0).toLocaleString('hi-IN')}
                </div>
              </div>
            </div>

            <!-- Two Large Prominent Buttons -->
            <div class="labour-dock-grid">
              <button class="btn-labour-pay" type="button" id="ld-open-pay">
                <span>🔴 💸 पैसा दिया</span>
                <span style="font-size:.78rem;font-weight:500;opacity:.9">एडवांस या सैलरी भुगतान</span>
              </button>
              <button class="btn-labour-credit" type="button" id="ld-open-credit">
                <span>🟢 🗓️ वेतन जोड़ा</span>
                <span style="font-size:.78rem;font-weight:500;opacity:.9">मासिक वेतन या दिहाड़ी हाज़िरी</span>
              </button>
            </div>

            <!-- Filter Tabs -->
            <div class="tabs" role="tablist" id="ld-entry-filter" style="margin-top:16px">
              <button role="tab" type="button" class="on" data-filter="all">सब लेन-देन (${entries.length})</button>
              <button role="tab" type="button" data-filter="payment">केवल भुगतान दिया</button>
              <button role="tab" type="button" data-filter="salary_credit">केवल वेतन जुड़ा</button>
            </div>

            <!-- Date-wise Entries Container -->
            <div class="diary-page" id="ld-entries-container" style="margin-top:12px">
              ${this._renderLabourPassbookRows(entries)}
            </div>

            <div id="ld-modal-root"></div>
          </div>`;

        // Filter tabs
        this.root.querySelectorAll('#ld-entry-filter button').forEach((btn) => {
          btn.onclick = () => {
            this.root.querySelectorAll('#ld-entry-filter button').forEach((x) => x.classList.remove('on'));
            btn.classList.add('on');
            const filt = btn.dataset.filter;
            const filtered = filt === 'all' ? entries : entries.filter((e) => e.type === filt);
            const container = document.getElementById('ld-entries-container');
            if (container) container.innerHTML = this._renderLabourPassbookRows(filtered);
          };
        });

        // WhatsApp Share
        document.getElementById('ld-wa-share').onclick = () => {
          this._sendLabourWhatsAppStatement(labour, entries, shopTitle);
        };

        // Open Pay Modal
        document.getElementById('ld-open-pay').onclick = () => {
          this._showLabourPayModal(labour, () => this.viewLabourDetail());
        };

        // Open Credit Modal
        document.getElementById('ld-open-credit').onclick = () => {
          this._showLabourCreditModal(labour, () => this.viewLabourDetail());
        };

      } catch (err) {
        toast('मज़दूर खाता नहीं खुला: ' + (err.message || 'त्रुटि'));
        this.back();
      }
    },

    // ── Helper to render labour passbook rows ──
    _renderLabourPassbookRows(entries) {
      if (!entries || !entries.length) {
        return `<div class="a-card" style="text-align:center;padding:32px;color:#64748b">
          <p style="font-weight:700;margin:0">अभी कोई लेन-देन दर्ज नहीं है</p>
          <p style="font-size:.85rem;margin:4px 0 0">ऊपर 'पैसा दिया' या 'वेतन जोड़ा' से नया हिसाब दर्ज करें।</p>
        </div>`;
      }

      return entries.map((e) => {
        const isPayment = e.type === 'payment';
        const dObj = new Date(e.date || e.createdAt);
        const dateStr = dObj.toLocaleDateString('hi-IN', { day: '2-digit', month: 'short', year: 'numeric' });

        return `
          <div class="passbook-row ${isPayment ? 'pb-row--payment' : 'pb-row--sale'}" style="margin-bottom:10px">
            <div class="pb-col-main">
              <div class="pb-item-title">
                <strong style="color:var(--ink,#0f172a);font-size:1.05rem">
                  ${isPayment ? '🔴 पैसा दिया' : '🟢 वेतन जुड़ा'}
                </strong>
                <span style="font-size:.8rem;font-weight:700;padding:2px 8px;border-radius:6px;background:${isPayment ? '#fee2e2;color:#991b1b' : '#dcfce7;color:#166534'}">
                  ${escapeHtml(e.category ? e.category.toUpperCase() : '')}
                </span>
                ${e.paymentMode ? `<span class="pb-mode-pill">${escapeHtml(e.paymentMode.toUpperCase())}</span>` : ''}
              </div>
              <div class="pb-meta-line" style="margin-top:3px">
                <span class="pb-date-pill">📅 ${dateStr}</span>
                ${e.description ? `<span style="font-size:.85rem;color:#475569">· ${escapeHtml(e.description)}</span>` : ''}
              </div>
            </div>
            <div class="pb-col-amt">
              <div class="pb-amt-badge ${isPayment ? 'pb-udaar' : 'pb-jama'}">
                <span class="pb-amt-type">${isPayment ? 'दिया' : 'जुड़ा'}</span>
                <span class="pb-amt-val">${isPayment ? '−' : '+'}${inr(e.amount)}</span>
              </div>
              <div class="pb-running-pill" title="इस लेन-देन के बाद शुद्ध बाकी">
                <span class="pb-rp-label">बाकी:</span>
                <span class="pb-rp-val">${inr(Math.abs(e.runningBalance || 0))}</span>
              </div>
            </div>
          </div>`;
      }).join('');
    },

    // ── Quick Modal: पैसा दिया (Advance / Salary Payout) ──
    _showLabourPayModal(labour, onSaved) {
      stopActiveMic();
      const modalRoot = document.getElementById('ld-modal-root');
      if (!modalRoot) return;

      let selectedCategory = 'advance';
      let selectedMode = 'cash';

      modalRoot.innerHTML = `
        <div class="a-modal-backdrop" id="lp-backdrop">
          <div class="a-modal-card pb-modal-card" style="max-width:480px">
            <div class="a-modal-header" style="background:#fee2e2;border-bottom:1.5px solid #fecaca">
              <h3 style="margin:0;font-size:1.15rem;font-weight:800;color:#991b1b">🔴 मज़दूर को पैसा दिया (Payment / Advance)</h3>
              <button class="a-page-btn" id="lp-close">✕</button>
            </div>
            <div class="a-modal-body" style="padding:16px 20px">
              <div style="font-size:.9rem;color:#7f1d1d;margin-bottom:10px">
                मज़दूर: <strong>${escapeHtml(labour.name)}</strong> (${escapeHtml(labour.roleTitle || 'कारीगर')})
              </div>

              <!-- Quick Presets -->
              <div style="margin-bottom:10px">
                <label style="font-weight:700;font-size:.85rem;color:#0f172a;display:block;margin-bottom:4px">त्वरित रकम चुनें:</label>
                <div class="chip-row" id="lp-presets">
                  <button type="button" class="chip" data-amt="500">₹500</button>
                  <button type="button" class="chip" data-amt="1000">₹1,000</button>
                  <button type="button" class="chip" data-amt="2000">₹2,000</button>
                  <button type="button" class="chip" data-amt="5000">₹5,000</button>
                </div>
              </div>

              <!-- Amount Input -->
              <div>
                <label style="font-weight:700;font-size:.9rem;color:#0f172a;display:block;margin-bottom:4px">
                  दी गई रकम (Amount) <span style="color:#dc2626">*</span>
                </label>
                <div class="pb-amt-input-wrap">
                  <span class="pb-rupee-sign">₹</span>
                  <input type="number" id="lp-amt" class="pb-amt-input" placeholder="0" autofocus />
                </div>
              </div>

              <!-- Category -->
              <div style="margin-top:12px">
                <label style="font-weight:700;font-size:.85rem;color:#0f172a;display:block;margin-bottom:4px">भुगतान प्रकार:</label>
                <div class="chip-row" id="lp-cat-chips">
                  <button type="button" class="chip chip--on" data-cat="advance">एडवांस (Advance)</button>
                  <button type="button" class="chip" data-cat="salary">सैलरी भुगतान (Salary)</button>
                  <button type="button" class="chip" data-cat="kharcha">खर्चा (Daily Expense)</button>
                </div>
              </div>

              <!-- Mode -->
              <div style="margin-top:12px">
                <label style="font-weight:700;font-size:.85rem;color:#0f172a;display:block;margin-bottom:4px">माध्यम (Mode):</label>
                <div class="chip-row" id="lp-mode-chips">
                  <button type="button" class="chip chip--on" data-mode="cash">💵 नकद (Cash)</button>
                  <button type="button" class="chip" data-mode="upi">📱 UPI / PhonePe</button>
                </div>
              </div>

              <!-- Note -->
              <div style="margin-top:12px">
                <label style="font-weight:700;font-size:.85rem;color:#64748b;display:block;margin-bottom:4px">नोट / विवरण (वैकल्पिक)</label>
                <input type="text" id="lp-note" class="entry-input" placeholder="जैसे: घर खर्च, दवा के लिए एडवांस" lang="hi" />
              </div>

              <!-- Buttons -->
              <div style="margin-top:20px;display:flex;gap:10px">
                <button type="button" id="lp-cancel" class="a-page-btn" style="flex:1;padding:12px;background:#f1f5f9;color:#475569">रद्द करें</button>
                <button type="button" id="lp-save" class="a-page-btn" style="flex:2;padding:12px;background:#dc2626;color:#ffffff;font-weight:800">✓ भुगतान दर्ज करें</button>
              </div>
            </div>
          </div>
        </div>`;

      const close = () => { modalRoot.innerHTML = ''; };
      document.getElementById('lp-close').onclick = close;
      document.getElementById('lp-cancel').onclick = close;
      document.getElementById('lp-backdrop').onclick = (e) => { if (e.target.id === 'lp-backdrop') close(); };

      // Presets
      document.querySelectorAll('#lp-presets button').forEach((b) => {
        b.onclick = () => {
          document.querySelectorAll('#lp-presets button').forEach((x) => x.classList.remove('chip--on'));
          b.classList.add('chip--on');
          document.getElementById('lp-amt').value = b.dataset.amt;
        };
      });

      // Category
      document.querySelectorAll('#lp-cat-chips button').forEach((b) => {
        b.onclick = () => {
          document.querySelectorAll('#lp-cat-chips button').forEach((x) => x.classList.remove('chip--on'));
          b.classList.add('chip--on');
          selectedCategory = b.dataset.cat;
        };
      });

      // Mode
      document.querySelectorAll('#lp-mode-chips button').forEach((b) => {
        b.onclick = () => {
          document.querySelectorAll('#lp-mode-chips button').forEach((x) => x.classList.remove('chip--on'));
          b.classList.add('chip--on');
          selectedMode = b.dataset.mode;
        };
      });

      // Save
      document.getElementById('lp-save').onclick = async () => {
        const amt = Number(document.getElementById('lp-amt')?.value);
        if (!amt || amt <= 0) { toast('कृपया सही रकम डालें'); return; }

        const note = (document.getElementById('lp-note')?.value || '').trim();
        const saveBtn = document.getElementById('lp-save');
        saveBtn.disabled = true;
        saveBtn.textContent = 'दर्ज कर रहे हैं...';

        try {
          await api(`/labour/${labour._id}/entries`, {
            method: 'POST',
            body: {
              type: 'payment',
              amount: amt,
              category: selectedCategory,
              paymentMode: selectedMode,
              description: note,
            },
          });
          playChime();
          toast(`✅ भुगतान ₹${amt.toLocaleString('hi-IN')} सफलतापूर्वक दर्ज हुआ!`);
          close();
          if (onSaved) onSaved();
        } catch (err) {
          toast(err.message || 'भुगतान दर्ज नहीं हो सका');
          saveBtn.disabled = false;
          saveBtn.textContent = '✓ भुगतान दर्ज करें';
        }
      };
    },

    // ── Quick Modal: वेतन जोड़ा (Credit Salary / Daily Wage) ──
    _showLabourCreditModal(labour, onSaved) {
      stopActiveMic();
      const modalRoot = document.getElementById('ld-modal-root');
      if (!modalRoot) return;

      let selectedCategory = labour.wageType === 'daily' ? 'daily_wage' : 'salary';
      const defaultAmt = labour.wageAmount || '';

      modalRoot.innerHTML = `
        <div class="a-modal-backdrop" id="lc-backdrop">
          <div class="a-modal-card pb-modal-card" style="max-width:480px">
            <div class="a-modal-header" style="background:#dcfce7;border-bottom:1.5px solid #bbf7d0">
              <h3 style="margin:0;font-size:1.15rem;font-weight:800;color:#166534">🟢 वेतन / दिहाड़ी जोड़ें (Credit Salary / Wage)</h3>
              <button class="a-page-btn" id="lc-close">✕</button>
            </div>
            <div class="a-modal-body" style="padding:16px 20px">
              <div style="font-size:.9rem;color:#14532d;margin-bottom:10px">
                मज़दूर: <strong>${escapeHtml(labour.name)}</strong> · तय दर: <strong>₹${(labour.wageAmount || 0).toLocaleString('hi-IN')} / ${labour.wageType === 'daily' ? 'दिन' : 'माह'}</strong>
              </div>

              <!-- Amount Input -->
              <div>
                <label style="font-weight:700;font-size:.9rem;color:#0f172a;display:block;margin-bottom:4px">
                  जोड़ने वाली रकम (Amount) <span style="color:#dc2626">*</span>
                </label>
                <div class="pb-amt-input-wrap">
                  <span class="pb-rupee-sign" style="color:#059669">₹</span>
                  <input type="number" id="lc-amt" class="pb-amt-input" value="${defaultAmt}" placeholder="0" autofocus />
                </div>
              </div>

              <!-- Category -->
              <div style="margin-top:12px">
                <label style="font-weight:700;font-size:.85rem;color:#0f172a;display:block;margin-bottom:4px">प्रकार:</label>
                <div class="chip-row" id="lc-cat-chips">
                  <button type="button" class="chip ${selectedCategory === 'salary' ? 'chip--on' : ''}" data-cat="salary">महीने का वेतन (Monthly Salary)</button>
                  <button type="button" class="chip ${selectedCategory === 'daily_wage' ? 'chip--on' : ''}" data-cat="daily_wage">दिहाड़ी / हाज़िरी (Wage)</button>
                  <button type="button" class="chip" data-cat="bonus">बोनस (Bonus)</button>
                </div>
              </div>

              <!-- Note -->
              <div style="margin-top:12px">
                <label style="font-weight:700;font-size:.85rem;color:#64748b;display:block;margin-bottom:4px">विवरण (वैकल्पIC)</label>
                <input type="text" id="lc-note" class="entry-input" placeholder="जैसे: 15 दिन की हाज़िरी, दिवाली बोनस" lang="hi" />
              </div>

              <!-- Buttons -->
              <div style="margin-top:20px;display:flex;gap:10px">
                <button type="button" id="lc-cancel" class="a-page-btn" style="flex:1;padding:12px;background:#f1f5f9;color:#475569">रद्द करें</button>
                <button type="button" id="lc-save" class="a-page-btn" style="flex:2;padding:12px;background:#059669;color:#ffffff;font-weight:800">✓ वेतन जोड़ें</button>
              </div>
            </div>
          </div>
        </div>`;

      const close = () => { modalRoot.innerHTML = ''; };
      document.getElementById('lc-close').onclick = close;
      document.getElementById('lc-cancel').onclick = close;
      document.getElementById('lc-backdrop').onclick = (e) => { if (e.target.id === 'lc-backdrop') close(); };

      // Category
      document.querySelectorAll('#lc-cat-chips button').forEach((b) => {
        b.onclick = () => {
          document.querySelectorAll('#lc-cat-chips button').forEach((x) => x.classList.remove('chip--on'));
          b.classList.add('chip--on');
          selectedCategory = b.dataset.cat;
        };
      });

      // Save
      document.getElementById('lc-save').onclick = async () => {
        const amt = Number(document.getElementById('lc-amt')?.value);
        if (!amt || amt <= 0) { toast('कृपया सही रकम डालें'); return; }

        const note = (document.getElementById('lc-note')?.value || '').trim();
        const saveBtn = document.getElementById('lc-save');
        saveBtn.disabled = true;
        saveBtn.textContent = 'जोड़ रहे हैं...';

        try {
          await api(`/labour/${labour._id}/entries`, {
            method: 'POST',
            body: {
              type: 'salary_credit',
              amount: amt,
              category: selectedCategory,
              description: note,
            },
          });
          playChime();
          toast(`✅ वेतन ₹${amt.toLocaleString('hi-IN')} सफलतापूर्वक जोड़ा गया!`);
          close();
          if (onSaved) onSaved();
        } catch (err) {
          toast(err.message || 'वेतन नहीं जोड़ा जा सका');
          saveBtn.disabled = false;
          saveBtn.textContent = '✓ वेतन जोड़ें';
        }
      };
    },

    // ── Helper to send Labour WhatsApp Statement ──
    _sendLabourWhatsAppStatement(labour, entries, shopTitle) {
      const isOwed = labour.balance > 0;
      const isAdvance = labour.balance < 0;
      const statusText = isOwed ? `बाकी वेतन देना है: ₹${Math.abs(labour.balance).toLocaleString('hi-IN')}` :
                         isAdvance ? `एडवांस जमा है: ₹${Math.abs(labour.balance).toLocaleString('hi-IN')}` :
                         'हिसाब चुकता है ✓';

      let msg = `*${shopTitle} — मज़दूर वेतन व हिसाब विवरण*\n`;
      msg += `मज़दूर: *${labour.name}* (${labour.roleTitle || 'कारीगर'})\n`;
      if (labour.wageAmount) {
        msg += `तय दर: ₹${(labour.wageAmount || 0).toLocaleString('hi-IN')} / ${labour.wageType === 'daily' ? 'दिन' : 'माह'}\n`;
      }
      msg += `--------------------------------\n`;
      msg += `कुल अर्जित वेतन: ₹${(labour.totalEarned || 0).toLocaleString('hi-IN')}\n`;
      msg += `कुल भुगतान (एडवांस+वेतन): ₹${(labour.totalPaid || 0).toLocaleString('hi-IN')}\n`;
      msg += `*वर्तमान शुद्ध स्थिति: ${statusText}*\n`;
      msg += `--------------------------------\n`;
      msg += `हालिया लेन-देन:\n`;

      const recent = (entries || []).slice(0, 5);
      recent.forEach((e) => {
        const d = new Date(e.date || e.createdAt).toLocaleDateString('hi-IN', { day: '2-digit', month: 'short' });
        const sign = e.type === 'salary_credit' ? '+ वेतन जुड़ा' : '- भुगतान दिया';
        msg += `• ${d}: ${sign} ₹${(e.amount || 0).toLocaleString('hi-IN')}${e.description ? ` (${e.description})` : ''}\n`;
      });

      msg += `\n_यह विवरण दुकान के खाता रिकॉर्ड से भेजा गया है।_\n*${shopTitle}*`;

      const phone = (labour.phone || '').replace(/\D/g, '');
      const url = `https://wa.me/${phone.length === 10 ? '91' + phone : phone}?text=${encodeURIComponent(msg)}`;
      window.open(url, '_blank');
    },
  };

  g.KhataParent = Parent;
})(window);
