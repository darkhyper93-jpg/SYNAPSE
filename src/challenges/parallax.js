// PARALLAX — 3D mental rotation with isometric polycubes.
// Fairness: distractors are verified NOT to be rotations of the reference shape
// (canonical form over the 24 cube rotations), and options are mutually distinct.
import { Challenge } from '../engine/challenge.js';
import { byDiff } from '../utils/math.js';
import { t } from '../game/i18n.js';
import { h } from '../utils/dom.js';

const NEIGH = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

// 24 proper rotation matrices of the cube.
const ROTATIONS = (() => {
  const mul = (a, b) => a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
  const RX = [[1, 0, 0], [0, 0, -1], [0, 1, 0]];
  const RY = [[0, 0, 1], [0, 1, 0], [-1, 0, 0]];
  const RZ = [[0, -1, 0], [1, 0, 0], [0, 0, 1]];
  const seen = new Map();
  const queue = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]]];
  while (queue.length) {
    const m = queue.shift();
    const k = m.flat().join(',');
    if (seen.has(k)) continue;
    seen.set(k, m);
    for (const r of [RX, RY, RZ]) queue.push(mul(r, m));
  }
  return [...seen.values()];
})();
const Z_ROTATIONS = ROTATIONS.filter((m) => m[2][2] === 1);

const apply = (m, [x, y, z]) => [
  m[0][0] * x + m[0][1] * y + m[0][2] * z,
  m[1][0] * x + m[1][1] * y + m[1][2] * z,
  m[2][0] * x + m[2][1] * y + m[2][2] * z,
];

export function normalize(cubes) {
  const min = [0, 1, 2].map((i) => Math.min(...cubes.map((c) => c[i])));
  return cubes.map((c) => c.map((v, i) => v - min[i])).sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
}
const key = (cubes) => normalize(cubes).map((c) => c.join(',')).join(';');
export const canonical = (cubes) => ROTATIONS.map((m) => key(cubes.map((c) => apply(m, c)))).sort()[0];
const mirror = (cubes) => cubes.map(([x, y, z]) => [-x, y, z]);
const connected = (cubes) => {
  const set = new Set(cubes.map((c) => c.join(',')));
  const seen = new Set([cubes[0].join(',')]);
  const stack = [cubes[0]];
  while (stack.length) {
    const c = stack.pop();
    for (const n of NEIGH) {
      const k = [c[0] + n[0], c[1] + n[1], c[2] + n[2]].join(',');
      if (set.has(k) && !seen.has(k)) {
        seen.add(k);
        stack.push(k.split(',').map(Number));
      }
    }
  }
  return seen.size === cubes.length;
};

/**
 * Rasterise the isometric view on the triangular lattice (painter's algorithm) and return,
 * per cube, how many lattice triangles remain visible + a signature of the whole picture.
 * Used to reject shapes with hidden cubes or options that would look identical.
 */
export function isoVisibility(cubes) {
  const cs = normalize(cubes);
  const P = (x, y, z) => [(x - y) * 0.8660254, (x + y) * 0.5 - z];
  const tri = (a, b, c) => {
    const pa = P(...a), pb = P(...b), pc = P(...c);
    return `${((pa[0] + pb[0] + pc[0]) / 3).toFixed(2)},${((pa[1] + pb[1] + pc[1]) / 3).toFixed(2)}`;
  };
  const owner = new Map();
  cs.map((c, i) => [c, i])
    .sort((a, b) => a[0][0] + a[0][1] + a[0][2] - (b[0][0] + b[0][1] + b[0][2]) || a[0][2] - b[0][2])
    .forEach(([[x, y, z], i]) => {
      const top = [[x, y, z + 1], [x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x, y + 1, z + 1]];
      const right = [[x + 1, y, z], [x + 1, y + 1, z], [x + 1, y + 1, z + 1], [x + 1, y, z + 1]];
      const left = [[x, y + 1, z], [x + 1, y + 1, z], [x + 1, y + 1, z + 1], [x, y + 1, z + 1]];
      [[top, 't'], [right, 'r'], [left, 'l']].forEach(([q, f]) => {
        owner.set(tri(q[0], q[1], q[2]), { i, f });
        owner.set(tri(q[0], q[2], q[3]), { i, f });
      });
    });
  const counts = new Array(cs.length).fill(0);
  owner.forEach(({ i }) => counts[i]++);
  const signature = [...owner.entries()].map(([k, v]) => `${k}${v.f}`).sort().join('|');
  // The drawing as the player sees it, wherever it sits: isometric depth can make two different
  // 3D shapes draw the very same picture, just shifted.
  const pts = [...owner.entries()].map(([k, v]) => [...k.split(',').map(Number), v.f]);
  const mx = Math.min(...pts.map((p) => p[0]));
  const my = Math.min(...pts.map((p) => p[1]));
  const picture = pts.map(([x, y, f]) => `${(x - mx).toFixed(2)},${(y - my).toFixed(2)}${f}`).sort().join('|');
  return { counts, signature, picture };
}

