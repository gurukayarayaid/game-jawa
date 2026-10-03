(function (global) {
  'use strict';

  const MP_VERSION = '0.10.20';
  const MP_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + MP_VERSION;
  const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [17, 18], [18, 19], [19, 20],
    [0, 17],
  ];

  const COLOR_PLAYER = { 1: '#3d7bff', 2: '#ff8a2b', none: '#9aa7ff' };

  const Gestures = {
    video: null,
    canvas: null,
    stream: null,
    landmarker: null,
    modelReady: false,
    state: 'idle',
    message: '',
    onStatus: null,
    onDevices: null,
    onNotice: null,
    tracking: AJ.createTrackingState(),
    tracks: [],
    players: null,
    dets: [],
    deviceId: '',
    lastFrameAt: 0,
    lastVideoTime: -1,
    ts: 0,
    nextDetect: 0,
    loadPromise: null,
    camPromise: null,
    frozenSince: 0,
    worker: null,
    workerReady: false,
    workerTried: false,
    workerFallbackDone: false,
    workerCapturing: false,
    workerBusy: false,
    busySince: 0,
    pendingBmp: null,
    pendingTs: 0,
    pendingT0: 0,
    workerInitTimer: null,
    _statAt: 0,
    _resCount: 0,
    _latMs: 0,
    _capMs: 0,
    _sendT0: 0,
    _postT0: 0,
    quality: null,
    detQuality: 0,
    qualityMode: 'auto',
    captureFails: 0,
    canvasDirty: true,
    canvasNoRO: false,
    cw: 0,
    ch: 0,
    cdpr: 0,

    setStatus(state, message) {
      this.state = state;
      this.message = message || '';
      if (this.onStatus) this.onStatus(state, this.message);
    },

    async init(video, canvas) {
      this.video = video;
      this.canvas = canvas;
      this.setStatus('loading', 'memuat model gesture…');
      this.observeCanvas();
      this.initWorker();
      if (!global.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        this.setStatus('insecure', 'butuh https atau localhost');
        return;
      }
      try {
        await this.startCamera(this.deviceId);
        if (this.modelReady) this.setStatus('ready', 'gesture siap');
        else this.setStatus('loading', 'kamera aktif, memuat model…');
      } catch (err) {
        const name = err && err.name;
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          this.setStatus('no-permission', 'izin kamera ditolak');
        } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
          this.setStatus('no-camera', 'kamera tidak ditemukan');
        } else if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
          this.setStatus('cam-busy', 'kamera sedang dipakai');
        } else {
          this.setStatus('error', String(err && err.message ? err.message : err));
        }
      }
    },

    async loadModel() {
      if (this.landmarker) return;
      if (!this.loadPromise) {
        this.loadPromise = (async () => {
          const mod = await import(/* webpackIgnore: true */ MP_BASE + '/vision_bundle.mjs');
          const fileset = await mod.FilesetResolver.forVisionTasks(MP_BASE + '/wasm');
          const options = {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.35,
            minHandPresenceConfidence: 0.3,
            minTrackingConfidence: 0.3,
          };
          try {
            this.landmarker = await mod.HandLandmarker.createFromOptions(fileset, options);
          } catch (e) {
            options.baseOptions.delegate = 'CPU';
            this.landmarker = await mod.HandLandmarker.createFromOptions(fileset, options);
          }
          this.modelReady = true;
          if (this.state === 'loading' && this.video && this.video.srcObject) this.setStatus('ready', 'gesture siap');
        })().catch((err) => {
          this.modelReady = false;
          if (this.state === 'loading' || this.state === 'ready') {
            this.setStatus('offline', 'model gagal dimuat (butuh internet) – pakai sentuh layar');
          }
          throw err;
        });
      }
      return this.loadPromise;
    },

    /* ==== Deteksi di Web Worker (utama) ==== */
    initWorker() {
      if (this.workerTried) return;
      this.workerTried = true;
      const useMain = () => {
        this.loadModel().catch(() => {});
      };
      if (typeof Worker === 'undefined' || typeof createImageBitmap !== 'function') {
        useMain();
        return;
      }
      let w;
      try {
        w = new Worker('js/hand-worker.js?v=4');
      } catch (e) {
        useMain();
        return;
      }
      this.worker = w;
      if (global.AJ && global.AJ.createAdaptiveQuality) {
        this.quality = global.AJ.createAdaptiveQuality();
        this.detQuality = this.quality.width;
      }
      w.onmessage = (e) => this.onWorkerMessage(e.data || {});
      w.onerror = (ev) => this.fallbackToMainThread('worker error: ' + (ev && ev.message ? ev.message : 'script gagal'));
      w.onmessageerror = () => this.fallbackToMainThread('pesan worker rusak');
      try {
        w.postMessage({ type: 'init', mpBase: MP_BASE, modelUrl: MODEL_URL });
      } catch (e) {
        this.fallbackToMainThread('init worker gagal');
        return;
      }
      this.workerInitTimer = setTimeout(() => {
        if (!this.workerReady) this.fallbackToMainThread('worker timeout');
      }, 30000);
    },

    onWorkerMessage(m) {
      if (this.workerFallbackDone) return;
      if (m.type === 'ready') {
        this.workerReady = true;
        this.modelReady = true;
        this.workerCapturing = false;
        this.workerBusy = false;
        this.busySince = 0;
        if (this.workerInitTimer) {
          clearTimeout(this.workerInitTimer);
          this.workerInitTimer = null;
        }
        if (this.video && this.video.srcObject) this.setStatus('ready', 'gesture siap');
      } else if (m.type === 'error') {
        this.fallbackToMainThread(m.message || 'worker error');
      } else if (m.type === 'result') {
        this.dets = Array.isArray(m.hands) ? m.hands : [];
        this.workerBusy = false;
        this.busySince = 0;
        this.lastFrameAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
        this._resCount = (this._resCount || 0) + 1;
        if (this._sendT0 && typeof performance !== 'undefined') {
          const lat = performance.now() - this._sendT0;
          this._latMs = this._latMs ? this._latMs * 0.75 + lat * 0.25 : lat;
        }
        // Kualitas adaptif: round-trip post->result mencerminkan beban mesin.
        // Saat pengguna mengunci mode tinggi/hemat, adaptasi dilewati.
        if (this.qualityMode === 'auto' && this.quality && this._postT0 && typeof performance !== 'undefined') {
          const nowP = performance.now();
          this.quality.sample(nowP, nowP - this._postT0);
          this.detQuality = this.quality.width;
        }
        // Frame berikutnya sudah menunggu -> langsung kirim tanpa menunggu rAF.
        if (this.pendingBmp) {
          const bmp = this.pendingBmp;
          const ts = this.pendingTs;
          const t0 = this.pendingT0;
          this.pendingBmp = null;
          this.pendingTs = 0;
          this.pendingT0 = 0;
          if (!this.workerFallbackDone && this.workerReady && this.worker) this.sendToWorker(bmp, ts, t0);
          else try { bmp.close(); } catch (e) {}
        }
      }
    },

    fallbackToMainThread(reason) {
      if (this.workerFallbackDone) return;
      this.workerFallbackDone = true;
      if (this.workerInitTimer) {
        clearTimeout(this.workerInitTimer);
        this.workerInitTimer = null;
      }
      this.workerReady = false;
      this.modelReady = false;
      this.workerCapturing = false;
      this.workerBusy = false;
      this.busySince = 0;
      if (this.pendingBmp) {
        try { this.pendingBmp.close(); } catch (e) {}
        this.pendingBmp = null;
        this.pendingTs = 0;
      }
      this.lastVideoTime = -1;
      this.nextDetect = 0;
      const w = this.worker;
      this.worker = null;
      try {
        if (w) w.terminate();
      } catch (e) {}
      console.warn('[gestures] deteksi pindah ke main thread:', reason);
      this.loadModel().catch(() => {});
    },

    pumpWorker(nowMs) {
      // Watchdog: inference worker tidak merespons -> pindah main thread.
      if (this.workerBusy && this.busySince && nowMs - this.busySince > 6000) {
        this.fallbackToMainThread('worker macet');
        return;
      }
      // Satu frame sedang di-capture, atau satu frame sudah siap menunggu
      // giliran worker (pipeline: capture & inferensi berjalan paralel).
      if (this.workerCapturing || this.pendingBmp) return;
      if (!this.video || this.video.currentTime === this.lastVideoTime) return;
      if (!this.video.videoWidth) return; // frame kamera belum siap
      this.lastVideoTime = this.video.currentTime;
      const ts = Math.max(this.ts + 1, Math.round(nowMs));
      this.ts = ts;
      this.workerCapturing = true;
      const capT0 = typeof performance !== 'undefined' ? performance.now() : nowMs;
      // Capture TANPA opsi resize: di Chromium resize memaksa jalur CPU di
      // main thread (menyebabkan frame patah). Downscale dilakukan di worker.
      createImageBitmap(this.video)
        .then((bmp) => {
          this.workerCapturing = false;
          if (this.workerFallbackDone || !this.workerReady || !this.worker) {
            try { bmp.close(); } catch (e) {}
            return;
          }
          this.captureFails = 0;
          if (typeof performance !== 'undefined') {
            const cap = performance.now() - capT0;
            this._capMs = this._capMs ? this._capMs * 0.75 + cap * 0.25 : cap;
          }
          if (this.workerBusy) {
            // Worker masih sibuk -> simpan, kirim segera saat hasil tiba.
            this.pendingBmp = bmp;
            this.pendingTs = ts;
            this.pendingT0 = capT0;
          } else {
            this.sendToWorker(bmp, ts, capT0);
          }
        })
        .catch((err) => {
          this.workerCapturing = false;
          // Saat kamera baru mulai, capture kadang gagal sesaat -> coba dulu
          // beberapa kali sebelum pindah ke main thread.
          this.captureFails = (this.captureFails || 0) + 1;
          if (this.captureFails > 5) {
            this.fallbackToMainThread('capture frame gagal: ' + String((err && err.message) || err));
          }
        });
    },

    sendToWorker(bmp, ts, t0) {
      if (this.workerFallbackDone || !this.workerReady || !this.worker) {
        try { bmp.close(); } catch (e) {}
        return;
      }
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      this._sendT0 = t0 || now;
      this._postT0 = now;
      this.workerBusy = true;
      this.busySince = now;
      const maxW = this.currentMaxW();
      try {
        this.worker.postMessage({ type: 'detect', bitmap: bmp, ts: ts, maxW: maxW }, [bmp]);
      } catch (e) {
        try { bmp.close(); } catch (e2) {}
        this.workerBusy = false;
        this.busySince = 0;
        this.fallbackToMainThread('kirim frame gagal');
      }
    },

    /* ==== Fallback: inferensi di main thread, throttle adaptif ==== */
    detectSync(nowMs) {
      if (!this.video || this.video.currentTime === this.lastVideoTime || nowMs < this.nextDetect) return;
      this.lastVideoTime = this.video.currentTime;
      this.lastFrameAt = nowMs;
      this.ts = Math.max(this.ts + 1, Math.round(nowMs));
      const clock = typeof performance !== 'undefined' ? () => performance.now() : () => nowMs;
      const t0 = clock();
      try {
        const res = this.landmarker.detectForVideo(this.video, this.ts);
        const lms = res.landmarks || [];
        this.dets = lms.map((lm, i) => ({
          lm,
          world: res.worldLandmarks ? res.worldLandmarks[i] : null,
          handedness: res.handedness && res.handedness[i] && res.handedness[i][0] ? res.handedness[i][0].categoryName : '',
        }));
      } catch (e) {
        this.dets = [];
      }
      const cost = clock() - t0;
      this._resCount = (this._resCount || 0) + 1;
      this._latMs = this._latMs ? this._latMs * 0.75 + cost * 0.25 : cost;
      // Sisakan minimal satu frame mulus di antara dua inferensi supaya
      // animasi opsi jawaban tidak patah-patah di mesin yang lambat.
      this.nextDetect = nowMs + Math.min(70, Math.max(30, Math.round(cost) + 16));
    },

    /* ==== Statistik untuk HUD (fps dihitung pemanggil) ==== */
    getStats() {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (!this._statAt) this._statAt = now;
      const elapsed = (now - this._statAt) / 1000;
      const count = this._resCount || 0;
      this._statAt = now;
      this._resCount = 0;
      return {
        path: this.workerReady ? 'worker' : (this.modelReady && this.landmarker ? 'main thread' : 'belum siap'),
        hz: elapsed > 0.05 ? Math.round((count / elapsed) * 10) / 10 : 0,
        latMs: Math.round(this._latMs || 0),
        capMs: Math.round(this._capMs || 0),
        quality: this.workerReady ? this.currentMaxW() : 0,
        qualityMode: this.qualityMode,
      };
    },

    // 'auto' = ikuti controller adaptif; 'tinggi'/'hemat' = kunci lebar input.
    setQualityMode(mode) {
      this.qualityMode = mode === 'tinggi' || mode === 'hemat' ? mode : 'auto';
      if (this.qualityMode === 'tinggi') this.detQuality = 640;
      else if (this.qualityMode === 'hemat') this.detQuality = 320;
      else if (this.quality) {
        this.quality.reset();
        this.detQuality = this.quality.width;
      } else {
        this.detQuality = 640;
      }
    },

    currentMaxW() {
      if (this.qualityMode === 'tinggi') return 640;
      if (this.qualityMode === 'hemat') return 320;
      return this.detQuality || (this.quality ? this.quality.width : 640);
    },

    /* ==== Kanvas overlay: ukuran di-cache, bukan dibaca tiap frame ==== */
    observeCanvas() {
      const canvas = this.canvas;
      if (!canvas) return;
      this.canvasDirty = true;
      if (typeof ResizeObserver !== 'undefined') {
        try {
          this.ro = new ResizeObserver(() => {
            this.canvasDirty = true;
          });
          this.ro.observe(canvas);
          return;
        } catch (e) {}
      }
      this.canvasNoRO = true;
    },

    measureCanvas() {
      const canvas = this.canvas;
      if (!canvas) return;
      this.canvasDirty = false;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      if (!w || !h) return;
      this.cw = w;
      this.ch = h;
      this.cdpr = dpr;
      const pw = Math.round(w * dpr);
      const ph = Math.round(h * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
    },

    async listDevices() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
      const list = await navigator.mediaDevices.enumerateDevices();
      return list.filter((d) => d.kind === 'videoinput');
    },

    // Tangga batasan: dari paling ketat (resolusi penuh) ke paling longgar
    // (perangkat & resolusi apa saja), supaya kamera tetap terbuka walau
    // resolusi tidak didukung atau kamera pilihan sedang sibuk.
    cameraLadder(deviceId) {
      const exact = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' };
      const ideal = deviceId ? { deviceId: { ideal: deviceId } } : { facingMode: { ideal: 'user' } };
      return [
        Object.assign({}, exact, { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }),
        Object.assign({}, exact, { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }),
        ideal,
        {},
      ];
    },

    async attachStream(stream, deviceId) {
      if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
      const track = stream.getVideoTracks()[0];
      const st = track && track.getSettings ? track.getSettings() : null;
      this.stream = stream;
      this.deviceId = (st && st.deviceId) || deviceId || '';
      this.video.srcObject = stream;
      this.video.muted = true;
      try {
        await this.video.play();
      } catch (e) {}
      this.frozenSince = 0;
      this.lastVideoTime = -1;
      this.dets = [];
      try {
        const devices = await this.listDevices();
        if (this.onDevices) this.onDevices(devices, track);
      } catch (e) {}
      return stream;
    },

    async openCamera(deviceId) {
      const ladder = this.cameraLadder(deviceId);
      let lastErr = null;
      for (let i = 0; i < ladder.length; i++) {
        for (let attempt = 0; attempt < 2; attempt++) {
          let stream;
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: ladder[i] });
          } catch (err) {
            lastErr = err;
            const name = err && err.name;
            // Izin ditolak tidak bisa sembuh sendiri -> berhenti mencoba.
            if (name === 'NotAllowedError' || name === 'SecurityError') throw err;
            const transient = name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError';
            // Error sesaat (kamera sedang dipakai): coba sekali lagi setelah jeda.
            if (transient && attempt === 0) {
              await wait(400 + i * 250);
              continue;
            }
            break;
          }
          if (i > 0 && this.onNotice) this.onNotice('Kamera dibuka dengan pengaturan lebih ringan agar tetap jalan.');
          return this.attachStream(stream, deviceId);
        }
      }
      throw lastErr || new Error('kamera gagal dibuka');
    },

    async startCamera(deviceId) {
      if (this.camPromise) {
        await this.camPromise;
      }
      const p = this.openCamera(deviceId);
      this.camPromise = p;
      try {
        await p;
      } finally {
        if (this.camPromise === p) this.camPromise = null;
      }
    },

    stopCamera() {
      if (this.stream) {
        this.stream.getTracks().forEach((t) => t.stop());
        this.stream = null;
      }
      if (this.video) this.video.srcObject = null;
      this.dets = [];
      this.tracks = [];
      this.players = null;
    },

    tick(nowMs, opts) {
      const streaming = this.video && this.video.srcObject && this.video.readyState >= 2;
      const usable = streaming && (this.workerReady || (this.modelReady && this.landmarker));
      if (!usable) {
        if (this.state === 'ready' && nowMs - this.lastFrameAt > 1500 && !this.video.srcObject) this.setStatus('no-camera', 'kamera terputus');
        return null;
      }

      if (this.workerReady) this.pumpWorker(nowMs);
      else this.detectSync(nowMs);

      if (nowMs - this.lastFrameAt > 450 && this.dets.length) this.dets = [];

      const out = AJ.processDetections(this.tracking, this.dets, {
        W: opts.W,
        H: opts.H,
        cal: opts.cal,
        gain: opts.gain,
        mirror: opts.mirror,
        dtMs: opts.dtMs,
        nowMs,
        solo: !!opts.solo,
        pointingFrames: opts.pointingFrames || 2,
        prevPlayers: this.players,
      });
      this.players = out.players;
      this.tracks = out.tracks;
      return this.players;
    },

    getHandHints() {
      const res = {
        1: { kind: 'wait', text: 'menunggu tangan…' },
        2: { kind: 'wait', text: 'menunggu tangan…' },
      };
      for (const tr of this.tracks || []) {
        if (!tr.player || tr.lost >= 0.7) continue;
        let kind = 'idle';
        let text = 'angkat telunjuk';
        if (tr.lost > 0.15) {
          kind = 'wait';
          text = 'tangan terdeteksi…';
        } else if (tr.aiming || tr.pointing) {
          kind = 'point';
          text = 'menunjuk – siap!';
        } else if (tr.analysis && tr.analysis.openPalm) {
          kind = 'palm';
          text = 'telapak terbuka';
        } else if (tr.analysis && tr.analysis.fist) {
          kind = 'fist';
          text = 'kepalkan / tunjuk';
        }
        res[tr.player] = { kind, text };
      }
      return res;
    },

    drawOverlay() {
      const canvas = this.canvas;
      const video = this.video;
      if (!canvas || !video) return;
      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      if (this.canvasDirty || this.canvasNoRO || dpr !== this.cdpr) this.measureCanvas();
      const w = this.cw;
      const h = this.ch;
      if (!w || !h) return;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(this.cdpr, 0, 0, this.cdpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const tracks = this.tracks || [];
      if (!tracks.length || !video.videoWidth) return;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const asp = vw / vh;
      let dw;
      let dh;
      if (asp > w / h) {
        dh = h;
        dw = h * asp;
      } else {
        dw = w;
        dh = w / asp;
      }
      const ox = (w - dw) / 2;
      const oy = (h - dh) / 2;

      for (const tr of tracks) {
        if (!tr.lm || tr.lost >= 0.7) continue;
        const color = tr.player ? COLOR_PLAYER[tr.player] : COLOR_PLAYER.none;
        const px = (p) => ox + p.x * dw;
        const py = (p) => oy + p.y * dh;
        ctx.lineWidth = 3;
        ctx.strokeStyle = color;
        ctx.globalAlpha = tr.lost > 0.15 ? 0.4 : 0.95;
        ctx.beginPath();
        for (const [a, b] of HAND_CONNECTIONS) {
          const pa = tr.lm[a];
          const pb = tr.lm[b];
          if (!pa || !pb) continue;
          ctx.moveTo(px(pa), py(pa));
          ctx.lineTo(px(pb), py(pb));
        }
        ctx.stroke();
        ctx.fillStyle = tr.pointing ? '#22c55e' : color;
        for (let i = 0; i < tr.lm.length; i++) {
          const p = tr.lm[i];
          const r = i === 8 ? 7 : 3.5;
          ctx.beginPath();
          ctx.arc(px(p), py(p), r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    },
  };

  global.Gestures = Gestures;
})(window);
