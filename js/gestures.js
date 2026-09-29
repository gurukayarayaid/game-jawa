(function (global) {
  'use strict';

  const MP_VERSION = '0.10.20';
  const MP_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + MP_VERSION;
  const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

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

    setStatus(state, message) {
      this.state = state;
      this.message = message || '';
      if (this.onStatus) this.onStatus(state, this.message);
    },

    async init(video, canvas) {
      this.video = video;
      this.canvas = canvas;
      this.setStatus('loading', 'memuat model gesture…');
      this.loadModel().catch(() => {});
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

    async listDevices() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
      const list = await navigator.mediaDevices.enumerateDevices();
      return list.filter((d) => d.kind === 'videoinput');
    },

    async startCamera(deviceId) {
      if (this.camPromise) {
        await this.camPromise;
      }
      const videoConstraint = deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
        : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
      const p = navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraint }).then(async (stream) => {
        if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
        this.stream = stream;
        this.deviceId = deviceId || '';
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
          if (this.onDevices) this.onDevices(devices, stream.getVideoTracks()[0]);
        } catch (e) {}
        return stream;
      });
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
      const ready = this.modelReady && this.landmarker && this.video && this.video.srcObject && this.video.readyState >= 2;
      if (!ready) {
        if (this.state === 'ready' && nowMs - this.lastFrameAt > 1500 && !this.video.srcObject) this.setStatus('no-camera', 'kamera terputus');
        return null;
      }

      if (this.video.currentTime !== this.lastVideoTime && nowMs >= this.nextDetect) {
        this.lastVideoTime = this.video.currentTime;
        this.lastFrameAt = nowMs;
        this.nextDetect = nowMs + 30;
        try {
          this.ts = Math.max(this.ts + 1, Math.round(nowMs));
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
      }

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
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
