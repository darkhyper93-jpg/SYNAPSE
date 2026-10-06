// TRACE — multiple object tracking. Trajectories are simulated up-front (deterministic,
// validated for fairness: the final positions never overlap).
import { Challenge } from '../engine/challenge.js';
import { byDiff, byDiffF } from '../utils/math.js';
import { h, now } from '../utils/dom.js';
import { t } from '../game/i18n.js';

const W = 1;
const H = 0.68;
const R = 0.034;
const FPS = 60;
const LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E'];

export class TraceChallenge extends Challenge {
  static meta = { id: 'trace', skill: 'perception', targetTime: 3500 };

  generate() {
    this.rounds = [this.makeRound(), this.makeRound()];
  }

  makeRound() {
    const d = this.difficulty;
    const rng = this.rng;
    const n = byDiff(d, 5, 12);
    const targets = d < 0.5 ? 1 : d < 0.82 ? 2 : 3;
    const speed = byDiffF(d, 0.17, 0.48);
    const duration = byDiff(d, 4000, 7000);
    const turnRate = d >= 0.3 ? byDiffF(d, 0.2, 1.1) : 0; // sharp turns per second
    const wander = byDiffF(d, 0.4, 2.2); // rad/s random steering
    const blink = d >= 0.7 ? { at: Math.round(duration * rng.range(0.4, 0.6)), dur: byDiff(d, 160, 320) } : null;

    // Initial non-overlapping placement
    const balls = [];
    let guard = 0;
    while (balls.length < n && guard++ < 5000) {
      const p = { x: rng.range(R * 1.5, W - R * 1.5), y: rng.range(R * 1.5, H - R * 1.5) };
      if (balls.every((b) => Math.hypot(b.x - p.x, b.y - p.y) > R * 3.2)) {
        const a = rng.range(0, Math.PI * 2);
        balls.push({ ...p, a, s: speed * rng.range(0.85, 1.15) });
      }
    }
    const frames = Math.round((duration / 1000) * FPS);
    const extra = 90; // frames allowed to resolve final overlaps
    const pos = new Float32Array((frames + extra + 1) * n * 2);
    const dt = 1 / FPS;
    const write = (f) => balls.forEach((b, i) => {
      pos[(f * n + i) * 2] = b.x;
      pos[(f * n + i) * 2 + 1] = b.y;
    });
    write(0);
    let endFrame = frames;
    for (let f = 1; f <= frames + extra; f++) {
      for (const b of balls) {
        b.a += rng.range(-1, 1) * wander * dt;
        if (turnRate && rng.chance(turnRate * dt)) b.a += rng.range(0.8, 2.2) * (rng.chance(0.5) ? 1 : -1);
        b.x += Math.cos(b.a) * b.s * dt;
        b.y += Math.sin(b.a) * b.s * dt;
        if (b.x < R) { b.x = R; b.a = Math.PI - b.a; }
        if (b.x > W - R) { b.x = W - R; b.a = Math.PI - b.a; }
        if (b.y < R) { b.y = R; b.a = -b.a; }
        if (b.y > H - R) { b.y = H - R; b.a = -b.a; }
      }
      write(f);
      if (f >= frames && this.separated(balls)) {
        endFrame = f;
        break;
      }
      endFrame = f;
    }
    const targetIdx = rng.sample([...Array(n).keys()], targets);
    return { n, targets: targetIdx, pos, endFrame, duration: (endFrame / FPS) * 1000, blink, final: balls.map((b) => ({ x: b.x, y: b.y })) };
  }

  separated(balls) {
    for (let i = 0; i < balls.length; i++)
      for (let j = i + 1; j < balls.length; j++)
        if (Math.hypot(balls[i].x - balls[j].x, balls[i].y - balls[j].y) < R * 2.5) return false;
    return true;
  }

  validate() {
    return this.rounds.every((r) => r.final.length === r.n && this.separated(r.final));
  }

  async run() {
    for (let i = 0; i < this.rounds.length; i++) {
      this.setProgress(i, this.rounds.length);
      await this.playRound(this.rounds[i]);
      await this.wait(900);
    }
    this.setProgress(this.rounds.length, this.rounds.length);
  }

