import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
const AJ = require(path.join(dir, '..', 'js', 'logic.js'));

let passed = 0;
let failed = 0;
const errors = [];

function ok(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    errors.push(msg);
    console.error('  FAIL:', msg);
  }
}

function eq(a, b, msg) {
  ok(a === b, `${msg} (expected ${JSON.stringify(b)}, got ${JSON.stringify(a)})`);
}

function close(a, b, tol, msg) {
  ok(Math.abs(a - b) <= tol, `${msg} (expected ~${b}, got ${a})`);
}

function makeHand(pose) {
  const lm = new Array(21).fill(null).map(() => ({ x: 0, y: 0, z: 0 }));
  lm[0] = { x: 0.5, y: 0.9, z: 0 };
  lm[1] = { x: 0.42, y: 0.82, z: 0 };
  lm[2] = { x: 0.36, y: 0.74, z: 0 };
  lm[3] = { x: 0.33, y: 0.66, z: 0 };
  lm[4] = { x: 0.31, y: 0.58, z: 0 };

  const defs = [
    { name: 'index', mcp: 5, pip: 6, dip: 7, tip: 8, x: 0.44 },
    { name: 'middle', mcp: 9, pip: 10, dip: 11, tip: 12, x: 0.5 },
    { name: 'ring', mcp: 13, pip: 14, dip: 15, tip: 16, x: 0.56 },
    { name: 'pinky', mcp: 17, pip: 18, dip: 19, tip: 20, x: 0.61 },
  ];

  for (const f of defs) {
    const ext = pose[f.name] === 'ext';
    lm[f.mcp] = { x: f.x, y: 0.72, z: 0 };
    if (ext) {
      lm[f.pip] = { x: f.x, y: 0.56, z: 0 };
      lm[f.dip] = { x: f.x, y: 0.44, z: 0 };
      lm[f.tip] = { x: f.x, y: 0.32, z: 0 };
    } else {
      lm[f.pip] = { x: f.x, y: 0.58, z: 0 };
      lm[f.dip] = { x: f.x, y: 0.66, z: 0 };
      lm[f.tip] = { x: f.x, y: 0.7, z: 0 };
    }
  }
  return lm;
}

function pose(a, b, c, d) {
  return makeHand({ index: a, middle: b, ring: c, pinky: d });
}

console.log('== analyzeHand ==');
{
  const p = AJ.analyzeHand(pose('ext', 'curl', 'curl', 'curl'));
  ok(p.valid, 'valid');
  ok(p.pointing, 'pointing gesture terdeteksi (telunjuk saja)');
  eq(p.indexExt, true, 'index ext');
  eq(p.middleExt, false, 'middle curled');
  ok(!p.fist && !p.openPalm, 'bukan fist/open');
  ok(p.aiming, 'pose telunjuk juga aiming');
}
{
  const fist = AJ.analyzeHand(pose('curl', 'curl', 'curl', 'curl'));
  ok(!fist.pointing, 'fist bukan pointing');
  eq(fist.fist, true, 'fist flag');
  ok(!fist.aiming, 'fist bukan aiming (kepalkan = batal)');
}
{
  const open = AJ.analyzeHand(pose('ext', 'ext', 'ext', 'ext'));
  ok(!open.pointing, 'open palm bukan pointing');
  eq(open.openPalm, true, 'openPalm flag');
  ok(!open.aiming, 'open palm bukan aiming (telapak = istirahat)');
}
{
  const v = AJ.analyzeHand(pose('ext', 'ext', 'curl', 'curl'));
  ok(!v.pointing, 'tanda V bukan pointing');
  ok(v.aiming, 'tanda V tetap bisa bidik (telunjuk terjulur)');
}
{
  const half = AJ.analyzeHand(pose('ext', 'curl', 'ext', 'ext'));
  ok(!half.pointing, 'hanya middle yang terlipat kurang dari 2 jari -> bukan pointing');
  ok(half.aiming, 'tetap aiming selama telunjuk terjulur dan bukan telapak terbuka');
}
{
  const loose = AJ.analyzeHand(pose('ext', 'curl', 'curl', 'ext'));
  ok(loose.pointing, 'pointing longgar tetap terdeteksi (middle+ring curled)');
  ok(loose.aiming, 'pointing longgar juga aiming');
}
{
  const bent = pose('curl', 'curl', 'curl', 'curl');
  bent[5] = { x: 0.44, y: 0.72, z: 0 };
  bent[6] = { x: 0.44, y: 0.5, z: 0 };
  bent[7] = { x: 0.5, y: 0.45, z: 0 };
  bent[8] = { x: 0.56, y: 0.42, z: 0 };
  const p = AJ.analyzeHand(bent);
  eq(p.indexExt, false, 'telunjuk melengkung -> flag extended palsu');
  ok(p.aiming, 'tapi telunjuk masih terjulur (reach jauh) -> tetap aiming');
}
{
  const lm2d = pose('ext', 'curl', 'curl', 'curl');
  const world = JSON.parse(JSON.stringify(lm2d));
  for (const i of [6, 7, 8]) world[i] = { x: world[i].x, y: 0.68 - (6 - (i - 6)) * 0.0, z: -0.15 * (i - 5) };
  world[6] = { x: 0.44, y: 0.7, z: -0.1 };
  world[7] = { x: 0.44, y: 0.7, z: -0.2 };
  world[8] = { x: 0.44, y: 0.7, z: -0.3 };
  lm2d[6] = { x: 0.44, y: 0.7, z: 0 };
  lm2d[7] = { x: 0.44, y: 0.7, z: 0 };
  lm2d[8] = { x: 0.44, y: 0.7, z: 0 };
  const p = AJ.analyzeHand(lm2d, world);
  ok(p.indexExt, 'pakai world landmarks: jari menunjuk ke kamera tetap terhitung extended');
}

