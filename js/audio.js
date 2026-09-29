(function (global) {
  'use strict';

  const Sfx = {
    enabled: true,
    ctx: null,

    ensure() {
      if (!this.ctx) {
        const AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },

    tone(freq, dur, opts) {
      if (!this.enabled) return;
      const ctx = this.ensure();
      if (!ctx) return;
      const o = opts || {};
      const t0 = ctx.currentTime + (o.when || 0);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, o.slide), t0 + dur);
      const vol = o.vol === undefined ? 0.22 : o.vol;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    },

    select() {
      this.tone(880, 0.09, { type: 'triangle', vol: 0.18 });
    },

    correct() {
      this.tone(660, 0.14, { type: 'triangle', vol: 0.24 });
      this.tone(880, 0.14, { type: 'triangle', vol: 0.24, when: 0.1 });
      this.tone(1320, 0.3, { type: 'triangle', vol: 0.22, when: 0.2 });
    },

    wrong() {
      this.tone(200, 0.28, { type: 'sawtooth', vol: 0.2, slide: 90 });
    },

    tick() {
      this.tone(1200, 0.05, { type: 'square', vol: 0.08 });
    },

    count() {
      this.tone(520, 0.16, { type: 'square', vol: 0.16 });
    },

    go() {
      this.tone(700, 0.12, { type: 'square', vol: 0.2 });
      this.tone(1050, 0.3, { type: 'square', vol: 0.18, when: 0.12 });
    },

    timeout() {
      this.tone(360, 0.3, { type: 'sine', vol: 0.2, slide: 180 });
    },

    win() {
      const notes = [523, 659, 784, 1046, 784, 1046];
      notes.forEach((n, i) => this.tone(n, 0.22, { type: 'triangle', vol: 0.22, when: i * 0.13 }));
    },

    fanfare() {
      const notes = [392, 523, 659, 784, 659, 784, 988];
      notes.forEach((n, i) => this.tone(n, 0.3, { type: 'square', vol: 0.16, when: i * 0.16 }));
    },
  };

  global.Sfx = Sfx;
})(window);
