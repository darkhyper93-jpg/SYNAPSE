// NEXUS — combined challenge (memory + logic): memorise a grid, then answer
// relational questions about it under time pressure.
import { Challenge } from '../engine/challenge.js';
import { byDiff } from '../utils/math.js';
import { BASIC_SHAPES, pickColors } from '../data/visuals.js';
import { board, drainBar, sym, inlineSym, colorOption } from './common.js';
import { t } from '../game/i18n.js';

const DIRS = { right: [0, 1], left: [0, -1], above: [-1, 0], below: [1, 0] };

export class NexusChallenge extends Challenge {
  static meta = {
    id: 'nexus',
    skill: 'memory',
    secondary: 'logic',
    targetTime: 3000,
    minRating: 40,
    unlockSkills: ['memory', 'logic'],
  };

  generate() {
    this.rounds = [this.makeRound(), this.makeRound()];
  }

  makeRound() {
    const d = this.difficulty;
    const rng = this.rng;
    const rows = 3;
    const cols = d < 0.6 ? 3 : 4;
    const n = Math.min(8, byDiff(d, 6, 8));
    const shapes = rng.sample(BASIC_SHAPES, n);
    const colors = pickColors(rng, d < 0.5 ? 3 : 4, Math.min(d, 0.6));
    const cells = rng.sample([...Array(rows * cols).keys()], n);
    const items = cells.map((cell, i) => ({ cell, r: Math.floor(cell / cols), c: cell % cols, shape: shapes[i], color: rng.pick(colors) }));
    const kinds = rng.shuffle(['neighbor', 'rowCount', 'relation']);
    const questions = [];
    for (const k of kinds) {
      if (questions.length >= 2) break;
      const q = this[`q_${k}`](items, rows, cols, colors);
      if (q) questions.push(q);
    }
    return { rows, cols, items, questions, exposure: byDiff(d, 3400, 1900), limit: byDiff(d, 7000, 3800) };
  }

  q_neighbor(items, rows, cols, colors) {
    const rng = this.rng;
    for (const it of rng.shuffle(items)) {
      for (const dir of rng.shuffle(Object.keys(DIRS))) {
        const [dr, dc] = DIRS[dir];
        const nb = items.find((x) => x.r === it.r + dr && x.c === it.c + dc);
        if (nb) {
          // lures from the colours actually on the board first: "never seen" must not give it away
          const lure = [...new Set([...rng.shuffle(colors), ...pickColors(rng, 4, 0)])].filter((c) => c !== nb.color);
          return { kind: 'neighbor', ref: it, dir, answer: nb.color, options: rng.shuffle([nb.color, ...lure.slice(0, 3)]) };
        }
      }
    }
    return null;
  }

  q_rowCount(items, rows, cols, colors) {
    const rng = this.rng;
    const row = rng.int(0, rows - 1);
    // mostly a colour that is in that row, so "0" is not the safe bet
    const inRow = items.filter((x) => x.r === row).map((x) => x.color);
    const color = inRow.length && rng.chance(0.75) ? rng.pick(inRow) : rng.pick(colors);
    const answer = items.filter((x) => x.r === row && x.color === color).length;
    const start = answer - rng.int(0, Math.min(3, answer));
    return { kind: 'rowCount', row, color, answer, options: [start, start + 1, start + 2, start + 3] };
  }

  q_relation(items) {
    const rng = this.rng;
    const axis = rng.pick(['left', 'above']);
    const pool = rng.shuffle(items);
    for (let i = 0; i < pool.length; i++)
      for (let j = i + 1; j < pool.length; j++) {
        const a = pool[i];
        const b = pool[j];
        if (axis === 'left' && a.c !== b.c) return { kind: 'relation', axis, a, b, answer: a.c < b.c ? 'a' : 'b' };
        if (axis === 'above' && a.r !== b.r) return { kind: 'relation', axis, a, b, answer: a.r < b.r ? 'a' : 'b' };
      }
    return null;
  }

  validate() {
    return this.rounds.every((r) => {
      if (r.questions.length < 2) return false;
      if (new Set(r.items.map((i) => i.shape)).size !== r.items.length) return false;
      return r.questions.every((q) => {
        if (q.kind === 'neighbor') return new Set(q.options).size === 4 && q.options.includes(q.answer);
        if (q.kind === 'rowCount') return q.options.includes(q.answer);
        return true;
      });
    });
  }

  async run() {
    let k = 0;
    const total = this.rounds.reduce((s, r) => s + r.questions.length, 0);
    for (const r of this.rounds) {
      this.clearStage('stage-nexus');
      this.setPrompt(`<span class="prompt-eye">◉</span> ${t('nexus.memorize')}`);
      this.stage.append(board(r.rows, r.cols, (i) => {
        const it = r.items.find((x) => x.cell === i);
        return it ? sym(it, this.settings) : '';
      }, { cls: 'is-reveal' }), drainBar(r.exposure));
      await this.wait(r.exposure);
      this.clearStage('stage-nexus');
      this.stage.append(board(r.rows, r.cols, () => '', { cls: 'is-blank' }));
      await this.wait(400);
      for (const q of r.questions) {
        this.setProgress(k++, total);
        this.clearStage('stage-nexus');
        await this.ask(q, r);
        await this.wait(800);
      }
    }
    this.setProgress(total, total);
  }

  async ask(q, r) {
    const neutral = (it) => inlineSym({ shape: it.shape, color: '#e8ecff' }, {});
    if (q.kind === 'neighbor') {
      this.setPrompt(t('nexus.neighbor', { dir: t(`nexus.dir.${q.dir}`), sym: neutral(q.ref) }));
      await this.askOptions({ options: q.options.map((c) => colorOption(c, this.settings)), correctValue: q.answer, timeLimit: r.limit });
    } else if (q.kind === 'rowCount') {
      this.setPrompt(t('nexus.rowCount', { color: `<b>${t(`adj.${q.color}`)}</b>`, row: t(`nexus.row.${q.row}`) }));
      await this.askOptions({ options: q.options.map((v) => ({ value: v, label: String(v), html: `<span class="big-num">${v}</span>` })), correctValue: q.answer, timeLimit: r.limit });
    } else {
      this.setPrompt(t(`nexus.rel.${q.axis}`));
      await this.askOptions({
        options: [
          { value: 'a', label: t(`shape.${q.a.shape}`), html: neutral(q.a) },
          { value: 'b', label: t(`shape.${q.b.shape}`), html: neutral(q.b) },
        ],
        correctValue: q.answer,
        timeLimit: r.limit,
        cols: 2,
      });
    }
  }
}