console.log('== anchor + mapPoint + kalibrasi ==');
{
  const a = AJ.anchorPoint([
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0.4, y: 0.5 },
    { x: 0, y: 0 },
    { x: 0.5, y: 0.3 },
  ]);
  close(a.x, 0.54, 1e-9, 'anchor mengekstrapolasi tip');
  close(a.y, 0.22, 1e-9, 'anchor y');
}
{
  const W = 1920;
  const H = 1080;
  const left = { x: 0.2, y: 0.2 };
  const right = { x: 0.8, y: 0.8 };
  const cal = AJ.makeCalibration(left, right);
  const p1 = AJ.mapPoint(left, cal, W, H, 1);
  close(p1.x, 0, 1, 'kalibrasi: titik kiri-atas -> x=0');
  close(p1.y, 0, 1, 'kalibrasi: titik kiri-atas -> y=0');
  const p2 = AJ.mapPoint(right, cal, W, H, 1);
  close(p2.x, W, 1, 'kalibrasi: titik kanan-bawah -> x=W');
  close(p2.y, H, 1, 'kalibrasi: titik kanan-bawah -> y=H');
  const mid = AJ.mapPoint({ x: 0.5, y: 0.5 }, cal, W, H, 1);
  close(mid.x, W / 2, 1, 'kalibrasi: tengah -> tengah layar');
}
{
  const W = 1000;
  const H = 1000;
  const id = AJ.mapPoint({ x: 0.25, y: 0.75 }, null, W, H, 1);
  close(id.x, 750, 1e-6, 'tanpa kalibrasi: mirror X');
  close(id.y, 750, 1e-6, 'tanpa kalibrasi: Y lurus');
  const g = AJ.mapPoint({ x: 0.25, y: 0.75 }, null, W, H, 1.5);
  close(g.x, 500 + 250 * 1.5, 1e-6, 'gain 1.5 memperbesar jangkauan');
  ok(g.x <= W, 'gain tetap di-clamp ke layar');
}

console.log('== OneEuro ==');
{
  const f = new AJ.OneEuro(1.0, 0.3);
  let last = 0;
  for (let i = 0; i <= 100; i++) last = f.filter(100, i * 0.016);
  close(last, 100, 0.5, 'konvergen ke nilai konstan');
  const f2 = new AJ.OneEuro(1.0, 0.0);
  const seq = [];
  for (let i = 0; i < 60; i++) seq.push(f2.filter(i % 2 === 0 ? 0 : 100, i * 0.016));
  const tail = seq.slice(-15);
  const min = Math.min(...tail);
  const max = Math.max(...tail);
  ok(min > 5 && max < 95, `noise teredam (min=${min.toFixed(1)}, max=${max.toFixed(1)})`);
}

