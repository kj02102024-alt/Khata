(function (g) {
  const USER_KEY = 'khata_user';

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch {
      return null;
    }
  }
  // token param is ignored — auth is httpOnly session cookie, not Bearer token
  function setSession(_token, user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  function clearSession() {
    localStorage.removeItem(USER_KEY);
  }

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !(options.body instanceof FormData) && typeof options.body === 'object') {
      headers['Content-Type'] = 'application/json';
      options = { ...options, body: JSON.stringify(options.body) };
    }
    const res = await fetch(`/api${path}`, { ...options, headers, credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.messageHi || data.error || 'त्रुटि');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function inr(n) {
    return `₹${Number(n || 0).toLocaleString('en-IN')}`;
  }

  function toast(msg, { undo, ms = 4000 } = {}) {
    const root = document.getElementById('toast-root');
    root.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span>${escapeHtml(msg)}</span>`;
    if (undo) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'वापस लें';
      b.onclick = () => {
        clearTimeout(t);
        el.remove();
        undo();
      };
      el.appendChild(b);
    }
    root.appendChild(el);
    const t = setTimeout(() => el.remove(), undo ? 10000 : ms);
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function playChime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g_ = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 660;
      g_.gain.value = 0.04;
      o.connect(g_);
      g_.connect(ctx.destination);
      o.start();
      g_.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      o.stop(ctx.currentTime + 0.4);
    } catch { /* ignore */ }
  }

  function generateWhatsAppStatement(customer, entries, shopName) {
    const isSettled = (customer.balance || 0) <= 0;
    const today = new Date().toLocaleDateString('hi-IN');
    const custName = (customer.honorific ? customer.honorific + ' ' : '') + (customer.displayName || customer.name || 'ग्राहक');
    const recent = (entries || []).slice(0, 8);

    let lines = [];
    lines.push(`*खाता पर्ची / Passbook Statement* 📜`);
    if (shopName) lines.push(`*दुकान:* ${shopName}`);
    lines.push(`*दिनांक:* ${today}`);
    lines.push(`--------------------------------`);
    lines.push(`*ग्राहक:* ${custName}`);
    if (customer.village) lines.push(`*गाँव / पता:* ${customer.village}`);
    if (customer.phone) lines.push(`*फ़ोन:* ${customer.phone}`);
    lines.push(`--------------------------------`);
    lines.push(`*कुल बाकी (Current Balance): ${inr(customer.balance || 0)}*`);
    lines.push(`*स्थिति:* ${isSettled ? 'चुकता ✓ (Settled)' : 'भुगतान शेष (Pending)'}`);
    lines.push(`--------------------------------`);
    lines.push(`*हालिया लेन-देन (Recent Transactions):*`);

    if (!recent.length) {
      lines.push(`(अभी कोई लेन-देन दर्ज नहीं है)`);
    } else {
      recent.forEach((e, i) => {
        const dt = new Date(e.date).toLocaleDateString('hi-IN');
        const isPayment = e.type === 'payment';
        const label = e.item || (e.items && e.items[0]?.name) || (isPayment ? 'जमा भुगतान' : 'उधार');
        const tag = isPayment ? 'जमा (−)' : 'उधार (+)';
        const runBal = e.runningBalance != null ? ` [बाकी: ${inr(e.runningBalance)}]` : '';
        lines.push(`${i + 1}. ${dt}: ${label} · ${tag} ${inr(e.amount)}${runBal}`);
      });
    }

    lines.push(`--------------------------------`);
    if (isSettled) {
      lines.push(`आपका समस्त हिसाब चुकता है। बहुत-बहुत धन्यवाद! 🙏`);
    } else {
      lines.push(`कृपया समयानुसार शेष रकम का भुगतान करें।`);
      lines.push(`धन्यवाद! 🙏`);
    }
    return lines.join('\n');
  }

  function promptWhatsAppNumber(text, customer) {
    const existing = document.getElementById('wa-num-modal-container');
    if (existing) existing.remove();
    const div = document.createElement('div');
    div.id = 'wa-num-modal-container';
    div.innerHTML = `
      <div class="a-modal-backdrop" id="wa-num-backdrop">
        <div class="a-modal-card" style="max-width:440px">
          <div class="a-modal-header">
            <h3 style="margin:0;font-size:1.15rem;font-weight:800;color:#092c20">📲 WhatsApp पर हिसाब भेजें</h3>
            <button class="a-page-btn" id="wa-num-close" style="padding:4px 10px">✕</button>
          </div>
          <div class="a-modal-body" style="padding:16px 20px">
            <p style="margin:0 0 12px;font-size:.9rem;color:#475569">
              ग्राहक का 10-अंक का WhatsApp मोबाइल नंबर दर्ज करें या हिसाब कॉपी करें:
            </p>
            <div style="margin-bottom:14px">
              <input type="tel" id="wa-num-input" class="entry-input" placeholder="9876543210" maxlength="10" inputmode="numeric" style="font-size:1.1rem;font-weight:700;letter-spacing:1px;width:100%;box-sizing:border-box" />
              <div id="wa-num-err" style="color:#dc2626;font-size:.8rem;margin-top:4px;display:none">कृपया 10 अंक का वैध मोबाइल नंबर डालें (6-9 से शुरू)</div>
            </div>
            <div style="margin-bottom:14px">
              <label style="font-size:.78rem;font-weight:700;color:#64748b;display:block;margin-bottom:4px">संदेश का पूर्वावलोकन (Preview):</label>
              <textarea readonly style="width:100%;height:110px;font-size:.8rem;padding:8px;border:1px solid #cbd5e1;border-radius:8px;resize:none;background:#f8fafc;font-family:inherit;box-sizing:border-box">${escapeHtml(text)}</textarea>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button type="button" class="a-page-btn" id="wa-num-send" style="flex:1;background:#25D366;color:#ffffff;font-weight:800;font-size:.95rem;padding:10px">
                📲 WhatsApp खोलें
              </button>
              <button type="button" class="a-page-btn" id="wa-num-copy" style="background:#092c20;color:#ffffff;font-size:.85rem;padding:10px">
                📋 कॉपी करें
              </button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(div);

    const close = () => div.remove();
    document.getElementById('wa-num-close').onclick = close;
    document.getElementById('wa-num-backdrop').onclick = (e) => { if (e.target.id === 'wa-num-backdrop') close(); };

    document.getElementById('wa-num-copy').onclick = () => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
        toast('हिसाब क्लिपबोर्ड पर कॉपी हो गया!');
      }
    };

    document.getElementById('wa-num-send').onclick = () => {
      const val = (document.getElementById('wa-num-input').value || '').replace(/\D/g, '').replace(/^91/, '');
      if (val.length !== 10 || !/^[6-9]/.test(val)) {
        document.getElementById('wa-num-err').style.display = 'block';
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(() => {});
      }
      window.open(`https://wa.me/91${val}?text=${encodeURIComponent(text)}`, '_blank');
      close();
    };
  }

  function sendWhatsAppStatement(customer, entries, shopName) {
    const text = generateWhatsAppStatement(customer, entries, shopName);
    const cleanPhone = (customer.phone || customer.mobile2 || '').replace(/\D/g, '').replace(/^91/, '');
    if (cleanPhone.length === 10 && /^[6-9]/.test(cleanPhone)) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(() => {});
      }
      window.open(`https://wa.me/91${cleanPhone}?text=${encodeURIComponent(text)}`, '_blank');
      toast('WhatsApp खुल रहा है और हिसाब कॉपी हो गया है!');
    } else {
      promptWhatsAppNumber(text, customer);
    }
  }

  g.KhataAPI = {
    api,
    getUser,
    setSession,
    clearSession,
    inr,
    toast,
    escapeHtml,
    playChime,
    generateWhatsAppStatement,
    promptWhatsAppNumber,
    sendWhatsAppStatement,
  };
})(window);
