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

  g.KhataAPI = { api, getUser, setSession, clearSession, inr, toast, escapeHtml, playChime };
})(window);