console.log('== dwell ==');
{
  const d = AJ.createDwellState(500);
  let fired = null;
  for (let i = 0; i < 30 && !fired; i++) {
    const r = AJ.updateDwell(d, true, 'opt1', 16.7);
    fired = r.fired;
  }
  ok(fired === 'opt1', 'dwell fired setelah ~500ms');
  const d2 = AJ.createDwellState(500);
  let r = AJ.updateDwell(d2, true, 'a', 250);
  ok(!r.fired, 'belum fired di 250ms');
  r = AJ.updateDwell(d2, true, 'b', 250);
  ok(r.progress < 0.6, 'ganti target reset progress');
  r = AJ.updateDwell(d2, false, null, 300);
  eq(r.progress, 0, 'hilang pointing -> reset setelah grace');
  const d3 = AJ.createDwellState(300);
  let fired3 = false;
  for (let i = 0; i < 40 && !fired3; i++) fired3 = !!AJ.updateDwell(d3, true, 'x', 16.7).fired;
  const after = AJ.updateDwell(d3, true, 'x', 16.7);
  ok(!after.fired, 'locked setelah fire, tidak double-fire');
  const after2 = AJ.updateDwell(d3, true, 'y', 16.7);
  ok(!after2.fired && after2.progress < 0.2, 'target baru mulai dari nol');
}
{
  const d4 = AJ.createDwellState(500);
  let r = AJ.updateDwell(d4, true, 'a', 250);
  ok(!r.fired, 'dwell pertama belum fired di 250ms');
  r = AJ.updateDwell(d4, true, null, 60);
  close(r.progress, 0.5, 1e-6, 'hilang target sesaat: progress dibekukan, bukan direset');
  r = AJ.updateDwell(d4, true, 'a', 60);
  close(r.progress, 0.62, 1e-6, 'kembali ke target sama: progress lanjut');
  r = AJ.updateDwell(d4, true, 'a', 250);
  ok(r.fired === 'a', 'kedip singkat target tidak mereset dwell sampai fired');
}
{
  const d5 = AJ.createDwellState(400);
  AJ.updateDwell(d5, true, 'a', 300);
  const r1 = AJ.updateDwell(d5, true, 'b', 60);
  ok(r1.target === 'a', 'ganti target perlu konfirmasi dulu');
  const r2 = AJ.updateDwell(d5, true, 'b', 300);
  ok(r2.target === 'b', 'setelah konfirmasi target berganti');
  ok(!r2.fired, 'target baru tidak langsung fired walau akumulasi lama');
}

console.log('== createRound ==');
{
  let types = { img: 0, text: 0 };
  for (let i = 0; i < 1000; i++) {
    const r = AJ.createRound({ level: 'sedang' });
    eq(r.options.length, 4, 'sedang punya 4 opsi');
    eq(r.options.filter((o) => o.correct).length, 1, 'tepat 1 jawaban benar');
    ok(r.options.some((o) => o.correct && o.value === r.answer), 'jawaban ada di opsi');
    const vals = r.options.map((o) => o.value);
    eq(new Set(vals).size, vals.length, 'opsi unik');
    ok(AJ.AKSARA.includes(r.answer), 'jawaban valid');
    ok(r.type === 'img' || r.type === 'text', 'type valid');
    types[r.type]++;
  }
  ok(types.img > 200 && types.text > 200, `tipe campuran acak (img=${types.img}, text=${types.text})`);
}
{
  const typeHistory = [];
  let streakType = 0;
  let worst = 1;
  const answers = [];
  for (let i = 0; i < 300; i++) {
    const r = AJ.createRound({ level: 'sedang', answers, types: typeHistory.slice(-2) });
    answers.push(r.answer);
    typeHistory.push(r.type);
    if (typeHistory.length >= 2 && typeHistory[i] === typeHistory[i - 1]) streakType++;
    else streakType = 0;
    worst = Math.max(worst, streakType + 1);
  }
  ok(worst <= 2, `tipe tidak sama3 kali beruntun (worst=${worst})`);
}
{
  const answers = [];
  let lastFourSame = false;
  for (let i = 0; i < 300; i++) {
    const r = AJ.createRound({ level: 'sulit', answers });
    eq(r.options.length, 6, 'sulit punya 6 opsi');
    answers.push(r.answer);
    if (i > 8) {
      const last4 = answers.slice(-5, -1);
      if (new Set(last4).size === 1) lastFourSame = true;
    }
  }
  ok(!lastFourSame, 'jawaban tidak berulang4 kali berturut-turut');
}
{
  for (const lvl of ['mudah', 'sedang', 'sulit']) {
    const c = AJ.createRound({ level: lvl });
    eq(c.options.length, AJ.LEVELS[lvl].optionCount, `level ${lvl} jumlah opsi`);
  }
}

