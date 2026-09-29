(function (global) {
  'use strict';

  const RING_LEN = 276.5;
  const LETTERS = 'ABCDEFGH';

  const UI = {
    el: {},
    names: { 1: 'Pemain 1', 2: 'Pemain 2' },
    cursorSize: 70,
    toastTimer: null,

    get(id) {
      if (!this.el[id]) this.el[id] = document.getElementById(id);
      return this.el[id];
    },

    init() {
      this.get('app');
      this.get('cursor-layer');
      this.get('cur-1');
      this.get('cur-2');
      this.get('options');
      this.get('fx');
      this.get('arena');
      this.get('toast');
      this.measureCursors();
    },

    measureCursors() {
      const c = this.get('cur-1');
      this.cursorSize = c ? c.offsetWidth || 70 : 70;
    },

    show(screenId) {
      document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === screenId));
      if (screenId !== 'screen-menu') this.hideCursors();
    },

    setNames(n1, n2) {
      this.names[1] = n1 || 'Pemain 1';
      this.names[2] = n2 || 'Pemain 2';
      const set = (id, v) => {
        const e = this.get(id);
        if (e) e.textContent = v;
      };
      set('sb-name-1', this.names[1]);
      set('sb-name-2', this.names[2]);
      set('hs-name-1', this.names[1]);
      set('hs-name-2', this.names[2]);
      set('fs-name-1', this.names[1]);
      set('fs-name-2', this.names[2]);
      const t1 = this.get('cur-1');
      const t2 = this.get('cur-2');
      if (t1) t1.querySelector('.c-tag').textContent = 'P1';
      if (t2) t2.querySelector('.c-tag').textContent = 'P2';
    },

    buildBrand() {
      const box = this.get('brand-glyphs');
      if (!box || box.childElementCount) return;
      const order = ['ha', 'na', 'ca', 'ra', 'ka', 'da', 'ta', 'sa', 'wa', 'la', 'pa', 'ja', 'ya', 'nya', 'ga', 'nga', 'tha', 'dha', 'ma', 'ba'];
      const frag = document.createDocumentFragment();
      for (const name of order) {
        const img = document.createElement('img');
        img.src = AJ.ASSET_BASE + name + '.png';
        img.alt = name;
        frag.appendChild(img);
      }
      box.appendChild(frag);
    },

    toggle(el, on) {
      if (el) el.classList.toggle('show', !!on);
    },

    setCamStatus(state, msg) {
      const el = this.get('cam-status');
      if (!el) return;
      const map = {
        loading: ['loading', msg || 'memuat…'],
        ready: ['ok', 'gesture siap'],
        offline: ['err', 'model gagal'],
        'no-permission': ['err', 'izin ditolak'],
        'no-camera': ['err', 'tidak ada kamera'],
        error: ['err', 'error'],
      };
      const m = map[state] || ['', state];
      el.className = 'status ' + m[0];
      el.textContent = m[1];
    },

    setCamHint(text) {
      const el = this.get('cam-hint');
      if (el) el.textContent = text;
    },

    setHandHints(hints) {
      const apply = (n) => {
        const box = this.get('hs-' + n);
        const txt = this.get('hs-txt-' + n);
        if (!box || !txt) return;
        const h = hints[n];
        txt.textContent = h.text;
        box.classList.toggle('point', h.kind === 'point');
        box.classList.toggle('palm', h.kind === 'palm' || h.kind === 'fist');
      };
      apply(1);
      apply(2);
    },

    setHandFlag(player, seen, pointing) {
      const el = this.get('sb-hand-' + player);
      if (!el) return;
      const on = seen && pointing;
      el.classList.toggle('on', !!on);
      el.textContent = seen ? (pointing ? 'menunjuk' : 'tangan ada') : 'tangan -';
    },

    placeCamBox(where) {
      const box = this.get('cam-box');
      if (!box) return;
      const targets = {
        home: this.get('cam-home'),
        mini: this.get('screen-game'),
        pause: this.get('cam-pause-home'),
      };
      const parent = targets[where];
      if (!parent) return;
      box.classList.toggle('mini', where === 'mini');
      if (box.parentElement !== parent) parent.appendChild(box);
    },

    showToast(msg, ms) {
      const t = this.get('toast');
      if (!t) return;
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => t.classList.remove('show'), ms || 2600);
    },

    buildQuestion(q, roundNo) {
      const roundEl = this.get('q-round');
      const main = this.get('q-main');
      const hint = this.get('q-hint');
      if (roundEl) roundEl.textContent = String(roundNo);
      if (!main || !hint) return;
      if (q.type === 'img') {
        main.innerHTML = '';
        main.textContent = q.answer.toUpperCase();
        hint.innerHTML = 'Pilih <b>gambar aksara</b> yang berbunyi seperti ini';
      } else {
        main.innerHTML = '<img src="' + AJ.ASSET_BASE + q.answer + '.png" alt="aksara">';
        hint.innerHTML = 'Aksara ini berbunyi apa? Pilih <b>namanya</b>';
      }
    },

    createOption(question, index, size) {
      const el = document.createElement('div');
      el.className = 'opt';
      el.style.width = size + 'px';
      el.style.height = size + 'px';
      const badge = document.createElement('span');
      badge.className = 'opt-num';
      badge.textContent = LETTERS[index] || '';
      el.appendChild(badge);
      if (question.type === 'img') {
        const img = document.createElement('img');
        img.src = AJ.ASSET_BASE + question.options[index].value + '.png';
        img.alt = question.options[index].value;
        el.appendChild(img);
      } else {
        const span = document.createElement('span');
        span.className = 'opt-text';
        span.textContent = question.options[index].value.toUpperCase();
        el.appendChild(span);
      }
      this.get('options').appendChild(el);
      return el;
    },

    clearOptions() {
      const box = this.get('options');
      if (box) box.innerHTML = '';
      const fx = this.get('fx');
      if (fx) fx.innerHTML = '';
    },

    setOptionPos(el, x, y) {
      el.style.setProperty('--tf', 'translate3d(' + x + 'px, ' + y + 'px, 0)');
    },

    setOptionHover(options, t1, t2) {
      for (const o of options) {
        const is1 = t1 === o.id;
        const is2 = t2 === o.id;
        o.el.classList.toggle('hover1', is1 && !is2);
        o.el.classList.toggle('hover2', is2 && !is1);
        o.el.classList.toggle('hoverboth', is1 && is2);
      }
    },

    updateScores() {
      const g = global.Game;
      if (!g) return;
      const s1 = this.get('sb-score-1');
      const s2 = this.get('sb-score-2');
      if (s1) s1.textContent = String(g.scores[1]);
      if (s2) s2.textContent = String(g.scores[2]);
      const w1 = this.get('sb-win-1');
      const w2 = this.get('sb-win-2');
      if (w1) w1.textContent = g.wins[1] + ' menang';
      if (w2) w2.textContent = g.wins[2] + ' menang';
    },

    updateRound(now, total) {
      const a = this.get('rd-now');
      const b = this.get('rd-total');
      if (a) a.textContent = String(now);
      if (b) b.textContent = String(total);
    },

    updateTimer(frac) {
      const f = this.get('timer-fill');
      if (!f) return;
      const v = Math.max(0, Math.min(1, frac));
      f.style.width = v * 100 + '%';
      f.classList.toggle('warn', v <= 0.34 && v > 0.16);
      f.classList.toggle('danger', v <= 0.16);
    },

    renderCursor(p, st) {
      const c = this.get('cur-' + p);
      if (!c) return;
      const half = this.cursorSize / 2;
      if (st.visible) {
        c.style.transform = 'translate3d(' + (st.x - half) + 'px,' + (st.y - half) + 'px,0)';
      }
      c.classList.toggle('visible', !!st.visible);
      c.classList.toggle('dim', !!st.dim);
      c.classList.toggle('locked', !!st.locked);
      const fg = c.querySelector('.c-fg');
      if (fg) fg.style.strokeDashoffset = String(RING_LEN * (1 - (st.progress || 0)));
    },

    hideCursors() {
      const c1 = this.get('cur-1');
      const c2 = this.get('cur-2');
      if (c1) c1.classList.remove('visible', 'dim');
      if (c2) c2.classList.remove('visible', 'dim');
    },

    showCount(text) {
      const ov = this.get('ov-count');
      const num = this.get('count-num');
      if (num) {
        num.textContent = text;
        num.style.animation = 'none';
        void num.offsetWidth;
        num.style.animation = '';
      }
      this.toggle(ov, true);
    },

    hideCount() {
      this.toggle(this.get('ov-count'), false);
    },

    showFlash(title, sub, cls) {
      const ov = this.get('ov-flash');
      const card = this.get('flash-card');
      const t = this.get('flash-title');
      const s = this.get('flash-sub');
      if (t) t.textContent = title;
      if (s) s.textContent = sub;
      if (card) {
        card.className = 'flash-card' + (cls ? ' ' + cls : '');
        card.style.animation = 'none';
        void card.offsetWidth;
        card.style.animation = '';
      }
      this.toggle(ov, true);
    },

    hideFlash() {
      this.toggle(this.get('ov-flash'), false);
    },

    fxFloat(x, y, text, bad) {
      const fx = this.get('fx');
      if (!fx) return;
      const span = document.createElement('span');
      span.className = 'fx-float' + (bad ? ' bad' : '');
      span.textContent = text;
      span.style.left = x + 'px';
      span.style.top = y + 'px';
      fx.appendChild(span);
      setTimeout(() => span.remove(), 1200);
    },

    showFinal(result) {
      const set = (id, v) => {
        const e = this.get(id);
        if (e) e.textContent = v;
      };
      set('fs-score-1', String(result.s1));
      set('fs-score-2', String(result.s2));
      set('fs-win-1', result.wins[1] + ' ronde menang');
      set('fs-win-2', result.wins[2] + ' ronde menang');
      const f1 = document.querySelector('.final-scores .fs.s1');
      const f2 = document.querySelector('.final-scores .fs.s2');
      const title = this.get('final-title');
      const trophy = this.get('trophy');
      document.querySelectorAll('.final-scores .fs').forEach((e, i) => e.classList.remove('win'));
      const game = global.Game;
      const solo = !!(game && game.mode === '1p');
      if (solo) {
        const good = result.wins[1] * 2 >= (game.totalRounds || 1);
        if (title) title.textContent = good ? 'HEBAT!' : 'SELESAI!';
        if (trophy) trophy.textContent = '🏆';
        if (f1 && result.wins[1] > 0) f1.classList.add('win');
      } else if (result.winner === 1) {
        if (title) title.textContent = this.names[1] + ' Menang!';
        if (trophy) trophy.textContent = '🏆';
        if (f1) f1.classList.add('win');
      } else if (result.winner === 2) {
        if (title) title.textContent = this.names[2] + ' Menang!';
        if (trophy) trophy.textContent = '🏆';
        if (f2) f2.classList.add('win');
      } else {
        if (title) title.textContent = 'Seri!';
        if (trophy) trophy.textContent = '🤝';
      }
      this.show('screen-final');
    },

    setPause(show) {
      this.toggle(this.get('ov-pause'), show);
    },

    setSoundLabel(on) {
      const a = this.get('btn-sound');
      const b = this.get('btn-mute2');
      if (a) a.textContent = 'Suara: ' + (on ? 'ON' : 'OFF');
      if (b) b.textContent = 'Suara: ' + (on ? 'ON' : 'OFF');
    },

    setFullscreenLabel(on) {
      const t = 'Layar Penuh: ' + (on ? 'ON' : 'OFF');
      const a = this.get('btn-full');
      const b = this.get('btn-full2');
      if (a) {
        a.textContent = t;
        a.classList.toggle('on', !!on);
      }
      if (b) {
        b.textContent = t;
        b.classList.toggle('on', !!on);
      }
    },
  };

  global.UI = UI;
})(window);
