(function (global) {
  'use strict';

  const MOUSE_ACTIVE_MS = 1200;
  const TOUCH_ACTIVE_MS = 700;

  const Pointer = {
    s: {
      1: { x: 0, y: 0, last: -1e9, down: false },
      2: { x: 0, y: 0, last: -1e9, down: false },
    },
    map: {},
    taps: [],
    enabled: true,
    solo: false,

    init(root) {
      this.root = root;
      root.addEventListener('pointerdown', (e) => this.onDown(e), { capture: true });
      root.addEventListener('pointermove', (e) => this.onMove(e), { capture: true });
      global.addEventListener('pointerup', (e) => this.onUp(e), { capture: true });
      global.addEventListener('pointercancel', (e) => this.onUp(e), { capture: true });
      root.addEventListener('contextmenu', (e) => e.preventDefault());
    },

    playerForTouch(x) {
      if (this.solo) return 1;
      const mid = global.innerWidth / 2;
      const want = x < mid ? 1 : 2;
      const other = want === 1 ? 2 : 1;
      const taken = Object.values(this.map).indexOf(want) >= 0;
      if (!taken) return want;
      const takenOther = Object.values(this.map).indexOf(other) >= 0;
      return takenOther ? want : other;
    },

    onDown(e) {
      if (!this.enabled) return;
      const now = performance.now();
      let player;
      if (e.pointerType === 'touch') {
        player = this.playerForTouch(e.clientX);
      } else if (e.button === 2) {
        player = 2;
      } else {
        player = 1;
      }
      if (this.solo) player = 1;
      this.map[e.pointerId] = player;
      const s = this.s[player];
      s.x = e.clientX;
      s.y = e.clientY;
      s.down = true;
      s.last = now;
      s.touch = e.pointerType === 'touch';
      this.taps.push({ player, x: e.clientX, y: e.clientY });
      if (global.Sfx && global.Sfx.enabled) global.Sfx.select();
    },

    onMove(e) {
      if (!this.enabled) return;
      const now = performance.now();
      if (e.pointerType === 'touch') {
        const player = this.map[e.pointerId];
        if (!player) return;
        const s = this.s[player];
        s.x = e.clientX;
        s.y = e.clientY;
        s.last = now;
        return;
      }
      if (e.buttons & 2 && !this.solo) {
        const s2 = this.s[2];
        s2.x = e.clientX;
        s2.y = e.clientY;
        s2.last = now;
        s2.down = true;
        s2.touch = false;
        return;
      }
      const s1 = this.s[1];
      s1.x = e.clientX;
      s1.y = e.clientY;
      s1.last = now;
      s1.touch = false;
    },

    onUp(e) {
      const player = this.map[e.pointerId];
      if (!player) return;
      delete this.map[e.pointerId];
      const stillDown = Object.values(this.map).indexOf(player) >= 0;
      this.s[player].down = stillDown;
      this.s[player].last = performance.now();
    },

    override(player, now) {
      const s = this.s[player];
      const window = s.touch ? TOUCH_ACTIVE_MS : MOUSE_ACTIVE_MS;
      const recent = now - s.last;
      if (recent > window && !s.down) return null;
      return { x: s.x, y: s.y, pointing: true, fromPointer: true };
    },

    consumeTaps() {
      if (!this.taps.length) return [];
      const out = this.taps;
      this.taps = [];
      return out;
    },

    reset() {
      this.taps = [];
      this.map = {};
      for (const p of [1, 2]) {
        this.s[p].last = -1e9;
        this.s[p].down = false;
      }
    },
  };

  global.Pointer = Pointer;
})(window);