console.log('== skor ==');
{
  eq(AJ.scoreCorrect(1, 0), AJ.SCORE.correct + AJ.SCORE.timeBonusMax, 'skor penuh + bonus waktu');
  eq(AJ.scoreCorrect(0, 0), AJ.SCORE.correct, 'tanpa bonus waktu');
  eq(AJ.scoreCorrect(1, 99), AJ.SCORE.correct + AJ.SCORE.timeBonusMax + AJ.SCORE.streakCap * AJ.SCORE.streakBonus, 'streak di-cap');
  ok(AJ.scoreCorrect(1, 2) > AJ.scoreCorrect(0.5, 1), 'lebih cepat & makin streak = lebih besar');
}

console.log('== hitTest ==');
{
  const rects = [
    { id: 'a', x: 100, y: 100, w: 50, h: 50 },
    { id: 'b', x: 300, y: 100, w: 50, h: 50, disabled: true },
  ];
  eq(AJ.hitTest(120, 120, rects), 'a', 'kena di dalam');
  eq(AJ.hitTest(80, 120, rects, 25), 'a', 'pad diperluas');
  eq(AJ.hitTest(320, 120, rects), null, 'target disabled diabaikan');
  eq(AJ.hitTest(500, 500, rects), null, 'di luar -> null');
}

console.log('== processDetections ==');
function detAt(x, y, pointing) {
  const lm = makeHand(pointing ? { index: 'ext', middle: 'curl', ring: 'curl', pinky: 'curl' } : { index: 'curl', middle: 'curl', ring: 'curl', pinky: 'curl' });
  const shift = { x: x - 0.5, y: y - 0.9 };
  const moved = lm.map((p) => ({ x: p.x + shift.x, y: p.y + shift.y, z: 0 }));
  return { lm: moved, world: moved, handedness: 'Right' };
}

