// ONE SECOND — ultra-short exposure, dense information (perception / iconic memory).
import { Challenge } from '../engine/challenge.js';
import { byDiff, stepDiff, clamp } from '../utils/math.js';
import { pickShapes, pickColors, COLORS } from '../data/visuals.js';
import { board, noiseMask, sym, symbolOption, CORNERS, cornerIndex } from './common.js';
import { t } from '../game/i18n.js';

const GRIDS = [
  [3, 3],
  [3, 4],
  [4, 4],
  [4, 5],
];

export class OneSecondChallenge extends Challenge {
  static meta = { id: 'onesecond', skill: 'perception', targetTime: 2600 };

  generate() {
    const d = this.difficulty;
    const kinds = ['corner', 'count', 'digit'];
    if (d >= 0.35) kinds.push('majority');
    const order = this.rng.shuffle(kinds).slice(0, 3);
    this.rounds = order.map((k) => this.makeRound(k));
  }

  makeRound(kind) {
    const d = this.difficulty;
    const rng = this.rng;
    const [rows, cols] = stepDiff(d, GRIDS);
    const n = rows * cols;
    const exposure = byDiff(d, 1000, 250);
    const count = clamp(Math.round(n * (0.6 + 0.3 * d)), 6, n);
    const cells = rng.sample([...Array(n).keys()], count);
    const shapes = pickShapes(rng, byDiff(d, 4, 7), d);
    const colors = pickColors(rng, byDiff(d, 3, 5), d);
    const digitCount = kind === 'digit' ? rng.int(1, byDiff(d, 1, 3)) : rng.int(0, byDiff(d, 1, 3));
    const digits = rng.sample([1, 2, 3, 4, 5, 6, 7, 8, 9], digitCount);
    const items = cells.map((cell, i) =>
      i < digitCount
        ? { cell, digit: digits[i], color: rng.pick(colors) }
        : { cell, shape: rng.pick(shapes), color: rng.pick(colors) },
    );

    const round = { kind, rows, cols, exposure, items };
    if (kind === 'corner') {
      const corner = rng.pick(CORNERS);
      const ci = cornerIndex(corner, rows, cols);
      // Make sure the corner holds a symbol.
      let it = items.find((x) => x.cell === ci);
      if (!it) {
        it = { cell: ci, shape: rng.pick(shapes), color: rng.pick(colors) };
        items.push(it);
      } else if (it.digit) {
        delete it.digit;
        it.shape = rng.pick(shapes);
      }
      const lures = [];
      const pool = rng.shuffle(items.filter((x) => x.shape && !(x.shape === it.shape && x.color === it.color)));
      for (const x of pool) if (lures.length < 3 && !lures.some((l) => l.shape === x.shape && l.color === x.color)) lures.push(x);
      while (lures.length < 3) {
        const x = { shape: rng.pick(shapes), color: rng.pick(Object.keys(COLORS)) };
        if (!(x.shape === it.shape && x.color === it.color) && !lures.some((l) => l.shape === x.shape && l.color === x.color)) lures.push(x);
      }
      Object.assign(round, { corner, target: it, options: rng.shuffle([it, ...lures]) });
    } else if (kind === 'count') {
      const color = rng.pick(colors);
      const other = () => rng.pick(colors.filter((c) => c !== color));
      // "Items" are the symbols: a digit never wears the asked colour, so there is one answer.
      items.forEach((x) => x.digit && x.color === color && (x.color = other()));
      // Keep the answer small enough to subitize/estimate (and sometimes none at all).
      // at most 4: what a glance of 250 ms can count (subitizing); more would be a guess
      const want = rng.chance(0.1) ? 0 : rng.int(1, byDiff(d, 3, 4));
      let have = items.filter((x) => x.color === color);
      if (!have.length && want) {
        const x = rng.pick(items.filter((i) => i.shape));
        x.color = color;
        have = [x];
      }
      while (have.length > want) have.pop().color = other();
      const answer = items.filter((x) => x.color === color).length;
      // the right number can sit on any of the four buttons
      const start = answer - rng.int(0, Math.min(3, answer));
      Object.assign(round, { color, answer, options: [start, start + 1, start + 2, start + 3] });
    } else if (kind === 'digit') {
      const present = items.filter((x) => x.digit).map((x) => x.digit);
      const answer = rng.pick(present);
      const absent = rng.sample([1, 2, 3, 4, 5, 6, 7, 8, 9].filter((v) => !present.includes(v)), 3);
      Object.assign(round, { answer, options: rng.shuffle([answer, ...absent]) });
    } else {
      // majority shape: force a clear winner
      const margin = 2; // a one-symbol lead among up to 7 shapes can't be seen in a flash
      const symItems = items.filter((x) => x.shape);
      const winner = rng.pick(shapes);
      const counts = () => {
        const c = {};
        symItems.forEach((x) => (c[x.shape] = (c[x.shape] || 0) + 1));
        return c;
      };
      let guard = 0;
      while (guard++ < 40) {
        const c = counts();
        const others = Object.entries(c).filter(([s]) => s !== winner).map(([, v]) => v);
        const best = Math.max(0, ...others);
        if ((c[winner] || 0) >= best + margin) break;
        const victim = symItems.find((x) => x.shape !== winner && c[x.shape] === best);
        if (!victim) break;
        victim.shape = winner;
      }
      const present = [...new Set(symItems.map((x) => x.shape))].filter((s) => s !== winner);
      const fill = shapes.filter((s) => s !== winner && !present.includes(s));
      const lureShapes = rng.shuffle([...present, ...fill]).slice(0, 3);
      Object.assign(round, { answer: winner, options: rng.shuffle([winner, ...lureShapes]), margin });
    }
    return round;
  }