  async playRound(r) {
    this.clearStage('stage-trace');
    const wrap = h('div.trace-wrap');
    const canvas = h('canvas.trace-canvas', { 'aria-label': t('trace.aria') });
    wrap.append(canvas);
    this.stage.append(wrap);
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = Math.min(this.stage.clientWidth || 600, 680);
    const cssH = cssW * H;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const S = canvas.width; // scale: arena width 1 -> pixels
    const rad = R * S;

    const state = { selected: [], reveal: false, labels: false };
    const at = (f) => {
      const out = [];
      for (let i = 0; i < r.n; i++) out.push({ x: r.pos[(f * r.n + i) * 2] * S, y: r.pos[(f * r.n + i) * 2 + 1] * S });
      return out;
    };

    const draw = (f, { cue = 0, hidden = false } = {}) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (hidden) return;
      const pts = at(f);
      pts.forEach((p, i) => {
        const isTarget = r.targets.includes(i);
        const sel = state.selected.includes(i);
        let fill = '#dfe7ff';
        let ring = null;
        if (cue && isTarget) {
          fill = '#ff4fd8';
          ring = `rgba(255,79,216,${0.35 + 0.35 * Math.sin(cue)})`;
        }
        if (state.reveal) {
          if (isTarget) ring = '#3dff7a';
          if (sel && !isTarget) ring = '#ff4d6d';
        } else if (sel) ring = '#2ee6ff';
        const g = ctx.createRadialGradient(p.x - rad * 0.3, p.y - rad * 0.3, rad * 0.1, p.x, p.y, rad);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(1, fill);
        ctx.beginPath();
        ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.shadowColor = fill;
        ctx.shadowBlur = rad * 0.8;
        ctx.fill();
        ctx.shadowBlur = 0;
        if (ring) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, rad * 1.45, 0, Math.PI * 2);
          ctx.strokeStyle = ring;
          ctx.lineWidth = rad * 0.28;
          ctx.stroke();
        }
        if (state.labels) {
          ctx.fillStyle = '#05060f';
          ctx.font = `700 ${Math.round(rad * 0.95)}px JetBrains Mono, monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(LABELS[i], p.x, p.y + 1);
        }
      });
    };

    // 1) Cue phase
    this.setPrompt(t(r.targets.length > 1 ? 'trace.cueMany' : 'trace.cueOne', { n: r.targets.length }));
    const cueStart = now();
    await new Promise((resolve) => {
      const loop = () => {
        const el = now() - cueStart;
        draw(0, { cue: el / 90 });
        if (el < 1800) this.frame(loop);
        else resolve();
      };
      this.frame(loop);
    });
    // 2) Motion
    this.setPrompt(t('trace.follow'));
    const t0 = now();
    await new Promise((resolve) => {
      const loop = () => {
        const el = now() - t0;
        const f = Math.min(r.endFrame, Math.floor((el / 1000) * FPS));
        const hidden = r.blink && el >= r.blink.at && el < r.blink.at + r.blink.dur;
        draw(f, { hidden });
        if (f < r.endFrame) this.frame(loop);
        else resolve();
      };
      this.frame(loop);
    });
    // 3) Answer
    state.labels = true;
    draw(r.endFrame);
    this.setPrompt(t(r.targets.length > 1 ? 'trace.pickMany' : 'trace.pickOne', { n: r.targets.length }));
    const final = at(r.endFrame);
    const tAsk = now();
    await new Promise((resolve) => {
      const choose = (i) => {
        if (i < 0 || state.selected.includes(i) || state.reveal) return;
        state.selected.push(i);
        const rt = now() - tAsk;
        const correct = r.targets.includes(i);
        draw(r.endFrame);
        if (state.selected.length >= r.targets.length) {
          state.reveal = true;
          canvas.style.cursor = 'default';
          draw(r.endFrame);
        }
        this.recordTrial({ correct, rt, targetTime: 3500, answerLabel: t('ui.shownOnBoard'), feedback: state.reveal ? 'full' : 'mini' });
        if (state.reveal) {
          this._keyHandler = null;
          resolve();
        }
      };
      canvas.addEventListener('pointerdown', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
        const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
        let best = -1;
        let bestD = rad * 1.9;
        final.forEach((p, i) => {
          const dd = Math.hypot(p.x - x, p.y - y);
          if (dd < bestD) { bestD = dd; best = i; }
        });
        choose(best);
      });
      this._keyHandler = (input) => {
        if (input.type !== 'key') return;
        const idx = LABELS.indexOf(String(input.key).toUpperCase());
        if (idx >= 0 && idx < r.n) choose(idx);
      };
    });
  }
}