{
  const st = AJ.createTrackingState();
  let prev = null;
  let out = null;
  for (let i = 0; i < 6; i++) {
    out = AJ.processDetections(
      st,
      [detAt(0.3, 0.5, true), detAt(0.7, 0.5, true)],
      { W: 1920, H: 1080, nowMs: i * 33, dtMs: 33, prevPlayers: prev }
    );
    prev = out.players;
  }
  ok(out.players[1].seen && out.players[2].seen, 'dua tangan terdeteksi');
  ok(out.players[1].x < out.players[2].x, 'pemain 1 (sisi kiri layar) lebih kiri di layar');
  ok(out.players[1].pointing && out.players[2].pointing, 'pointing aktif setelah debounce');
  ok(out.players[1].aiming && out.players[2].aiming, 'aiming aktif setelah debounce');
  close(out.players[1].x, 1920 * 0.36, 120, 'tangan kanan gambar kamera = murid kiri layar -> pemain 1');
  close(out.players[2].x, 1920 * 0.76, 120, 'tangan kiri gambar kamera = murid kanan layar -> pemain 2');
}
{
  const st = AJ.createTrackingState();
  let prev = null;
  let out = null;
  for (let i = 0; i < 6; i++) {
    out = AJ.processDetections(st, [detAt(0.7, 0.5, true)], { W: 1920, H: 1080, nowMs: i * 33, dtMs: 33, prevPlayers: prev });
    prev = out.players;
  }
  eq(out.players[1].seen, true, 'satu tangan di sisi kanan gambar -> pemain 1');
  eq(out.players[1].pointing, true, 'pointing pemain 1');
  eq(out.players[2].seen, false, 'pemain 2 tidak terlihat');
}
{
  const st = AJ.createTrackingState();
  let prev = null;
  let out = null;
  for (let i = 0; i < 6; i++) {
    out = AJ.processDetections(st, [detAt(0.3, 0.5, true)], { W: 1920, H: 1080, nowMs: i * 33, dtMs: 33, prevPlayers: prev });
    prev = out.players;
  }
  eq(out.players[2].seen, true, 'satu tangan di sisi kiri gambar -> pemain 2');
  const st2 = AJ.createTrackingState();
  prev = null;
  for (let i = 0; i < 4; i++) {
    out = AJ.processDetections(st2, [detAt(0.3, 0.5, true)], { W: 1920, H: 1080, nowMs: i * 33, dtMs: 33, prevPlayers: prev });
    prev = out.players;
  }
  eq(out.players[1].seen, false, 'tangan di sisi kiri gambar tidak mengambil slot pemain 1 (belum ada)');
}
{
  const st = AJ.createTrackingState();
  let prev = null;
  let out = null;
  for (let i = 0; i < 6; i++) {
    out = AJ.processDetections(st, [detAt(0.3, 0.5, true), detAt(0.7, 0.5, true)], { W: 1920, H: 1080, nowMs: i * 33, dtMs: 33, prevPlayers: prev });
    prev = out.players;
  }
  const p1StartId = out.players[1].trackId;
  for (let i = 6; i < 30; i++) {
    const t = (i - 6) / 24;
    out = AJ.processDetections(
      st,
      [detAt(0.3 + t * 0.6, 0.5, true), detAt(0.7 - t * 0.6, 0.5, true)],
      { W: 1920, H: 1080, nowMs: i * 33, dtMs: 33, prevPlayers: prev }
    );
    prev = out.players;
    if (i > 12) {
      ok(out.players[1].trackId !== out.players[2].trackId, 'trackId unik antar pemain');
    }
  }
  ok(out.players[1].trackId === p1StartId, 'id track pemain 1 stabil saat tangan bersinggungan');
  ok(out.players[1].trackId !== out.players[2].trackId, 'trackId unik antar pemain');
}
{
  const st = AJ.createTrackingState();
  let prev = null;
  let out = null;
  for (let i = 0; i < 6; i++) {
    out = AJ.processDetections(st, [detAt(0.3, 0.5, true), detAt(0.7, 0.5, true)], { W: 1920, H: 1080, nowMs: i * 33, dtMs: 33, prevPlayers: prev });
    prev = out.players;
  }
  const lastX = out.players[1].x;
  for (let i = 6; i < 40; i++) {
    out = AJ.processDetections(st, [], { W: 1920, H: 1080, nowMs: i * 33, dtMs: 33, prevPlayers: prev });
    prev = out.players;
  }
  eq(out.players[1].seen, false, 'tangan hilang -> tidak terlihat');
  close(out.players[1].x, lastX, 1, 'posisi terakhir dipertahankan saat hilang');
  eq(st.tracks.length, 0, 'track dibersihkan setelah grace period');
}
{
  const st = AJ.createTrackingState();
  let prev = null;
  let out = null;
  for (let i = 0; i < 4; i++) {
    out = AJ.processDetections(st, [detAt(0.3, 0.5, false)], { W: 1920, H: 1080, nowMs: i * 33, dtMs: 33, prevPlayers: prev });
    prev = out.players;
  }
  eq(out.players[2].pointing, false, 'fist bukan pointing');
  eq(out.players[2].aiming, false, 'fist bukan aiming');
  out = AJ.processDetections(st, [detAt(0.3, 0.5, true)], { W: 1920, H: 1080, nowMs: 4 * 33, dtMs: 33, prevPlayers: prev });
  eq(out.players[2].pointing, false, 'butuh beberapa frame untuk mulai pointing (debounce)');
  out = AJ.processDetections(st, [detAt(0.3, 0.5, true)], { W: 1920, H: 1080, nowMs: 5 * 33, dtMs: 33, prevPlayers: out.players });
  eq(out.players[2].pointing, true, 'pointing aktif setelah debounce tercapai');
  eq(out.players[2].aiming, true, 'aiming aktif setelah debounce tercapai');
}
{
  const st = AJ.createTrackingState();
  let prev = null;
  let out = null;
  for (let i = 0; i < 8; i++) {
    out = AJ.processDetections(st, [detAt(0.3 + i * 0.01, 0.5, true)], { W: 1920, H: 1080, nowMs: i * 33, dtMs: 33, prevPlayers: prev });
    prev = out.players;
  }
  const x1 = out.players[2].x;
  out = AJ.processDetections(st, [detAt(0.6, 0.5, true)], { W: 1920, H: 1080, nowMs: 8 * 33, dtMs: 33, prevPlayers: prev });
  const jumped = Math.abs(out.players[2].x - x1);
  ok(jumped < 400, `gerakan tangan tiba-tiba tetap halus (delta=${jumped.toFixed(0)}px)`);
}