const spans = (cubes) => [0, 1, 2].filter((i) => new Set(cubes.map((c) => c[i])).size > 1).length;

export class ParallaxChallenge extends Challenge {
  static meta = { id: 'parallax', skill: 'spatial', targetTime: 6500 };

  generate() {
    this.rounds = [0, 1, 2].map(() => {
      let r;
      for (let k = 0; k < 30; k++) {
        r = this.makeRound();
        if (this.roundValid(r)) break;
      }
      return r;
    });
  }

  /** Shepard–Metzler-like arms: straight segments joined by right-angle turns. */
  growShape(k) {
    const rng = this.rng;
    const cubes = [[0, 0, 0]];
    const set = new Set(['0,0,0']);
    let pos = [0, 0, 0];
    let dir = rng.pick(NEIGH);
    let guard = 0;
    while (cubes.length < k && guard++ < 60) {
      const seg = rng.int(1, 2);
      for (let i = 0; i < seg && cubes.length < k; i++) {
        const c = [pos[0] + dir[0], pos[1] + dir[1], pos[2] + dir[2]];
        const kk = c.join(',');
        if (set.has(kk) || c.some((v) => Math.abs(v) > 2)) break;
        cubes.push(c);
        set.add(kk);
        pos = c;
      }
      const perp = NEIGH.filter((n) => n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2] === 0);
      dir = rng.pick(perp);
    }
    return cubes;
  }

  /** Apply a random rotation from `pool` that leaves every cube visible on screen. */
  orient(cubes, pool) {
    for (const m of this.rng.shuffle(pool)) {
      const r = cubes.map((c) => apply(m, c));
      if (isoVisibility(r).counts.every((c) => c >= 2)) return r;
    }
    return null;
  }

  makeRound() {
    const d = this.difficulty;
    const rng = this.rng;
    const k = byDiff(d, 4, 7);
    const shape = this.orient(this.growShape(k), ROTATIONS) || this.growShape(k);
    const canon = canonical(shape);
    const mirrorCanon = canonical(mirror(shape));
    // Easy: rotation around the vertical axis only. Hard: any rotation.
    const rotPool = (d < 0.4 ? Z_ROTATIONS : ROTATIONS).filter((m) => key(shape.map((c) => apply(m, c))) !== key(shape));
    const answer = this.orient(shape, rotPool) || shape;

    const distractors = [];
    const seen = new Set([canon]);
    if (d >= 0.35 && mirrorCanon !== canon) {
      const m = this.orient(mirror(shape), rotPool);
      if (m) {
        distractors.push(m);
        seen.add(mirrorCanon);
      }
    }
    let guard = 0;
    while (distractors.length < 3 && guard++ < 200) {
      // Move one cube somewhere else, keeping it connected.
      const s = shape.map((c) => c.slice());
      s.splice(rng.int(0, s.length - 1), 1);
      if (!s.length || !connected(s)) continue;
      const base = rng.pick(s);
      const n = rng.pick(NEIGH);
      const c = [base[0] + n[0], base[1] + n[1], base[2] + n[2]];
      if (s.some((x) => x.join(',') === c.join(','))) continue;
      s.push(c);
      const cn = canonical(s);
      if (seen.has(cn)) continue;
      const o = this.orient(s, d < 0.4 ? Z_ROTATIONS : ROTATIONS);
      if (!o) continue;
      seen.add(cn);
      distractors.push(o);
    }
    const options = rng.shuffle([{ cubes: answer, ok: true }, ...distractors.map((c) => ({ cubes: c, ok: false }))]);
    return { shape, options, correctIndex: options.findIndex((o) => o.ok), hue: rng.pick([200, 265, 300, 170, 30]) };
  }

  validate() {
    return this.rounds.every((r) => this.roundValid(r));
  }

  roundValid(r) {
    if (r.options.length !== 4 || r.correctIndex < 0) return false;
    if (spans(r.shape) < (this.difficulty >= 0.5 ? 3 : 2)) return false;
    // Every cube visible (≥ 2 lattice triangles) in the reference and in every option.
    const views = [r.shape, ...r.options.map((o) => o.cubes)].map(isoVisibility);
    if (views.some((v) => v.counts.some((c) => c < 2))) return false;
    // Options must not look identical on screen…
    const pics = views.map((v) => v.picture);
    if (new Set(pics.slice(1)).size !== 4) return false;
    // …the right one must really be turned (not a copy of the reference picture),
    // and no wrong one may draw exactly like the reference.
    if (pics.slice(1).some((p) => p === pics[0])) return false;
    const canon = canonical(r.shape);
    const canons = r.options.map((o) => canonical(o.cubes));
    // Exactly one option is a rotation of the reference.
    if (canons.filter((c) => c === canon).length !== 1 || canons[r.correctIndex] !== canon) return false;
    return new Set(canons).size === 4;
  }

  async run() {
    for (let i = 0; i < this.rounds.length; i++) {
      this.setProgress(i, this.rounds.length);
      const r = this.rounds[i];
      this.clearStage('stage-parallax');
      this.setPrompt(t('parallax.prompt'));
      this.stage.append(h('div.parallax-ref', { html: isoSVG(r.shape, r.hue, 1) }));
      await this.askOptions({
        options: r.options.map((o, k) => ({ value: k, label: t('ui.option', { n: k + 1 }), html: isoSVG(o.cubes, r.hue, 0.8) })),
        correctValue: r.correctIndex,
        timeLimit: byDiff(this.difficulty, 26000, 15000),
        className: 'is-iso',
        trial: { answerLabel: t('ui.optionN', { n: r.correctIndex + 1 }) },
      });
      await this.wait(1000);
    }
    this.setProgress(this.rounds.length, this.rounds.length);
  }
}

