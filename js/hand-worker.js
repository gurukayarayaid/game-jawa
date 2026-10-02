'use strict';

/* Gesture Battle Aksara Jawa - deteksi tangan di Web Worker.
   Model & inference dijalankan di thread terpisah supaya main thread
   bebas untuk animasi opsi jawaban + kursor (layar besar tetap mulus).
   Main thread mengirim {type:'init'} lalu {type:'detect', bitmap, ts}. */

let landmarker = null;
let ready = false;

function post(msg) {
  try {
    self.postMessage(msg);
  } catch (e) {}
}

self.onmessage = function (e) {
  const msg = e.data || {};
  if (msg.type === 'init') {
    initModel(msg).catch((err) => {
      ready = false;
      post({ type: 'error', message: String((err && err.message) || err) });
    });
    return;
  }
  if (msg.type === 'detect') {
    detect(msg).catch(function () {
      post({ type: 'result', ts: msg.ts, hands: [] });
    });
  }
};

async function initModel(msg) {
  const mpBase = msg.mpBase;
  const modelUrl = msg.modelUrl;
  const mod = await import(/* webpackIgnore: true */ mpBase + '/vision_bundle.mjs');
  const fileset = await mod.FilesetResolver.forVisionTasks(mpBase + '/wasm');
  const options = {
    baseOptions: { modelAssetPath: modelUrl, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.35,
    minHandPresenceConfidence: 0.3,
    minTrackingConfidence: 0.3,
  };
  try {
    landmarker = await mod.HandLandmarker.createFromOptions(fileset, options);
  } catch (e) {
    options.baseOptions.delegate = 'CPU';
    landmarker = await mod.HandLandmarker.createFromOptions(fileset, options);
  }
  ready = true;
  post({ type: 'ready' });
}

const MAX_W = 640;
const MIN_W = 240;

async function detect(msg) {
  const bitmap = msg.bitmap;
  if (!bitmap) return;
  if (!ready || !landmarker) {
    try { bitmap.close(); } catch (e) {}
    post({ type: 'result', ts: msg.ts, hands: [] });
    return;
  }

  // Downscale di sini (bukan di main thread): biar murah & tidak bikin
  // animasi opsi patah. Lebar target ditentukan kualitas adaptif dari main
  // thread (mesin lambat -> lebih kecil). Gagal resize? pakai apa adanya.
  const target = Math.max(MIN_W, Math.min(MAX_W, Math.round(Number(msg.maxW) || MAX_W)));
  let input = bitmap;
  if (bitmap.width > target) {
    try {
      const small = await createImageBitmap(bitmap, {
        resizeWidth: target,
        resizeHeight: Math.max(2, Math.round((bitmap.height * target) / bitmap.width)),
        resizeQuality: 'low',
      });
      try { bitmap.close(); } catch (e) {}
      input = small;
    } catch (e) {
      input = bitmap;
    }
  }

  let hands = [];
  try {
    const res = landmarker.detectForVideo(input, msg.ts);
    const lms = res.landmarks || [];
    hands = lms.map(function (lm, i) {
      return {
        lm: lm,
        world: res.worldLandmarks ? res.worldLandmarks[i] : null,
        handedness:
          res.handedness && res.handedness[i] && res.handedness[i][0]
            ? res.handedness[i][0].categoryName
            : '',
      };
    });
  } catch (e) {
    hands = [];
  } finally {
    try { input.close(); } catch (e) {}
  }
  post({ type: 'result', ts: msg.ts, hands: hands });
}