  validate() {
    for (const r of this.rounds) {
      if (new Set(r.items.map((i) => i.cell)).size !== r.items.length) return false;
      if (r.kind === 'corner' && new Set(r.options.map((o) => o.shape + o.color)).size !== 4) return false;
      if (r.kind === 'count') {
        if (r.items.filter((x) => x.color === r.color).length !== r.answer) return false;
        if (!r.options.includes(r.answer)) return false;
      }
      if (r.kind === 'digit') {
        const present = r.items.filter((x) => x.digit).map((x) => x.digit);
        if (r.options.filter((o) => present.includes(o)).length !== 1) return false;
      }
      if (r.kind === 'majority') {
        if (new Set(r.options).size !== 4) return false;
        const c = {};
        r.items.filter((x) => x.shape).forEach((x) => (c[x.shape] = (c[x.shape] || 0) + 1));
        const best = Math.max(...Object.entries(c).filter(([s]) => s !== r.answer).map(([, v]) => v), 0);
        if ((c[r.answer] || 0) < best + r.margin) return false;
      }
    }
    return true;
  }

  renderItem(it) {
    if (it.digit) {
      const hex = COLORS[it.color].hex;
      return `<span class="digit" style="--c:${hex}">${it.digit}</span>`;
    }
    return sym(it, this.settings);
  }

  async run() {
    for (let i = 0; i < this.rounds.length; i++) {
      this.setProgress(i, this.rounds.length);
      const r = this.rounds[i];
      this.clearStage('stage-flash');
      this.setPrompt(t('onesecond.ready'));
      const fix = document.createElement('div');
      fix.className = 'fixation';
      fix.textContent = '+';
      this.stage.append(fix);
      await this.wait(700);
      this.clearStage('stage-flash');
      this.setPrompt(`<span class="prompt-flash">${(r.exposure / 1000).toFixed(2)}s</span>`);
      this.stage.append(board(r.rows, r.cols, (c) => {
        const it = r.items.find((x) => x.cell === c);
        return it ? this.renderItem(it) : '';
      }, { cls: 'is-dense' }));
      await this.wait(r.exposure);
      this.clearStage('stage-flash');
      this.stage.append(noiseMask(this.rng.fork('m' + i), r.rows, r.cols));
      await this.wait(180);
      this.clearStage('stage-flash');
      await this.ask(r);
      await this.wait(850);
    }
    this.setProgress(this.rounds.length, this.rounds.length);
  }

  async ask(r) {
    if (r.kind === 'corner') {
      this.setPrompt(t('onesecond.corner', { corner: t(`corner.${r.corner}`) }));
      const mini = board(r.rows, r.cols, (c) => (c === cornerIndex(r.corner, r.rows, r.cols) ? '<span class="cell-marker">?</span>' : ''), { cls: 'is-mini' });
      this.stage.append(mini);
      await this.askOptions({ options: r.options.map((o) => symbolOption(o, this.settings)), correctValue: `${r.target.shape}|${r.target.color}` });
    } else if (r.kind === 'count') {
      this.setPrompt(t('onesecond.count', { color: `<b style="color:${COLORS[r.color].hex}">${t(`adj.${r.color}`)}</b>` }));
      await this.askOptions({ options: r.options.map((v) => ({ value: v, label: String(v), html: `<span class="big-num">${v}</span>` })), correctValue: r.answer });
    } else if (r.kind === 'digit') {
      this.setPrompt(t('onesecond.digit'));
      await this.askOptions({ options: r.options.map((v) => ({ value: v, label: String(v), html: `<span class="big-num">${v}</span>` })), correctValue: r.answer });
    } else {
      this.setPrompt(t('onesecond.majority'));
      await this.askOptions({
        options: r.options.map((s) => ({ value: s, label: t(`shape.${s}`), html: sym({ shape: s, color: '#e8ecff' }, {}) })),
        correctValue: r.answer,
      });
    }
  }
}
