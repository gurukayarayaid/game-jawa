(function () {
  'use strict';

  const SETTINGS_KEY = 'aj-gesture-battle-v1';
  const DEFAULT_SETTINGS = {
    p1: 'Pemain 1',
    p2: 'Pemain 2',
    mode: '2p',
    level: 'sedang',
    rounds: 10,
    quality: 'auto',
    dwellMs: 700,
    gain: 1,
    mirror: true,
    sound: true,
    camId: '',
    cal: { 1: null, 2: null },
    hud: false,
  };

  let settings = loadSettings();
  let mode = 'menu';
  let lastT = performance.now();
  let hudFrames = 0;
  let hudAt = performance.now();

  function loadSettings() {
    const s = Object.assign({}, DEFAULT_SETTINGS);
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) Object.assign(s, JSON.parse(raw));
    } catch (e) {}
    if (!s.cal) s.cal = { 1: null, 2: null };
    return s;
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {}
  }

  function idlePlayers() {
    return {
      1: { seen: false, pointing: false, x: innerWidth / 2, y: innerHeight / 2 },
      2: { seen: false, pointing: false, x: innerWidth / 2, y: innerHeight / 2 },
    };
  }

  function mergedPlayers(now, cam) {
    const m = cam ? { 1: Object.assign({}, cam[1]), 2: Object.assign({}, cam[2]) } : idlePlayers();
    for (const p of [1, 2]) {
      const o = Pointer.override(p, now);
      if (o) {
        m[p].seen = true;
        m[p].pointing = o.pointing;
        m[p].x = o.x;
        m[p].y = o.y;
        m[p].fromPointer = true;
      }
    }
    return m;
  }

  const Wizard = {
    active: false,
    step: 0,
    dwell: null,
    captures: { 1: {}, 2: {} },
    steps: [],
    corners: {
      tl: { fx: 0.13, fy: 0.2, label: 'KIRI ATAS' },
      br: { fx: 0.87, fy: 0.82, label: 'KANAN BAWAH' },
    },

    start() {
      if (!Gestures.stream) {
        UI.showToast('Kamera belum aktif – kalibrasi butuh gesture tangan');
        return;
      }
      this.active = true;
      this.step = 0;
      this.captures = { 1: {}, 2: {} };
      this.steps = settings.mode === '1p'
        ? [
            { p: 1, c: 'tl' },
            { p: 1, c: 'br' },
          ]
        : [
            { p: 1, c: 'tl' },
            { p: 1, c: 'br' },
            { p: 2, c: 'tl' },
            { p: 2, c: 'br' },
          ];
      this.dwell = AJ.createDwellState(650);
      UI.toggle(UI.get('ov-cal'), true);
      this.placeTarget();
      this.setText(null);
      Sfx.ensure();
    },

    placeTarget() {
      const st = this.steps[this.step];
      const c = this.corners[st.c];
      const el = UI.get('cal-target');
      if (!el) return;
      el.style.left = c.fx * 100 + '%';
      el.style.top = c.fy * 100 + '%';
      const fill = UI.get('cal-progress-fill');
      if (fill) fill.style.width = '0%';
    },

    update(dt, players, now) {
      const st = this.steps[this.step];
      if (!st) return;
      const p = players[st.p];
      const c = this.corners[st.c];
      const tx = c.fx * innerWidth;
      const ty = c.fy * innerHeight;
      const pointing = !!(p && p.seen && (p.aiming || p.pointing));
      const dist = p && p.seen ? Math.hypot(p.x - tx, p.y - ty) : 1e9;
      const near = dist < Math.max(110, innerHeight * 0.1);

      const res = AJ.updateDwell(this.dwell, pointing && near, pointing && near ? 'tgt' : null, dt);
      UI.renderCursor(st.p, {
        x: p ? p.x : 0,
        y: p ? p.y : 0,
        visible: !!(p && p.seen),
        dim: !pointing,
        locked: false,
        progress: pointing ? res.progress : 0,
      });
      const fill = UI.get('cal-progress-fill');
      if (fill) fill.style.width = (res.progress * 100).toFixed(0) + '%';

      if (res.fired) {
        this.capture(st, p);
      } else {
        this.setText(p, pointing, near);
      }
      void now;
    },

    capture(st, p) {
      if (!p || !p.raw) return;
      this.captures[st.p][st.c] = { x: p.raw.x, y: p.raw.y };
      Sfx.tick();
      this.step += 1;
      this.dwell = AJ.createDwellState(650);
      if (this.step >= this.steps.length) {
        this.finish();
      } else {
        this.placeTarget();
        this.setText(null);
      }
    },

    setText(p, pointing, near) {
      const st = this.steps[this.step];
      if (!st) return;
      const title = UI.get('cal-title');
      const text = UI.get('cal-text');
      const name = UI.names[st.p];
      const c = this.corners[st.c];
      if (title) title.textContent = 'Kalibrasi – ' + name;
      if (!text) return;
      if (!p) text.textContent = 'Menunggu tangan ' + name + '…';
      else if (!pointing) text.textContent = name + ': tunjuk pakai JARI TELUNJUK';
      else if (!near) text.textContent = name + ': arahkan ke titik ' + c.label;
      else text.textContent = name + ': tahan sebentar…';
    },

    finish() {
      const cal = Object.assign({}, settings.cal);
      let ok = 0;
      for (const p of [1, 2]) {
        const cap = this.captures[p];
        if (cap.tl && cap.br) {
          const c = AJ.makeCalibration(cap.tl, cap.br, settings.mirror);
          if (Math.abs(c.x1 - c.x0) > 0.08 && Math.abs(c.y1 - c.y0) > 0.08) {
            cal[p] = c;
            ok++;
          }
        }
      }
      settings.cal = cal;
      saveSettings();
      this.close();
      UI.showToast(ok ? 'Kalibrasi tersimpan (' + ok + ' pemain)' : 'Kalibrasi tidak tersimpan – rentang gerak terlalu kecil');
    },

    skip() {
      this.close();
    },

    close() {
      this.active = false;
      UI.toggle(UI.get('ov-cal'), false);
      UI.hideCursors();
    },
  };

  function applyMode() {
    const solo = settings.mode === '1p';
    const app = UI.get('app');
    if (app) app.classList.toggle('mode-1p', solo);
    Pointer.solo = solo;
    const tag = document.querySelector('.tagline');
    if (tag) {
      tag.textContent = solo
        ? 'Satu murid, satu telunjuk, jawab sendiri!'
        : 'Dua murid, dua telunjuk, rebutan jawaban!';
    }
  }

  const QUALITY_HINT = {
    auto: 'Menyesuaikan otomatis: resolusi turun saat mesin lambat, naik saat lega.',
    tinggi: 'Selalu deteksi resolusi penuh (640px). Paling presisi, tapi berat di mesin atau browser lambat.',
    hemat: 'Selalu resolusi rendah (320px). Paling ringan dan hemat, cocok untuk perangkat yang tersendat.',
  };

  function updateQualityHint(mode) {
    const el = UI.get('quality-hint');
    if (!el) return;
    const t = QUALITY_HINT[mode] || QUALITY_HINT.auto;
    if (el.textContent !== t) el.textContent = t;
  }

  function syncControls() {
    const set = (id, v) => {
      const el = UI.get(id);
      if (el) el.value = v;
    };
    set('in-p1', settings.p1);
    set('in-p2', settings.p2);
    set('in-dwell', settings.dwellMs);
    set('in-gain', settings.gain);
    const ck = UI.get('ck-mirror');
    if (ck) ck.checked = !!settings.mirror;
    const lbl = UI.get('lbl-dwell');
    if (lbl) lbl.textContent = settings.dwellMs + ' ms';
    segSet('seg-mode', settings.mode);
    segSet('seg-level', settings.level);
    segSet('seg-rounds', String(settings.rounds));
    segSet('seg-quality', settings.quality);
    updateQualityHint(settings.quality);
    if (Gestures.setQualityMode) Gestures.setQualityMode(settings.quality);
    applyMode();
    UI.setNames(settings.p1, settings.p2);
    UI.setSoundLabel(settings.sound);
    UI.setFullscreenLabel(isFullscreen());
    UI.setHudVisible(!!settings.hud);
    Sfx.enabled = !!settings.sound;
  }

  function segSet(id, v) {
    const box = UI.get(id);
    if (!box) return;
    box.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  }

  function segWire(id, cb) {
    const box = UI.get(id);
    if (!box) return;
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      box.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      cb(b.dataset.v);
      Sfx.select();
      saveSettings();
    });
  }

  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function toggleFullscreen() {
    try {
      if (!isFullscreen()) {
        const el = document.documentElement;
        const req = el.requestFullscreen || el.webkitRequestFullscreen;
        if (!req) {
          UI.showToast('Mode layar penuh tidak didukung browser ini');
          return;
        }
        const p = req.call(el);
        if (p && typeof p.catch === 'function') {
          p.catch(() => UI.showToast('Layar penuh diblokir browser'));
        }
      } else {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) {
          const p = exit.call(document);
          if (p && typeof p.catch === 'function') p.catch(() => {});
        }
      }
    } catch (e) {
      UI.showToast('Layar penuh tidak tersedia');
    }
  }

  function toggleSound() {
    settings.sound = !settings.sound;
    Sfx.enabled = settings.sound;
    UI.setSoundLabel(settings.sound);
    saveSettings();
    if (settings.sound) Sfx.select();
  }

  function startGame() {
    Sfx.ensure();
    Pointer.reset();
    mode = 'game';
    Wizard.skip();
    Game.start(settings);
    saveSettings();
  }

  function backToMenu() {
    mode = 'menu';
    Game.toMenu();
    syncControls();
  }

  function wireEvents() {
    const on = (id, fn) => {
      const el = UI.get(id);
      if (el) el.addEventListener('click', fn);
    };

    const in1 = UI.get('in-p1');
    const in2 = UI.get('in-p2');
    if (in1) in1.addEventListener('input', () => { settings.p1 = in1.value || 'Pemain 1'; UI.setNames(settings.p1, settings.p2); saveSettings(); });
    if (in2) in2.addEventListener('input', () => { settings.p2 = in2.value || 'Pemain 2'; UI.setNames(settings.p1, settings.p2); saveSettings(); });

    segWire('seg-mode', (v) => { settings.mode = v === '1p' ? '1p' : '2p'; applyMode(); });
    segWire('seg-level', (v) => { settings.level = v; });
    segWire('seg-rounds', (v) => { settings.rounds = parseInt(v, 10) || 10; });
    segWire('seg-quality', (v) => {
      settings.quality = v === 'tinggi' || v === 'hemat' ? v : 'auto';
      updateQualityHint(settings.quality);
      if (Gestures.setQualityMode) Gestures.setQualityMode(settings.quality);
    });

    const dwell = UI.get('in-dwell');
    if (dwell) dwell.addEventListener('input', () => {
      settings.dwellMs = parseInt(dwell.value, 10) || 700;
      const lbl = UI.get('lbl-dwell');
      if (lbl) lbl.textContent = settings.dwellMs + ' ms';
      saveSettings();
    });

    const gain = UI.get('in-gain');
    if (gain) gain.addEventListener('input', () => {
      settings.gain = parseFloat(gain.value) || 1;
      saveSettings();
    });

    const mirror = UI.get('ck-mirror');
    if (mirror) mirror.addEventListener('change', () => {
      settings.mirror = mirror.checked;
      settings.cal = { 1: null, 2: null };
      saveSettings();
      UI.showToast('Cermin diubah – kalibrasi direset');
    });

    const sel = UI.get('sel-cam');
    if (sel) sel.addEventListener('change', async () => {
      settings.camId = sel.value;
      saveSettings();
      UI.setCamStatus('loading', 'berganti kamera…');
      try {
        await Gestures.startCamera(sel.value);
        UI.setCamStatus(Gestures.modelReady ? 'ready' : 'loading', Gestures.modelReady ? 'gesture siap' : 'memuat model…');
      } catch (e) {
        UI.setCamStatus('error', 'kamera gagal');
      }
    });

    on('btn-recal', () => Wizard.start());
    on('btn-cal-skip', () => Wizard.skip());
    on('btn-full', toggleFullscreen);
    on('btn-full2', toggleFullscreen);
    on('btn-sound', toggleSound);
    on('btn-mute2', toggleSound);
    on('btn-start', startGame);
    on('btn-pause', () => Game.pause());
    on('btn-resume', () => Game.resume());
    on('btn-to-menu', backToMenu);
    on('btn-again', () => startGame());
    on('btn-menu2', backToMenu);

    document.addEventListener('keydown', (e) => {
      if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
      if (e.key === 'Escape') {
        if (Wizard.active) Wizard.skip();
        else if (mode === 'game') {
          if (Game.paused) Game.resume();
          else Game.pause();
        }
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      } else if (e.key === 'm' || e.key === 'M') {
        toggleSound();
      } else if (e.key === 'h' || e.key === 'H') {
        settings.hud = !settings.hud;
        UI.setHudVisible(settings.hud);
        saveSettings();
        UI.showToast('HUD performa: ' + (settings.hud ? 'ON' : 'OFF'));
      }
    });

    window.addEventListener('resize', () => {
      UI.measureCursors();
      Game.refreshArena();
    });
    const onFsChange = () => {
      UI.setFullscreenLabel(isFullscreen());
      setTimeout(() => {
        UI.measureCursors();
        Game.refreshArena();
      }, 120);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
  }

  function frame(now) {
    const dt = Math.min(now - lastT, 60);
    lastT = now;

    hudFrames += 1;
    if (now - hudAt >= 500) {
      UI.updateHud((hudFrames * 1000) / (now - hudAt), Gestures.getStats());
      hudFrames = 0;
      hudAt = now;
    }

    const cam = Gestures.tick(now, {
      W: innerWidth,
      H: innerHeight,
      cal: settings.cal,
      gain: settings.gain,
      mirror: settings.mirror,
      solo: settings.mode === '1p',
      dtMs: dt,
    });
    const players = mergedPlayers(now, cam);

    Gestures.drawOverlay();

    if (Wizard.active) {
      Wizard.update(dt, players, now);
    } else if (mode === 'game') {
      Game.update(dt, players, now);
    } else {
      UI.hideCursors();
      UI.setHandHints(Gestures.getHandHints());
      if (cam) {
        const h = Gestures.getHandHints();
        const hint = h[1].kind === 'point' || h[2].kind === 'point' ? 'Bagus! gesture terdeteksi – tekan MULAI' : 'Arahkan telunjuk ke layar untuk menguji gesture';
        UI.setCamHint(hint);
      }
    }

    if (mode === 'game' && !Wizard.active && !Game.paused) {
      const taps = Pointer.consumeTaps();
      for (const t of taps) Game.handleTap(t.player, t.x, t.y);
    } else {
      Pointer.consumeTaps();
    }

    requestAnimationFrame(frame);
  }

  function boot() {
    UI.init();
    UI.buildBrand();
    if (/(?:^|[?&])hud=1(?:&|$)/.test(location.search)) settings.hud = true;
    syncControls();

    Pointer.init(document.getElementById('app'));

    Gestures.onStatus = (state, msg) => {
      UI.setCamStatus(state, msg);
      if (state === 'no-permission') {
        UI.setCamHint('Izin kamera ditolak – buka lewat http://localhost atau izinkan kamera');
        UI.showToast('Kamera diblokir. Main tetap bisa dengan sentuhan layar.', 5000);
      } else if (state === 'no-camera') {
        UI.setCamHint('Tidak ada kamera – gunakan sentuhan layar');
        UI.showToast('Kamera tidak ditemukan. Mode sentuh layar tetap bisa dipakai.', 5000);
      } else if (state === 'offline') {
        UI.setCamHint('Model gesture gagal dimuat – cek koneksi internet');
        UI.showToast('Gagal memuat model gesture (butuh internet saat pertama).', 5000);
      }
    };

    Gestures.onDevices = (devices, track) => {
      const sel = UI.get('sel-cam');
      if (!sel) return;
      const current = track && track.getSettings ? track.getSettings().deviceId : settings.camId;
      sel.innerHTML = '';
      if (!devices.length) {
        const o = document.createElement('option');
        o.value = '';
        o.textContent = 'kamera default';
        sel.appendChild(o);
        return;
      }
      devices.forEach((d, i) => {
        const o = document.createElement('option');
        o.value = d.deviceId;
        o.textContent = d.label || 'Kamera ' + (i + 1);
        if (d.deviceId === current) o.selected = true;
        sel.appendChild(o);
      });
    };

    wireEvents();
    Gestures.init(UI.get('cam'), UI.get('cam-overlay'));
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
