(function (global) {
  'use strict';

  const AKSARA = ['ha', 'na', 'ca', 'ra', 'ka', 'da', 'ta', 'sa', 'wa', 'la', 'pa', 'ja', 'ya', 'nya', 'ga', 'nga', 'tha', 'dha', 'ma', 'ba'];
  const ASSET_BASE = 'assets/aksara/';

  const LEVELS = {
    mudah: { optionCount: 3, speed: 0.05, sway: 0.04 },
    sedang: { optionCount: 4, speed: 0.062, sway: 0.055 },
    sulit: { optionCount: 6, speed: 0.08, sway: 0.07 },
  };

  const SCORE = {
    correct: 100,
    timeBonusMax: 50,
    streakBonus: 25,
    streakCap: 4,
    wrong: 30,
  };

  const DEFAULTS = {
    dwellMs: 700,
    rounds: 10,
    level: 'sedang',
    gain: 1,
    mirror: true,
    roundTimeLimit: 30,
  };

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  const pick = (arr) => arr[randInt(0, arr.length - 1)];

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = randInt(0, i);
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function sample(arr, n) {
    return shuffle(arr).slice(0, n);
  }

  function createRound(cfg) {
    const level = LEVELS[cfg.level] ? cfg.level : DEFAULTS.level;
    const lvl = LEVELS[level];
    const count = clamp(cfg.optionCount || lvl.optionCount, 2, AKSARA.length);
    const recent = (cfg.answers || []).slice(-4);
    let pool = AKSARA.filter((a) => recent.indexOf(a) === -1);
    if (pool.length < count) pool = shuffle(AKSARA);
    const answer = pick(pool);
    const others = shuffle(AKSARA.filter((a) => a !== answer));
    const distractors = others.slice(0, count - 1);

    const allowed = cfg.allowedTypes && cfg.allowedTypes.length ? cfg.allowedTypes : ['img', 'text'];
    const history = cfg.types || [];
    let type = pick(allowed);
    if (history.length >= 2 && history[0] === history[1] && allowed.length > 1) {
      const alt = allowed.filter((t) => t !== history[0]);
      type = alt.length ? pick(alt) : type;
    }

    const options = shuffle([
      { value: answer, correct: true },
      ...distractors.map((d) => ({ value: d, correct: false })),
    ]);

    return { type, answer, options, level };
  }

  function scoreCorrect(timeFrac, streak) {
    const bonus = Math.round(clamp(timeFrac, 0, 1) * SCORE.timeBonusMax);
    const streakPart = Math.min(Math.max(streak, 0), SCORE.streakCap) * SCORE.streakBonus;
    return SCORE.correct + bonus + streakPart;
  }

  function dist3(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
  }

  function angleAt(a, b, c) {
    const v1 = { x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) };
    const v2 = { x: c.x - b.x, y: c.y - b.y, z: (c.z || 0) - (b.z || 0) };
    const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
    const n1 = Math.hypot(v1.x, v1.y, v1.z);
    const n2 = Math.hypot(v2.x, v2.y, v2.z);
    if (!n1 || !n2) return 180;
    return (Math.acos(clamp(dot / (n1 * n2), -1, 1)) * 180) / Math.PI;
  }

  const FINGERS = [
    { name: 'index', mcp: 5, pip: 6, dip: 7, tip: 8 },
    { name: 'middle', mcp: 9, pip: 10, dip: 11, tip: 12 },
    { name: 'ring', mcp: 13, pip: 14, dip: 15, tip: 16 },
    { name: 'pinky', mcp: 17, pip: 18, dip: 19, tip: 20 },
  ];

  function analyzeHand(lm, world) {
    const pts = world && world.length === 21 ? world : lm && lm.length === 21 ? lm : null;
    if (!pts) return { valid: false, pointing: false, aiming: false };

    const wrist = pts[0];
    const fingers = {};
    for (const f of FINGERS) {
      const mcp = pts[f.mcp];
      const pip = pts[f.pip];
      const tip = pts[f.tip];
      const byDist = dist3(tip, wrist) > dist3(pip, wrist) * 1.04;
      const angPip = angleAt(mcp, pip, tip);
      const angMcp = angleAt(wrist, mcp, tip);
      const extended = byDist && (angPip > 150 || angMcp > 165);
      fingers[f.name] = { extended, angPip, byDist };
    }

    const thumbTip = dist3(pts[4], pts[17]);
    const thumbPip = dist3(pts[3], pts[17]);
    const thumbExtended = thumbTip > thumbPip * 1.35;

    const indexExt = fingers.index.extended;
    const middleExt = fingers.middle.extended;
    const ringExt = fingers.ring.extended;
    const pinkyExt = fingers.pinky.extended;

    const curledCount = [fingers.middle, fingers.ring, fingers.pinky].filter((f) => !f.extended).length;
    const extendedCount = [indexExt, middleExt, ringExt, pinkyExt].filter(Boolean).length;

    let score = 0;
    if (indexExt) score += 2;
    score += curledCount;

    const pointing = indexExt && !middleExt && curledCount >= 2;

    const fist = !indexExt && !middleExt && !ringExt && !pinkyExt;
    const openPalm = indexExt && middleExt && ringExt && pinkyExt;
    const palmLen = dist3(pts[9], wrist);
    const indexReach = palmLen > 1e-6 ? dist3(pts[8], wrist) / palmLen : 0;
    const indexOut = indexReach > 1.45;
    const aiming = !openPalm && indexOut;

    return {
      valid: true,
      fingers,
      thumbExtended,
      indexExt,
      middleExt,
      ringExt,
      pinkyExt,
      extendedCount,
      curledCount,
      pointing,
      pointingScore: score,
      indexReach,
      aiming,
      fist,
      openPalm,
      palmSize: dist3(pts[0], pts[9]),
      pinch: dist3(pts[4], pts[8]),
      indexTip: lm && lm.length === 21 ? lm[8] : pts[8],
      indexPip: lm && lm.length === 21 ? lm[6] : pts[6],
    };
  }

  function anchorPoint(lm) {
    const tip = lm[8];
    const pip = lm[6];
    const k = 0.4;
    return {
      x: tip.x + (tip.x - pip.x) * k,
      y: tip.y + (tip.y - pip.y) * k,
      z: tip.z || 0,
    };
  }

  function makeCalibration(tl, br, mirror) {
    const flip = mirror === false ? (p) => p.x : (p) => 1 - p.x;
    return {
      x0: flip(tl),
      y0: tl.y,
      x1: flip(br),
      y1: br.y,
    };
  }

  function mapPointNorm(raw, cal, gain, mirror) {
    const mx = mirror === false ? raw.x : 1 - raw.x;
    const my = raw.y;
    let x;
    let y;
    const valid = cal && Number.isFinite(cal.x0) && Math.abs(cal.x1 - cal.x0) > 1e-4 && Math.abs(cal.y1 - cal.y0) > 1e-4;
    if (valid) {
      x = (mx - cal.x0) / (cal.x1 - cal.x0);
      y = (my - cal.y0) / (cal.y1 - cal.y0);
    } else {
      x = mx;
      y = my;
    }
    if (gain && Math.abs(gain - 1) > 1e-3) {
      x = 0.5 + (x - 0.5) * gain;
      y = 0.5 + (y - 0.5) * gain;
    }
    return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
  }

  function mapPoint(raw, cal, W, H, gain) {
    const n = mapPointNorm(raw, cal, gain);
    return { x: n.x * W, y: n.y * H };
  }

  class OneEuro {
    constructor(minCutoff, beta, dCutoff) {
      this.minCutoff = minCutoff === undefined ? 1.0 : minCutoff;
      this.beta = beta === undefined ? 0.5 : beta;
      this.dCutoff = dCutoff === undefined ? 1.0 : dCutoff;
      this.x = null;
      this.dx = 0;
      this.t = null;
    }

    alpha(cutoff, dt) {
      const tau = 1 / (2 * Math.PI * cutoff);
      return 1 / (1 + tau / dt);
    }

    filter(value, tSec) {
      if (this.x === null || this.t === null) {
        this.x = value;
        this.t = tSec;
        return value;
      }
      const dt = Math.max(1e-3, tSec - this.t);
      this.t = tSec;
      const dxRaw = (value - this.x) / dt;
      const ad = this.alpha(this.dCutoff, dt);
      this.dx = ad * dxRaw + (1 - ad) * this.dx;
      const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
      const a = this.alpha(cutoff, dt);
      this.x = a * value + (1 - a) * this.x;
      return this.x;
    }

    reset(value) {
      this.x = value;
      this.dx = 0;
      this.t = null;
    }
  }

  function createDwellState(ms) {
    return { ms: ms || DEFAULTS.dwellMs, target: null, t: 0, grace: 0, locked: false, pend: undefined, pendT: 0 };
  }

  function updateDwell(state, active, targetId, dtMs) {
    const GRACE = 200;
    const CONFIRM = 100;
    let fired = null;
    let progress = 0;

    if (!active) {
      state.grace += dtMs;
      if (state.grace > GRACE) {
        if (state.target !== null) state.locked = false;
        state.target = null;
        state.t = 0;
        state.pend = undefined;
        state.pendT = 0;
      }
      progress = state.target !== null ? state.t / state.ms : 0;
      return { progress, fired, target: state.target };
    }

    state.grace = 0;
    const want = targetId === undefined ? null : targetId;

    if (want !== state.target) {
      if (state.pend !== want) {
        state.pend = want;
        state.pendT = 0;
      }
      if (state.target === null) {
        state.target = want;
        state.t = 0;
        state.pend = undefined;
        state.pendT = 0;
      } else {
        state.pendT += dtMs;
        if (state.pendT < CONFIRM) {
          return { progress: state.target !== null ? clamp(state.t / state.ms, 0, 1) : 0, fired, target: state.target };
        }
        state.target = want;
        state.t = 0;
        state.locked = false;
        state.pend = undefined;
        state.pendT = 0;
      }
    } else {
      state.pend = undefined;
      state.pendT = 0;
    }

    if (state.target === null || state.target === undefined) {
      state.t = Math.max(0, state.t - dtMs * 3);
      return { progress: 0, fired, target: null };
    }

    if (state.locked) return { progress: 1, fired, target: state.target };

    state.t += dtMs;
    progress = clamp(state.t / state.ms, 0, 1);
    if (state.t >= state.ms) {
      fired = state.target;
      state.locked = true;
      state.t = 0;
    }
    return { progress, fired, target: state.target };
  }

  function createTrackingState() {
    return { tracks: [], nextId: 1 };
  }

  function assignPlayers(tracks, now, solo) {
    const active = tracks.filter((t) => t.lost < 0.7);
    if (solo) {
      for (const t of active) {
        if (t.player === 2) t.player = null;
      }
    }
    const taken = {};
    for (const t of active) {
      if (t.player) {
        if (taken[t.player] && taken[t.player] !== t) {
          const other = t.player === 1 ? 2 : 1;
          if (!taken[other]) t.player = other;
          else t.player = null;
        }
        if (t.player) taken[t.player] = t;
      }
    }

    for (const t of active) {
      if (t.player) continue;
      const side = solo ? 1 : (t.raw.x >= 0.5 ? 1 : 2);
      const other = side === 1 ? 2 : 1;
      if (!taken[side]) t.player = side;
      else if (!solo && !taken[other]) t.player = other;
      else t.player = null;
      if (t.player) taken[t.player] = t;
    }

    for (const t of tracks) {
      if (t.player && t.lost >= 0.7) {
        delete taken[t.player];
        t.player = null;
        t.filterX = null;
        t.filterY = null;
      }
    }
    return active;
  }

  function processDetections(state, dets, opts) {
    const W = opts.W;
    const H = opts.H;
    const cal = opts.cal || {};
    const gain = opts.gain || 1;
    const dtMs = opts.dtMs || 16;
    const dt = dtMs / 1000;
    const nowMs = opts.nowMs || 0;
    const pointingFrames = opts.pointingFrames || 2;

    const analysis = dets.map((d) => {
      const a = analyzeHand(d.lm, d.world);
      const anchor = anchorPoint(d.lm);
      return {
        det: d,
        analysis: a,
        raw: { x: anchor.x, y: anchor.y },
        mp: { x: d.lm[9].x, y: d.lm[9].y },
      };
    });

    const usedDet = new Array(analysis.length).fill(false);
    const detForTrack = new Array(state.tracks.length).fill(-1);

    for (let ti = 0; ti < state.tracks.length; ti++) {
      const tr = state.tracks[ti];
      let best = -1;
      let bestD = 0.3;
      for (let di = 0; di < analysis.length; di++) {
        if (usedDet[di]) continue;
        const d = Math.hypot(analysis[di].mp.x - tr.mp.x, analysis[di].mp.y - tr.mp.y);
        if (d < bestD) {
          bestD = d;
          best = di;
        }
      }
      if (best >= 0) {
        usedDet[best] = true;
        detForTrack[ti] = best;
      }
    }

    const kept = [];
    for (let ti = 0; ti < state.tracks.length; ti++) {
      const tr = state.tracks[ti];
      const di = detForTrack[ti];
      if (di >= 0) {
        kept.push(tr);
        const item = analysis[di];
        tr.raw = item.raw;
        tr.mp = item.mp;
        tr.lm = item.det.lm;
        tr.world = item.det.world;
        tr.handedness = item.det.handedness;
        tr.analysis = item.analysis;
        tr.lost = 0;
        tr.frames = (tr.frames || 0) + 1;
        const want = !!item.analysis.pointing;
        if (want) {
          tr.pointFrames = (tr.pointFrames || 0) + 1;
          tr.notPointFrames = 0;
        } else {
          tr.notPointFrames = (tr.notPointFrames || 0) + 1;
          tr.pointFrames = 0;
        }
        if (!tr.pointing && tr.pointFrames >= pointingFrames) tr.pointing = true;
        if (tr.pointing && tr.notPointFrames >= pointingFrames + 1) tr.pointing = false;
        const wantAim = !!item.analysis.aiming;
        if (wantAim) {
          tr.aimFrames = (tr.aimFrames || 0) + 1;
          tr.notAimFrames = 0;
        } else {
          tr.notAimFrames = (tr.notAimFrames || 0) + 1;
          tr.aimFrames = 0;
        }
        if (!tr.aiming && tr.aimFrames >= pointingFrames) tr.aiming = true;
        if (tr.aiming && tr.notAimFrames >= pointingFrames + 1) tr.aiming = false;
      } else {
        tr.lost += dt;
        if (tr.lost < 0.7) kept.push(tr);
      }
    }

    const newTracks = [];
    for (let di = 0; di < analysis.length; di++) {
      if (usedDet[di]) continue;
      const item = analysis[di];
      newTracks.push({
        id: state.nextId++,
        raw: item.raw,
        mp: item.mp,
        lm: item.det.lm,
        world: item.det.world,
        handedness: item.det.handedness,
        analysis: item.analysis,
        lost: 0,
        frames: 1,
        player: null,
        pointing: false,
        aimFrames: item.analysis.aiming ? 1 : 0,
        notAimFrames: item.analysis.aiming ? 0 : 1,
        aiming: false,
        pointFrames: 1,
        notPointFrames: 0,
        filterX: new OneEuro(),
        filterY: new OneEuro(),
      });
    }
    state.tracks = kept.concat(newTracks);

    const active = assignPlayers(state.tracks, nowMs, !!opts.solo);

    const players = {
      1: { seen: false, pointing: false, aiming: false, x: W / 2, y: H / 2, confidence: 0, openPalm: false, trackId: null },
      2: { seen: false, pointing: false, aiming: false, x: W / 2, y: H / 2, confidence: 0, openPalm: false, trackId: null },
    };
    const prevSeen = opts.prevPlayers || null;

    for (const tr of active) {
      if (!tr.player) continue;
      const p = players[tr.player];
      const mapped = mapPointNorm(tr.raw, cal[tr.player], gain, opts.mirror);
      if (!tr.filterX || (prevSeen && !prevSeen[tr.player].seen)) {
        tr.filterX = tr.filterX || new OneEuro();
        tr.filterY = tr.filterY || new OneEuro();
        tr.filterX.reset(mapped.x);
        tr.filterY.reset(mapped.y);
      }
      const tSec = nowMs / 1000;
      const x = tr.filterX.filter(mapped.x, tSec) * W;
      const y = tr.filterY.filter(mapped.y, tSec) * H;
      tr.screen = { x, y };
      p.seen = true;
      p.x = x;
      p.y = y;
      p.pointing = tr.pointing && tr.analysis && tr.analysis.valid;
      p.aiming = tr.aiming && tr.analysis && tr.analysis.valid;
      p.confidence = tr.analysis ? clamp(tr.analysis.pointingScore / 5, 0, 1) : 0;
      p.openPalm = !!(tr.analysis && tr.analysis.openPalm);
      p.fist = !!(tr.analysis && tr.analysis.fist);
      p.trackId = tr.id;
      p.lost = tr.lost;
      p.raw = { x: tr.raw.x, y: tr.raw.y };
    }

    for (const k of [1, 2]) {
      if (prevSeen && prevSeen[k] && !players[k].seen) {
        players[k].x = prevSeen[k].x;
        players[k].y = prevSeen[k].y;
      }
    }

    return { players, tracks: state.tracks };
  }

  function hitTest(x, y, rects, pad) {
    const p = pad || 0;
    for (const r of rects) {
      if (r.disabled) continue;
      if (x >= r.x - p && x <= r.x + r.w + p && y >= r.y - p && y <= r.y + r.h + p) return r.id;
    }
    return null;
  }

  function finalStandings(scores, roundsPlayed) {
    const s1 = scores[1] || 0;
    const s2 = scores[2] || 0;
    let winner = 0;
    if (s1 > s2) winner = 1;
    else if (s2 > s1) winner = 2;
    return { winner, s1, s2, draw: winner === 0, roundsPlayed };
  }

  global.AJ = {
    AKSARA,
    ASSET_BASE,
    LEVELS,
    SCORE,
    DEFAULTS,
    clamp,
    pick,
    shuffle,
    sample,
    createRound,
    scoreCorrect,
    dist3,
    angleAt,
    analyzeHand,
    anchorPoint,
    makeCalibration,
    mapPoint,
    mapPointNorm,
    OneEuro,
    createDwellState,
    updateDwell,
    createTrackingState,
    processDetections,
    hitTest,
    finalStandings,
  };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window : globalThis).AJ;
}
