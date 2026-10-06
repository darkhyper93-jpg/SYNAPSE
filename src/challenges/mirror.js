// MIRROR — spatial transformations: reflections, rotations, colour swaps and combinations.
import { Challenge } from '../engine/challenge.js';
import { byDiff } from '../utils/math.js';
import { pickColors, COLORS } from '../data/visuals.js';
import { h } from '../utils/dom.js';
import { t } from '../game/i18n.js';

// grid: array of rows; cell = { c: 0|1|2, dir: null|0..3 } (dir: 0 up, 1 right, 2 down, 3 left)
const mapDir = (g, fn) => g.map((row) => row.map((x) => ({ c: x.c, dir: x.dir == null ? null : fn(x.dir) })));
const OPS = {
  flipH: (g) => mapDir(g.map((row) => row.slice().reverse()), (d) => (d === 1 ? 3 : d === 3 ? 1 : d)),
  flipV: (g) => mapDir(g.slice().reverse(), (d) => (d === 0 ? 2 : d === 2 ? 0 : d)),
  rot90: (g) => mapDir(g[0].map((_, c) => g.map((row) => row[c]).reverse()), (d) => (d + 1) % 4),
  rot180: (g) => OPS.rot90(OPS.rot90(g)),
  rot270: (g) => OPS.rot90(OPS.rot180(g)),
  swap: (g) => g.map((row) => row.map((x) => ({ ...x, c: x.c === 1 ? 2 : x.c === 2 ? 1 : 0 }))),
};
export const applyOps = (g, ops) => ops.reduce((acc, op) => OPS[op](acc), g);
export const serialize = (g) => g.map((row) => row.map((x) => `${x.c}${x.dir ?? '-'}`).join('')).join('/');

const LEVELS = [
  ['flipH', 'flipV'],
  ['flipH', 'flipV', 'rot90', 'rot180'],
  ['flipH', 'flipV', 'rot90', 'rot180', 'rot270', 'swap'],
  ['flipH', 'flipV', 'rot90', 'rot270', 'rot90+flipH', 'rot180+swap', 'flipV+swap', 'rot270+flipV'],
];
const DIHEDRAL = [[], ['rot90'], ['rot180'], ['rot270'], ['flipH'], ['flipV'], ['rot90', 'flipH'], ['rot90', 'flipV']];

export class MirrorChallenge extends Challenge {
  static meta = { id: 'mirror', skill: 'spatial', targetTime: 5200 };

  generate() {
    this.rounds = [];
    for (let i = 0; i < 3; i++) this.rounds.push(this.validRound(this.rounds[i - 1]?.transform));
  }

  /** Round-level retries keep generation cheap; validate() re-checks everything. */
  validRound(avoid) {
    let r;
    for (let k = 0; k < 60; k++) {
      r = this.makeRound(avoid);
      if (this.roundValid(r)) return r;
    }
    return r;
  }

