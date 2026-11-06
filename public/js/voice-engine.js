/**
 * Pause-tolerant, echo-suppressed voice ledger engine with app-level silence timer.
 * Prevents Android Chrome resultIndex bugs, word/phrase duplications, and audio feedback loops.
 * States: IDLE → LISTENING → SILENCE_COUNTDOWN → (done) …
 */
(function (g) {
  const SR = g.SpeechRecognition || g.webkitSpeechRecognition;

  /**
   * Cleans immediate duplicate words and repeating multi-word phrases (echo/glitch suppression).
   * E.g. "साड़ी 500 साड़ी 500" -> "साड़ी 500"
   * E.g. "रमेश रमेश" -> "रमेश"
   */
  function cleanPhraseDuplicates(str) {
    if (!str) return '';
    let words = str.trim().split(/\s+/);
    if (words.length <= 1) return str.trim();

    let modified = true;
    let guard = 0;
    while (modified && guard++ < 30) {
      modified = false;
      // Search for repeating phrases from half length down to 1 word
      for (let len = Math.floor(words.length / 2); len >= 1; len--) {
        for (let i = 0; i <= words.length - 2 * len; i++) {
          const p1 = words.slice(i, i + len).join(' ');
          const p2 = words.slice(i + len, i + 2 * len).join(' ');
          if (p1.toLowerCase() === p2.toLowerCase()) {
            words.splice(i + len, len);
            modified = true;
            break;
          }
        }
        if (modified) break;
      }
    }
    return words.join(' ');
  }

  class VoiceEngine {
    constructor(opts = {}) {
      this.lang = opts.lang || 'hi-IN';
      this.silenceMs = opts.silenceMs || 3000;
      this.onPartial = opts.onPartial || (() => {});
      this.onState = opts.onState || (() => {});
      this.onComplete = opts.onComplete || (() => {});
      this.onError = opts.onError || (() => {});

      this._rec = null;
      this._history = [];       // finals from previous restart cycles
      this._sessionFinals = []; // finals from current SpeechRecognition instance
      this._interim = '';
      this._active = false;
      this._manual = false;
      this._silenceTimer = null;
      this._silenceStart = null;
      this._raf = null;
      this._partialRaf = null;
      this._sessionId = 0;
      this.state = 'IDLE';
    }

    get supported() {
      return Boolean(SR);
    }

    get transcript() {
      const allFinals = [...this._history, ...this._sessionFinals];
      const raw = `${allFinals.join(' ')} ${this._interim}`.replace(/\s+/g, ' ').trim();
      return cleanPhraseDuplicates(raw);
    }

    _setState(s) {
      this.state = s;
      this.onState(s, this._silenceProgress());
    }

    _silenceProgress() {
      if (!this._silenceStart) return 0;
      return Math.min(1, (Date.now() - this._silenceStart) / this.silenceMs);
    }

    start() {
      if (!this.supported) {
        this.onError({ code: 'unsupported' });
        return;
      }
      this._manual = false;
      this._history = [];
      this._sessionFinals = [];
      this._interim = '';
      this._active = true;
      this._startRec(true);
      this._armSilence();
      this._setState('LISTENING');
    }

    done() {
      this._manual = true;
      this._clearSilence();
      const text = this.transcript;
      this._stopRec();
      this._active = false;
      this._setState('IDLE');
      this.onComplete(cleanPhraseDuplicates(text));
    }

    clearBuffer() {
      this._history = [];
      this._sessionFinals = [];
      this._interim = '';
      this.onPartial('', '');
      this._armSilence();
      this._setState('LISTENING');
    }

    cancel() {
      this._manual = true;
      this._active = false;
      this._clearSilence();
      this._stopRec();
      this._history = [];
      this._sessionFinals = [];
      this._interim = '';
      this._setState('IDLE');
    }

    listenOnce(timeoutMs = 10000) {
      return new Promise((resolve) => {
        this.cancel();
        this._manual = false;
        this._history = [];
        this._sessionFinals = [];
        this._interim = '';
        this._active = true;
        const prevComplete = this.onComplete;
        const prevSilence = this.silenceMs;
        this.silenceMs = timeoutMs;
        this.onComplete = (text) => {
          this.onComplete = prevComplete;
          this.silenceMs = prevSilence;
          resolve(cleanPhraseDuplicates(text));
        };
        this._startRec(false); // single-shot mode
        this._armSilence();
        this._setState('LISTENING');
      });
    }

    speak(text, rate = 0.82) {
      return new Promise((resolve) => {
        if (!g.speechSynthesis) return resolve(false);
        // Cancel any active speech or mic before speaking to avoid feedback loop
        this.cancel();
        g.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = this.lang;
        u.rate = rate;
        u.onend = () => {
          // Grace delay for hardware speaker echo to dissipate before mic opens
          setTimeout(() => resolve(true), 200);
        };
        u.onerror = () => resolve(false);
        g.speechSynthesis.speak(u);
      });
    }

    _emitPartial() {
      if (this._partialRaf) cancelAnimationFrame(this._partialRaf);
      this._partialRaf = requestAnimationFrame(() => {
        this._partialRaf = null;
        if (this._active) {
          this.onPartial(this.transcript, this._interim);
        }
      });
    }

    _startRec(continuous = true) {
      this._stopRec();
      const sessionId = ++this._sessionId;
      const rec = new SR();
      rec.lang = this.lang;
      rec.continuous = continuous;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onresult = (ev) => {
        if (sessionId !== this._sessionId) return;

        // Reconstruct finals directly by slot index from ev.results.
        // This is 100% immune to Chrome Android's resultIndex reset bug.
        const finals = [];
        let interim = '';

        for (let i = 0; i < ev.results.length; i++) {
          const r = ev.results[i];
          const t = (r[0] && r[0].transcript) ? r[0].transcript.trim() : '';
          if (!t) continue;
          if (r.isFinal) {
            finals.push(t);
          } else {
            interim = t;
          }
        }

        this._sessionFinals = finals;
        this._interim = interim;

        this._emitPartial();
        this._armSilence();
        this._setState('LISTENING');
      };

      rec.onerror = (e) => {
        if (sessionId !== this._sessionId) return;
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        if (e.error === 'not-allowed') this.onError({ code: 'not-allowed' });
        else if (e.error === 'network') this.onError({ code: 'network' });
      };

      rec.onend = () => {
        if (sessionId !== this._sessionId) return;
        if (this._active && !this._manual) {
          // If we already captured a complete transcript and speech ended naturally, finish now!
          const current = this.transcript;
          if (current && current.length >= 2) {
            this.done();
            return;
          }

          // Otherwise commit any final fragments to history and restart listening for speech
          if (this._sessionFinals.length) {
            for (const f of this._sessionFinals) {
              if (!this._history.length || this._history[this._history.length - 1] !== f) {
                this._history.push(f);
              }
            }
            this._sessionFinals = [];
          }

          setTimeout(() => {
            if (this._active && !this._manual && sessionId === this._sessionId) {
              this._startRec(continuous);
            }
          }, 100);
        }
      };

      this._rec = rec;
      try {
        rec.start();
      } catch (err) {
        this.onError({ code: 'start', message: err.message });
      }
    }

    _stopRec() {
      this._sessionId++;
      if (this._partialRaf) cancelAnimationFrame(this._partialRaf);
      this._partialRaf = null;
      if (!this._rec) return;
      try {
        this._rec.onend = null;
        this._rec.onresult = null;
        this._rec.onerror = null;
        this._rec.stop();
      } catch { /* ignore */ }
      this._rec = null;
    }

    _armSilence() {
      this._clearSilence(false);
      this._silenceStart = Date.now();
      this._silenceTimer = setTimeout(() => this._onSilence(), this.silenceMs);
      const tick = () => {
        if (!this._silenceStart) return;
        const p = this._silenceProgress();
        if (p >= 5 / 8) this._setState('SILENCE_COUNTDOWN');
        else this.onState(this.state, p);
        this._raf = requestAnimationFrame(tick);
      };
      this._raf = requestAnimationFrame(tick);
    }

    _clearSilence(resetState = true) {
      if (this._silenceTimer) clearTimeout(this._silenceTimer);
      this._silenceTimer = null;
      this._silenceStart = null;
      if (this._raf) cancelAnimationFrame(this._raf);
      this._raf = null;
      if (resetState) this.onState(this.state, 0);
    }

    _onSilence() {
      if (this.transcript.length >= 2) this.done();
      else {
        this.onPartial('', '');
        this._armSilence();
        this._setState('LISTENING');
      }
    }
  }

  VoiceEngine.cleanPhraseDuplicates = cleanPhraseDuplicates;
  g.VoiceEngine = VoiceEngine;
})(window);