/** Isometric SVG of a set of unit cubes. */
export function isoSVG(cubes, hue = 200) {
  const cs = normalize(cubes);
  const s = 20;
  const cos = Math.cos(Math.PI / 6) * s;
  const sin = Math.sin(Math.PI / 6) * s;
  const P = (x, y, z) => [(x - y) * cos, (x + y) * sin - z * s];
  const faces = [];
  // painter's order: far (small x+y+z) to near
  cs.slice()
    .sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]) || a[2] - b[2])
    .forEach(([x, y, z]) => {
      const top = [P(x, y, z + 1), P(x + 1, y, z + 1), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)];
      const right = [P(x + 1, y, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x + 1, y, z + 1)];
      const left = [P(x, y + 1, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)];
      faces.push({ pts: top, fill: `hsl(${hue} 95% 72%)` });
      faces.push({ pts: right, fill: `hsl(${hue} 85% 52%)` });
      faces.push({ pts: left, fill: `hsl(${hue} 80% 36%)` });
    });
  const all = faces.flatMap((f) => f.pts);
  const minX = Math.min(...all.map((p) => p[0])) - 4;
  const maxX = Math.max(...all.map((p) => p[0])) + 4;
  const minY = Math.min(...all.map((p) => p[1])) - 4;
  const maxY = Math.max(...all.map((p) => p[1])) + 4;
  // fixed-size viewbox so all options share a scale
  const size = Math.max(maxX - minX, maxY - minY, 120);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const polys = faces
    .map((f) => `<polygon points="${f.pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="${f.fill}" stroke="rgba(5,6,15,.85)" stroke-width="1.2" stroke-linejoin="round"/>`)
    .join('');
  return `<svg class="iso" viewBox="${(cx - size / 2).toFixed(1)} ${(cy - size / 2).toFixed(1)} ${size.toFixed(1)} ${size.toFixed(1)}" aria-hidden="true">${polys}</svg>`;
}