  makeRound(avoid) {
    const d = this.difficulty;
    const rng = this.rng;
    const n = d < 0.35 ? 3 : d < 0.7 ? 4 : 5;
    const levelOps = LEVELS[Math.min(3, Math.floor(d * 4))];
    const transform = rng.pick(levelOps.filter((x) => x !== avoid));
    const needsSwap = transform.includes('swap');
    const twoColors = needsSwap || d >= 0.3;
    const arrows = d >= 0.5;
    const fill = 0.38 + 0.15 * d;
    const grid = Array.from({ length: n }, () =>
      Array.from({ length: n }, () => {
        if (!rng.chance(fill)) return { c: 0, dir: null };
        return { c: twoColors ? rng.int(1, 2) : 1, dir: arrows && rng.chance(0.35) ? rng.int(0, 3) : null };
      }),
    );
    const ops = transform.split('+');
    const correct = applyOps(grid, ops);

    // Distractors: other plausible transformations, then near-misses.
    const pool = rng.shuffle(levelOps.concat(['flipH', 'flipV', 'rot90', 'rot180', 'rot270']).filter((x) => x !== transform));
    const seen = new Set([serialize(correct)]);
    const distractors = [];
    for (const tr of pool) {
      if (distractors.length >= (d < 0.6 ? 3 : 2)) break;
      const g = applyOps(grid, tr.split('+'));
      const s = serialize(g);
      if (!seen.has(s)) {
        seen.add(s);
        distractors.push(g);
      }
    }
    let guard = 0;
    while (distractors.length < 3 && guard++ < 40) {
      const g = correct.map((row) => row.map((x) => ({ ...x })));
      const r = rng.int(0, n - 1);
      const c = rng.int(0, n - 1);
      const cell = g[r][c];
      if (cell.dir != null && rng.chance(0.5)) cell.dir = (cell.dir + 2) % 4;
      else cell.c = cell.c ? 0 : twoColors ? rng.int(1, 2) : 1;
      if (cell.c === 0) cell.dir = null;
      const s = serialize(g);
      if (!seen.has(s)) {
        seen.add(s);
        distractors.push(g);
      }
    }
    const options = rng.shuffle([{ g: correct, ok: true }, ...distractors.map((g) => ({ g, ok: false }))]);
    const colors = pickColors(rng, 2, 0);
    return { n, grid, transform, options, colors, correctIndex: options.findIndex((o) => o.ok) };
  }

  validate() {
    return this.rounds.length === 3 && this.rounds.every((r) => this.roundValid(r));
  }

  roundValid(r) {
    const filled = r.grid.flat().filter((x) => x.c).length;
    if (filled < 3) return false;
    // No symmetry: all 8 dihedral images differ, so every transformation is distinguishable.
    const imgs = new Set(DIHEDRAL.map((ops) => serialize(applyOps(r.grid, ops))));
    if (imgs.size !== 8) return false;
    if (r.transform.includes('swap') && !r.grid.flat().some((x) => x.c === 2)) return false;
    if (serialize(r.options[r.correctIndex].g) === serialize(r.grid)) return false;
    return r.options.length === 4 && new Set(r.options.map((o) => serialize(o.g))).size === 4;
  }

  gridEl(g, colors, cls = '') {
    const el = h(`div.mgrid${cls ? '.' + cls : ''}`);
    el.style.setProperty('--n', g.length);
    for (const row of g)
      for (const x of row) {
        const cell = h('span.mcell');
        if (x.c) {
          cell.classList.add('is-on');
          cell.style.setProperty('--c', COLORS[colors[x.c - 1]].hex);
          if (this.settings.colorAssist) cell.dataset.glyph = x.c === 1 ? '●' : '■';
        }
        if (x.dir != null) cell.append(h('i.arrow', { style: { transform: `rotate(${x.dir * 90}deg)` } }));
        el.append(cell);
      }
    return el;
  }

  async run() {
    for (let i = 0; i < this.rounds.length; i++) {
      this.setProgress(i, this.rounds.length);
      const r = this.rounds[i];
      this.clearStage('stage-mirror');
      this.setPrompt(t('mirror.prompt', { op: `<b class="op">${t(`mirror.op.${r.transform}`)}</b>` }));
      const top = h('div.mirror-top', this.gridEl(r.grid, r.colors, 'is-source'), h('div.mirror-op', { html: opIcon(r.transform) }));
      this.stage.append(top);
      await this.askOptions({
        options: r.options.map((o, k) => ({ value: k, label: t('ui.option', { n: k + 1 }), html: this.gridEl(o.g, r.colors).outerHTML })),
        correctValue: r.correctIndex,
        timeLimit: byDiff(this.difficulty, 22000, 13000),
        className: 'is-grids',
        trial: { answerLabel: t('ui.optionN', { n: r.correctIndex + 1 }) },
      });
      await this.wait(1000);
    }
    this.setProgress(this.rounds.length, this.rounds.length);
  }
}

function opIcon(op) {
  const icons = { flipH: '⇆', flipV: '⇅', rot90: '↻ 90°', rot180: '↻ 180°', rot270: '↺ 90°', swap: '◐' };
  return op
    .split('+')
    .map((o) => `<span>${icons[o]}</span>`)
    .join('<i>+</i>');
}
