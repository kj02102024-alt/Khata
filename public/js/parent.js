/**
 * Khata Parent (Shop) Portal v2
 * Screens: home → हिसाब लिखें | ग्राहक खोजें | डायरी फोटो
 */
(function (g) {
  const { api, getUser, inr, toast, escapeHtml, playChime } = g.KhataAPI;

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
              <span class="p-card-hint">बोलकर या लिखकर</span>
            </button>
            <button class="p-card p-card--search" type="button" id="go-search">
              <span class="ico">🔍</span>
              <span class="p-card-label">ग्राहक खोजें</span>
              <span class="p-card-hint">बचा कितना है देखें</span>
            </button>
            <button class="p-card p-card--photo" type="button" id="go-diary">
              <span class="ico">📷</span>
              <span class="p-card-label">पुरानी डायरी की फोटो</span>
              <span class="p-card-hint">एडमिन जाँच करेंगे</span>
            </button>
          </div>
          <button type="button" id="logout" class="p-logout">दुकान बदलें / बाहर निकलें</button>
        </div>`;
      document.getElementById('go-entry').onclick = () => { this.form = emptyForm(); this.go('entry'); };
      document.getElementById('go-search').onclick = () => this.go('search');
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
              <div class="nm">${escapeHtml(c.displayName || c.name)}</div>
              <div class="rel">${escapeHtml(c.identifierNote || c.relationNote || '')} · ${escapeHtml(c.village || '')}</div>
              <div class="bacha">${tab === 'settled' ? 'चुकता ✓' : 'बचा ' + inr(c.balance)}</div>
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

    // ─── CUSTOMER DETAIL ──────────────────────────────────────────────────────
    async viewCustomer() {
      try {
        const { customer, entries } = await api(`/customers/${this.data.id}`);
        const renderEntries = (list) => {
          if (!list.length) return '<p class="empty-state">अभी कोई हिसाब नहीं है। ➕ दबाकर पहला हिसाब लिखें।</p>';
          return list.map((e) => {
            const cleared = e.isCleared || (e.settledAmount >= e.amount && e.type === 'sale');
            const itemLabel = e.items && e.items.length ? e.items.map((it) => it.name).join(', ') : (e.item || (e.type === 'payment' ? 'जमा' : 'उधार'));
            return `<div class="entry-line ${cleared ? 'cleared' : ''}" data-type="${e.type}">
                      <div class="desc">
                        <strong>${escapeHtml(itemLabel)}</strong><br/>
                        <span style="font-size:16px;color:var(--ink-soft)">${new Date(e.date).toLocaleDateString('hi-IN')}${e.entryTime ? ' · ' + new Date(e.entryTime).toLocaleTimeString('hi-IN',{hour:'2-digit',minute:'2-digit'}) : ''}</span>
                        ${e.note || e.notes ? `<br/><span style="font-size:14px;color:var(--ink-soft)">${escapeHtml(e.note || e.notes)}</span>` : ''}
                      </div>
                      <div class="rupee" style="font-weight:800;color:${e.type === 'payment' ? 'var(--ok)' : 'var(--owed)'}">${e.type === 'payment' ? '−' : '+'}${inr(e.amount)}</div>
                    </div>`;
          }).join('');
        };

        this.root.innerHTML = `
          <div class="p-shell p-screen">
            ${this.nav()}
            <div class="pinned-bacha">
              <div class="cust-header">
                ${customer.honorific ? `<span class="honorific-badge">${escapeHtml(customer.honorific)}</span>` : ''}
                <span style="font-size:28px;font-weight:800">${escapeHtml(customer.name)}</span>
              </div>
              ${customer.identifierNote || customer.relationNote ? `<div class="cust-note">${escapeHtml(customer.identifierNote || customer.relationNote)}</div>` : ''}
              <div class="rel" style="color:var(--ink-soft);font-size:18px">${escapeHtml(customer.village || '')}${customer.phone ? ' · ' + escapeHtml(customer.phone) : ''}</div>
              <div class="amt">बचा ${inr(customer.balance)}</div>
            </div>
            <div class="tabs" role="tablist" id="entry-filter-tabs">
              <button role="tab" type="button" class="on" data-filter="all">सब</button>
              <button role="tab" type="button" data-filter="sale">उधार</button>
              <button role="tab" type="button" data-filter="payment">जमा</button>
            </div>
            <div class="diary-page" id="diary-entries">
              ${renderEntries(entries)}
            </div>
            <div class="btn-row">
              <button class="btn-huge btn-primary" type="button" id="new-credit">➕ नया उधार</button>
              <button class="btn-huge btn-ok" type="button" id="new-pay">💰 जमा</button>
              ${customer.phone ? `<a class="btn-huge btn-ghost" href="tel:${escapeHtml(customer.phone)}" style="display:grid;place-items:center;text-decoration:none">📞 कॉल करें</a>` : ''}
            </div>
          </div>`;

        // Filter tabs
        this.root.querySelectorAll('#entry-filter-tabs button').forEach((b) => {
          b.onclick = () => {
            this.root.querySelectorAll('#entry-filter-tabs button').forEach((x) => x.classList.remove('on'));
            b.classList.add('on');
            const filter = b.dataset.filter;
            const filtered = filter === 'all' ? entries : entries.filter((e) => e.type === filter);
            const diaryEl = document.getElementById('diary-entries');
            if (diaryEl) diaryEl.innerHTML = renderEntries(filtered);
          };
        });

        document.getElementById('new-credit').onclick = () => {
          this.form = emptyForm();
          this._fillCustomer(customer);
          this.form.txType = 'sale';
          this.go('entry');
        };
        document.getElementById('new-pay').onclick = () => {
          this.form = emptyForm();
          this._fillCustomer(customer);
          this.form.txType = 'payment';
          this.go('entry');
        };
      } catch {
        toast('खाता नहीं खुला');
        this.back();
      }
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
  };

  g.KhataParent = Parent;
})(window);
