/**
 * Pause-tolerant voice ledger engine with app-level silence timer.
 * States: IDLE → LISTENING → SILENCE_COUNTDOWN → (done) …
 */
(function (g) {
  const SR = g.SpeechRecognition || g.webkitSpeechRecognition;

  class VoiceEngine {
    constructor(opts = {}) {
      this.lang = opts.lang || 'hi-IN';
      this.silenceMs = opts.silenceMs || 8000;
      this.onPartial = opts.onPartial || (() => {});
      this.onState = opts.onState || (() => {});
      this.onComplete = opts.onComplete || (() => {});
      this.onError = opts.onError || (() => {});

      this._rec = null;
      this._finals = [];
      this._interim = '';
      this._lastInterim = '';
      this._active = false;
      this._manual = false;
      this._silenceTimer = null;
      this._silenceStart = null;
      this._raf = null;
      this.state = 'IDLE';
    }

    get supported() {
      return Boolean(SR);
    }

    get transcript() {
      return `${this._finals.join(' ')} ${this._interim}`.replace(/\s+/g, ' ').trim();
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
      this._finals = [];
      this._interim = '';
      this._lastInterim = '';
      this._active = true;
      this._startRec();
      this._armSilence();
      this._setState('LISTENING');
    }

    done() {
      this._manual = true;
      this._clearSilence();
      this._stopRec();
      this._active = false;
      this._setState('IDLE');
      this.onComplete(this.transcript);
    }

    clearBuffer() {
      this._finals = [];
      this._interim = '';
      this._lastInterim = '';
      this.onPartial(this.transcript, '');
      this._armSilence();
      this._setState('LISTENING');
    }

    cancel() {
      this._manual = true;
      this._active = false;
      this._clearSilence();
      this._stopRec();
      this._setState('IDLE');
    }

    listenOnce(timeoutMs = 10000) {
      return new Promise((resolve) => {
        this.cancel();
        this._manual = false;
        this._finals = [];
        this._interim = '';
        this._active = true;
        const prevComplete = this.onComplete;
        const prevSilence = this.silenceMs;
        this.silenceMs = timeoutMs;
        this.onComplete = (text) => {
          this.onComplete = prevComplete;
          this.silenceMs = prevSilence;
          resolve(text);
        };
        this._startRec();
        this._armSilence();
        this._setState('LISTENING');
      });
    }

    speak(text, rate = 0.82) {
      return new Promise((resolve) => {
        if (!g.speechSynthesis) return resolve(false);
        g.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = this.lang;
        u.rate = rate;
        u.onend = () => resolve(true);
        u.onerror = () => resolve(false);
        g.speechSynthesis.speak(u);
      });
    }

    _startRec() {
      this._stopRec(true);
      const rec = new SR();
      rec.lang = this.lang;
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onresult = (ev) => {
        let interim = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i];
          const t = r[0].transcript;
          if (r.isFinal) {
            this._finals.push(t.trim());
            this._interim = '';
            this._lastInterim = '';
          } else {
            // De-dupe Android Chrome re-emits
            if (t === this._lastInterim) continue;
            this._lastInterim = t;
            interim += t;
          }
        }
        if (interim) this._interim = interim;
        this.onPartial(this.transcript, this._interim);
        this._armSilence();
        this._setState('LISTENING');
      };

      rec.onerror = (e) => {
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        if (e.error === 'not-allowed') this.onError({ code: 'not-allowed' });
        else if (e.error === 'network') this.onError({ code: 'network' });
      };

      rec.onend = () => {
        if (this._active && !this._manual) {
          try {
            rec.start();
          } catch {
            setTimeout(() => {
              if (this._active && !this._manual) this._startRec();
            }, 180);
          }
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
      if (!this._rec) return;
      try {
        this._rec.onend = null;
        this._rec.stop();
      } catch { /* */ }
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
      if (this.transcript.length > 1) this.done();
      else {
        this.onPartial(this.transcript, '');
        this._armSilence();
        this._setState('LISTENING');
      }
    }
  }

  g.VoiceEngine = VoiceEngine;
})(window);
