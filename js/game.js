(function (global) {
  'use strict';

  const COUNT_STEPS = [
    { text: '3', dur: 800, snd: 'count' },
    { text: '2', dur: 800, snd: 'count' },
    { text: '1', dur: 800, snd: 'count' },
    { text: 'LAWAN!', dur: 700, snd: 'go' },
  ];

  const Game = {
    state: 'idle',
    mode: '2p',
    settings: null,
    scores: { 1: 0, 2: 0 },
    wins: { 1: 0, 2: 0 },
    streaks: { 1: 0, 2: 0 },
    round: 0,
    totalRounds: 10,
    question: null,
    options: [],
    answerHistory: [],
    typeHistory: [],
    roundTime: 0,
    timeLimit: 30000,
    dwell: { 1: null, 2: null },
    lockUntil: { 1: 0, 2: 0 },
    wrongDone: { 1: false, 2: false },
    hover: { 1: null, 2: null },
    arena: { left: 0, top: 0, width: 0, height: 0 },
    fallT: 0,
    fallSpeed: 60,
    countdownT: 0,
    countStep: -1,
    flashT: 0,
    paused: false,
    now: 0,

    start(settings) {
      this.settings = settings;
      this.mode = settings.mode === '1p' ? '1p' : '2p';
      this.scores = { 1: 0, 2: 0 };
      this.wins = { 1: 0, 2: 0 };
      this.streaks = { 1: 0, 2: 0 };
      this.totalRounds = settings.rounds;
      this.round = 0;
      this.answerHistory = [];
      this.typeHistory = [];
      this.timeLimit = AJ.DEFAULTS.roundTimeLimit * 1000;
      this.dwell = { 1: AJ.createDwellState(settings.dwellMs), 2: AJ.createDwellState(settings.dwellMs) };
      this.lockUntil = { 1: 0, 2: 0 };
      this.paused = false;
      this.fallT = 0;

      UI.setNames(settings.p1, settings.p2);
      UI.updateScores();
      UI.show('screen-game');
      UI.placeCamBox('mini');
      const arenaEl = UI.get('arena');
      if (arenaEl) arenaEl.classList.toggle('split', this.mode === '2p');
      UI.hideFlash();
      UI.clearOptions();
      UI.updateRound(0, this.totalRounds);
      UI.updateTimer(1);
      this.refreshArena();
      this.prepareRound(1);

      this.state = 'countdown';
      this.countdownT = 0;
      this.countStep = 0;
      UI.showCount(COUNT_STEPS[0].text);
      Sfx.ensure();
      Sfx.count();
    },

    prepareRound(n) {
      this.round = n;
      this.question = AJ.createRound({
        level: this.settings.level,
        answers: this.answerHistory,
        types: this.typeHistory.slice(-2),
      });
      this.answerHistory.push(this.question.answer);
      if (this.answerHistory.length > 12) this.answerHistory.shift();
      this.typeHistory.push(this.question.type);
      if (this.typeHistory.length > 8) this.typeHistory.shift();

      this.roundTime = 0;
      this.wrongDone = { 1: false, 2: false };
      this.lockUntil = { 1: 0, 2: 0 };
      this.dwell = { 1: AJ.createDwellState(this.settings.dwellMs), 2: AJ.createDwellState(this.settings.dwellMs) };
      this.hover = { 1: null, 2: null };

      UI.clearOptions();
      this.buildOptions();
      UI.buildQuestion(this.question, n);
      UI.updateRound(n, this.totalRounds);
      UI.updateTimer(1);
      UI.hideFlash();
    },

    refreshArena() {
      const el = UI.get('arena');
      if (!el) return;
      const r = el.getBoundingClientRect();
      this.arena = { left: r.left, top: r.top, width: r.width, height: r.height };
    },

    playerList() {
      return this.mode === '1p' ? [1] : [1, 2];
    },

    buildOptions() {
      UI.clearOptions();
      const count = this.question.options.length;
      const split = this.mode === '2p';
      const a = this.arena;
      const sides = split ? [1, 2] : [1];
      const gap = 16;
      const halfW = a.width / 2;
      this.options = [];
      for (const side of sides) {
        const x0 = split ? (side === 2 ? halfW + gap / 2 : gap / 2) : 0;
        const w = split ? halfW - gap : a.width;
        const laneW = w / Math.max(1, count);
        const size = Math.max(110, Math.min(laneW * 0.8, a.height * 0.34, 330));
        const swayAmp = Math.min(laneW * 0.07, 46);
        for (let i = 0; i < count; i++) {
          const el = UI.createOption(this.question, i, size);
          const baseX = x0 + i * laneW + (laneW - size) / 2;
          const y = -size * 0.55 - (i % 3) * size * 0.18;
          const opt = {
            id: 's' + side + 'o' + i,
            side,
            value: this.question.options[i].value,
            correct: this.question.options[i].correct,
            el,
            w: size,
            h: size,
            baseX,
            curX: baseX,
            y,
            swayAmp,
            phase: i * 1.7 + Math.random() * 2,
            gone: false,
          };
          this.options.push(opt);
          UI.setOptionPos(el, baseX, y);
        }
      }
      const level = AJ.LEVELS[this.settings.level] || AJ.LEVELS.sedang;
      const factor = Math.min(1 + 0.045 * Math.max(0, this.round - 1), 1.7);
      this.fallSpeed = level.speed * a.height * factor;
      this.fallT = 0;
    },

    startRound(n) {
      this.prepareRound(n);
      this.state = 'playing';
    },

    rects(player) {
      const a = this.arena;
      const out = [];
      for (const o of this.options) {
        if (o.gone) continue;
        if (player && o.side !== player) continue;
        out.push({ id: o.id, x: a.left + o.curX, y: a.top + o.y, w: o.w, h: o.h });
      }
      return out;
    },

    update(dtMs, players, now) {
      this.now = now;
      if (this.paused) return;

      if (this.state === 'countdown') {
        this.countdownT += dtMs;
        let acc = 0;
        let stepIdx = 0;
        for (let i = 0; i < COUNT_STEPS.length; i++) {
          acc += COUNT_STEPS[i].dur;
          if (this.countdownT < acc) {
            stepIdx = i;
            break;
          }
          stepIdx = i + 1;
        }
        if (stepIdx !== this.countStep && stepIdx < COUNT_STEPS.length) {
          this.countStep = stepIdx;
          UI.showCount(COUNT_STEPS[stepIdx].text);
          if (COUNT_STEPS[stepIdx].snd === 'go') Sfx.go();
          else Sfx.count();
        }
        this.renderCursors(players, now);
        if (this.countdownT >= acc) {
          UI.hideCount();
          this.state = 'playing';
        }
        return;
      }

      if (this.state === 'playing') {
        this.roundTime += dtMs;
        this.moveOptions(dtMs);
        this.processPlayers(dtMs, players, now);
        const remain = Math.max(0, 1 - this.roundTime / this.timeLimit);
        UI.updateTimer(remain);
        if (this.roundTime >= this.timeLimit) {
          this.endRound(0, 'Jawaban: ' + this.question.answer.toUpperCase());
        }
        return;
      }

      if (this.state === 'flash') {
        this.renderCursors(players, false, now);
        UI.setOptionHover(this.options, null, null);
        this.flashT -= dtMs;
        if (this.flashT <= 0) {
          if (this.round >= this.totalRounds) this.finish();
          else this.startRound(this.round + 1);
        }
      }
    },

    moveOptions(dtMs) {
      const dt = dtMs / 1000;
      this.fallT += dt;
      const h = this.arena.height;
      let alive = 0;
      for (const o of this.options) {
        if (o.gone) continue;
        o.y += this.fallSpeed * dt;
        const sway = Math.sin(this.fallT * 1.15 + o.phase) * o.swayAmp;
        o.curX = o.baseX + sway;
        if (o.y > h) {
          o.gone = true;
          o.el.remove();
          continue;
        }
        alive++;
        UI.setOptionPos(o.el, o.curX, o.y);
      }
      if (!alive && this.state === 'playing') {
        this.endRound(0, 'Jawaban: ' + this.question.answer.toUpperCase());
      }
    },

    processPlayers(dtMs, players, now) {
      this.hover = { 1: null, 2: null };
      const split = this.mode === '2p';
      const mid = this.arena.left + this.arena.width / 2;

      for (const i of this.playerList()) {
        const p = players[i];
        const seen = !!(p && p.seen);
        const ready = seen && (p.aiming || p.pointing);
        const locked = now < this.lockUntil[i];
        const active = ready && !locked;
        const px = split ? (i === 1 ? Math.min(p ? p.x : 0, mid) : Math.max(p ? p.x : 0, mid)) : p ? p.x : 0;
        const py = p ? p.y : 0;
        const targetId = active ? AJ.hitTest(px, py, this.rects(i), 24) : null;
        const res = AJ.updateDwell(this.dwell[i], active, targetId, dtMs);
        if (res.fired) this.select(i, res.fired);
        if (targetId) this.hover[i] = targetId;
        UI.renderCursor(i, {
          x: px,
          y: py,
          visible: seen,
          dim: !ready,
          locked,
          progress: active ? res.progress : 0,
        });
        UI.setHandFlag(i, seen, ready);
      }

      UI.setOptionHover(this.options, this.hover[1], this.hover[2]);
    },

    renderCursors(players, now) {
      const split = this.mode === '2p';
      const mid = this.arena.left + this.arena.width / 2;
      for (const i of this.playerList()) {
        const p = players[i];
        const seen = !!(p && p.seen);
        const ready = seen && (p.aiming || p.pointing);
        const locked = now < this.lockUntil[i];
        const px = split ? (i === 1 ? Math.min(p ? p.x : 0, mid) : Math.max(p ? p.x : 0, mid)) : p ? p.x : 0;
        UI.renderCursor(i, {
          x: px,
          y: p ? p.y : 0,
          visible: seen,
          dim: !ready,
          locked,
          progress: 0,
        });
        UI.setHandFlag(i, seen, ready);
      }
    },

    handleTap(player, x, y) {
      if (this.state !== 'playing' || this.paused) return;
      if (this.mode === '1p' && player !== 1) return;
      const rects = this.rects(player);
      const id = AJ.hitTest(x, y, rects, 4);
      if (id) this.select(player, id);
    },

    select(player, id) {
      if (this.state !== 'playing') return;
      if (this.mode === '1p' && player !== 1) return;
      const o = this.options.find((opt) => opt.id === id && !opt.gone);
      if (!o) return;
      const a = this.arena;

      if (o.correct) {
        const other = player === 1 ? 2 : 1;
        const timeFrac = Math.max(0, 1 - this.roundTime / this.timeLimit);
        const pts = AJ.scoreCorrect(timeFrac, this.streaks[player]);
        this.scores[player] += pts;
        this.wins[player] += 1;
        this.streaks[player] += 1;
        this.streaks[other] = 0;
        o.el.classList.add('correct');
        if (this.mode === '2p') {
          for (const op of this.options) {
            if (op.side !== player && op.correct && !op.gone) op.el.classList.add('correct');
          }
        }
        UI.fxFloat(a.left + o.curX + o.w / 2, a.top + o.y + o.h / 2, '+' + pts, false);
        UI.updateScores();
        Sfx.correct();
        this.endRound(player, '+' + pts + ' poin • jawaban ' + o.value.toUpperCase());
        return;
      }

      if (!this.wrongDone[player]) {
        this.wrongDone[player] = true;
        this.scores[player] = Math.max(0, this.scores[player] - AJ.SCORE.wrong);
        this.streaks[player] = 0;
        this.lockUntil[player] = this.now + 1300;
        UI.updateScores();
        UI.fxFloat(a.left + o.curX + o.w / 2, a.top + o.y + o.h / 2, '-' + AJ.SCORE.wrong, true);
      }
      if (!o.el.classList.contains('wrong')) o.el.classList.add('wrong');
      Sfx.wrong();
    },

    endRound(winner, sub) {
      if (this.state !== 'playing') return;
      this.state = 'flash';
      this.flashT = 1900;
      if (winner && this.mode === '1p') {
        UI.showFlash('JAWABAN BENAR!', sub, '');
      } else if (winner) {
        UI.showFlash(UI.names[winner] + ' MENANG RONDE!', sub, winner === 1 ? '' : 'p2');
      } else {
        Sfx.timeout();
        UI.showFlash('Ronde Berakhir', sub, 'neutral');
      }
    },

    finish() {
      this.state = 'final';
      const res = AJ.finalStandings(this.scores, this.round);
      res.wins = this.wins;
      UI.showFinal(res);
      UI.placeCamBox('home');
      if (res.winner) Sfx.win();
      else Sfx.fanfare();
    },

    pause() {
      if (this.paused) return;
      if (['playing', 'flash', 'countdown'].indexOf(this.state) === -1) return;
      this.paused = true;
      UI.setPause(true);
      UI.placeCamBox('pause');
    },

    resume() {
      if (!this.paused) return;
      this.paused = false;
      UI.setPause(false);
      UI.placeCamBox('mini');
      this.refreshArena();
    },

    toMenu() {
      this.state = 'idle';
      this.paused = false;
      UI.setPause(false);
      UI.hideCount();
      UI.hideFlash();
      UI.clearOptions();
      UI.hideCursors();
      const arenaEl = UI.get('arena');
      if (arenaEl) arenaEl.classList.remove('split');
      UI.show('screen-menu');
      UI.placeCamBox('home');
    },
  };

  global.Game = Game;
})(window);