console.log('== processDetections mode solo ==');
{
  const st = AJ.createTrackingState();
  let prev = null;
  let out = null;
  for (let i = 0; i < 6; i++) {
    out = AJ.processDetections(st, [detAt(0.3, 0.5, true)], { W: 1920, H: 1080, nowMs: i * 33, dtMs: 33, prevPlayers: prev, solo: true });
    prev = out.players;
  }
  eq(out.players[1].seen, true, 'solo: tangan di sisi kiri gambar tetap jadi pemain 1');
  eq(out.players[2].seen, false, 'solo: pemain 2 tidak pernah aktif');
  eq(out.players[1].aiming, true, 'solo: aiming pemain 1 aktif');
  close(out.players[1].x, 1920 * 0.76, 160, 'solo: posisi tangan terpetakan ke layar penuh (cermin)');
}
{
  const st = AJ.createTrackingState();
  let prev = null;
  let out = null;
  for (let i = 0; i < 6; i++) {
    out = AJ.processDetections(st, [detAt(0.3, 0.5, true), detAt(0.7, 0.5, true)], { W: 1920, H: 1080, nowMs: i * 33, dtMs: 33, prevPlayers: prev, solo: true });
    prev = out.players;
  }
  eq(out.players[2].seen, false, 'solo: tangan kedua tidak mengisi pemain 2');
  eq(out.tracks.filter((t) => t.player === 1).length, 1, 'solo: hanya satu track mengisi pemain 1');
}
{
  const st = AJ.createTrackingState();
  let prev = null;
  let out = null;
  for (let i = 0; i < 6; i++) {
    out = AJ.processDetections(st, [detAt(0.3, 0.5, true)], { W: 1920, H: 1080, nowMs: i * 33, dtMs: 33, prevPlayers: prev });
    prev = out.players;
  }
  eq(out.players[2].seen, true, 'baseline 2p: tangan kiri gambar = pemain 2');
  for (let i = 6; i < 14; i++) {
    out = AJ.processDetections(st, [detAt(0.3, 0.5, true)], { W: 1920, H: 1080, nowMs: i * 33, dtMs: 33, prevPlayers: prev, solo: true });
    prev = out.players;
  }
  eq(out.players[1].seen, true, 'pindah 2p -> solo: track berpindah ke pemain 1');
  eq(out.players[2].seen, false, 'pindah 2p -> solo: pemain 2 dilepas');
}

console.log('== finalStandings ==');
{
  const f = AJ.finalStandings({ 1: 500, 2: 300 }, 10);
  eq(f.winner, 1, 'pemain 1 menang');
  const d = AJ.finalStandings({ 1: 100, 2: 100 }, 10);
  eq(d.draw, true, 'seri');
}

console.log('');
console.log(`RESULT: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
