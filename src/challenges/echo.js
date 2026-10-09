// ECHO — visual & working memory.
// Variants: where (position), what (symbol at position), color, order (sequence), change (scene diff).
import { Challenge } from '../engine/challenge.js';
import { byDiff, byDiffF, stepDiff, clamp } from '../utils/math.js';
import { pickShapes, pickColors, BASIC_SHAPES, SHAPES, COLORS, DISTINCT_COLORS } from '../data/visuals.js';
import { board, clickBoard, multiClickBoard, drainBar, noiseMask, sym, inlineSym, symbolOption, colorOption } from './common.js';
import { now } from '../utils/dom.js';
import { t } from '../game/i18n.js';

// A long sequence is worth half a question more (recorded in play_order, counted in pointUnits).
const seqWeight = (len) => (len >= 6 ? 1.5 : 1);

const GRIDS = [
  [2, 3],
  [3, 3],
  [3, 4],
  [4, 4],
  [4, 5],
];

export class EchoChallenge extends Challenge {
  static meta = { id: 'echo', skill: 'memory', targetTime: 2600 };

  generate() {
    const d = this.difficulty;
    const rng = this.rng;
    const variants = ['where', 'what'];
    if (d >= 0.15) variants.push('color');
    if (d >= 0.3) variants.push('order');
    if (d >= 0.45) variants.push('change');
    let pool = rng.shuffle(variants);
    // Higher-level variants are favoured as difficulty grows.
    const picks = [];
    while (picks.length < 3) {
      if (!pool.length) pool = rng.shuffle(variants);
      picks.push(pool.shift());
    }
    this.rounds = picks.map((v) => this.makeRound(v));
  }

  scene(rows, cols, count, { uniqueShapes = false } = {}) {
    const d = this.difficulty;
    const rng = this.rng;
    const shapes = pickShapes(rng, Math.min(8, uniqueShapes ? count : Math.max(4, Math.ceil(count / 2))), d);
    const colors = pickColors(rng, Math.min(5, Math.max(3, Math.ceil(count / 3))), d);
    const cells = rng.sample([...Array(rows * cols).keys()], count);
    const used = new Set();
    const items = [];
    for (const cell of cells) {
      let item;
      let guard = 0;
      do {
        item = uniqueShapes
          ? { cell, shape: shapes[items.length % shapes.length], color: colors[(items.length + guard) % colors.length] }
          : { cell, shape: rng.pick(shapes), color: rng.pick(colors) };
      } while (used.has(item.shape + item.color) && ++guard < 50);
      used.add(item.shape + item.color);
      items.push(item);
    }
    return items;
  }

  makeRound(variant) {
    const d = this.difficulty;
    const rng = this.rng;
    const [rows, cols] = stepDiff(d, GRIDS);
    const cellsN = rows * cols;
    // Visual working memory holds ~4 symbols (the best players ~5): from 3 to 6, so the top level is
    // within reach of the best and harder levels come from shorter looks, longer waits and look-alikes.
    const count = clamp(Math.round(byDiffF(d, 3, 6)), 3, cellsN - 1);
    const exposure = byDiff(d, 2400, 900) + count * byDiff(d, 200, 70);
    const retention = byDiff(d, 350, 1500);
    const mask = d >= 0.5;
    const base = { variant, rows, cols, exposure, retention, mask };

    if (variant === 'order') {
      const len = clamp(byDiff(d, 3, 7), 3, cellsN - 1); // spatial span: ~5–6 typical, 7 for the best
      const seq = rng.sample([...Array(cellsN).keys()], len);
      return { ...base, seq, step: byDiff(d, 720, 360) };
    }

    const lowD = d < 0.6;
    const items = this.scene(rows, cols, count, { uniqueShapes: lowD });

    if (variant === 'where' || variant === 'color') {
      // Target needs a unique shape (low difficulty) or unique shape+colour (high difficulty).
      const shapeCount = (s) => items.filter((i) => i.shape === s).length;
      const candidates = items.filter((i) => shapeCount(i.shape) === 1);
      const target = candidates.length ? rng.pick(candidates) : null;
      if (variant === 'color') {
        // 5 → only clearly distinct hues below the similar-colour threshold (as the scene itself)
        const others = pickColors(rng, 5, d).filter((c) => c !== target?.color);
        const options = rng.shuffle([target?.color, ...others.slice(0, 3)]);
        return { ...base, items, target, options };
      }
      return { ...base, items, target };
    }

    if (variant === 'what') {
      const target = rng.pick(items);
      // Lures: other scene items first (hard), random symbols otherwise.
      const lures = [];
      const pool = d >= 0.4 ? rng.shuffle(items.filter((i) => i !== target)) : [];
      for (const it of pool) if (lures.length < 3 && !lures.some((l) => l.shape === it.shape && l.color === it.color) && !(it.shape === target.shape && it.color === target.color)) lures.push(it);
      let guard = 0;
      while (lures.length < 3 && guard++ < 100) {
        const it = { shape: rng.pick(d >= 0.6 ? Object.keys(SHAPES) : BASIC_SHAPES), color: rng.pick(d >= 0.65 ? Object.keys(COLORS) : DISTINCT_COLORS) };
        if (!(it.shape === target.shape && it.color === target.color) && !lures.some((l) => l.shape === it.shape && l.color === it.color)) lures.push(it);
      }
      return { ...base, items, target, options: rng.shuffle([target, ...lures]) };
    }

    // change
    const after = items.map((i) => ({ ...i }));
    const kinds = ['color', 'shape'];
    if (d >= 0.6) kinds.push('appear', 'disappear');
    const kind = rng.pick(kinds);
    let changedCell;
    if (kind === 'appear') {
      const empty = [...Array(cellsN).keys()].filter((c) => !items.some((i) => i.cell === c));
      changedCell = rng.pick(empty);
      after.push({ cell: changedCell, shape: rng.pick(BASIC_SHAPES), color: rng.pick(pickColors(rng, 3, d)) });
    } else if (kind === 'disappear') {
      const idx = rng.int(0, after.length - 1);
      changedCell = after[idx].cell;
      after.splice(idx, 1);
    } else {
      const idx = rng.int(0, after.length - 1);
      const it = after[idx];
      changedCell = it.cell;
      if (kind === 'color') {
        const fam = COLORS[it.color].family;
        const pool = Object.keys(COLORS).filter((c) => c !== it.color && (d >= 0.65 || COLORS[c].family !== fam));
        it.color = rng.pick(pool);
      } else {
        const fam = SHAPES[it.shape].family;
        const pool = Object.keys(SHAPES).filter((s) => s !== it.shape && (d >= 0.6 || (SHAPES[s].family !== fam && BASIC_SHAPES.includes(s))));
        it.shape = rng.pick(pool);
      }
    }
    return { ...base, items, after, changedCell, kind };
  }

  /** One question per round, a long sequence weighing more. */
  pointUnits() {
    return this.rounds.reduce((s, r) => s + (r.seq ? seqWeight(r.seq.length) : 1), 0);
  }

  validate() {
    for (const r of this.rounds) {
      if (r.variant === 'order') {
        if (new Set(r.seq).size !== r.seq.length) return false;
        continue;
      }
      // No duplicate symbol identities in a scene.
      const ids = r.items.map((i) => i.shape + i.color);
      if (new Set(ids).size !== ids.length) return false;
      if ((r.variant === 'where' || r.variant === 'color') && !r.target) return false;
      if (r.variant === 'color' && (new Set(r.options).size !== 4 || !r.options.includes(r.target.color))) return false;
      if (r.variant === 'what' && new Set(r.options.map((o) => o.shape + o.color)).size !== 4) return false;
      if (r.variant === 'change') {
        const a = r.items.find((i) => i.cell === r.changedCell);
        const b = r.after.find((i) => i.cell === r.changedCell);
        if (a && b && a.shape === b.shape && a.color === b.color) return false;
      }
    }
    return true;
  }

  async run() {
    for (let i = 0; i < this.rounds.length; i++) {
      this.setProgress(i, this.rounds.length);
      const r = this.rounds[i];
      await this[`play_${r.variant}`](r);
      await this.wait(900);
    }
    this.setProgress(this.rounds.length, this.rounds.length);
  }

  async showScene(r, items, { label = t('echo.memorize') } = {}) {
    this.clearStage('stage-echo');
    this.setPrompt(`<span class="prompt-eye">◉</span> ${label}`);
    const b = board(r.rows, r.cols, (i) => {
      const it = items.find((x) => x.cell === i);
      return it ? sym(it, this.settings) : '';
    }, { cls: 'is-reveal' });
    this.stage.append(b, drainBar(r.exposure));
    await this.wait(r.exposure);
  }

  async retention(r) {
    this.clearStage('stage-echo');
    this.setPrompt(`<span class="prompt-dim">…</span>`);
    if (r.mask) {
      this.stage.append(noiseMask(this.rng.fork('mask'), r.rows, r.cols));
      await this.wait(Math.min(400, r.retention));
      this.clearStage('stage-echo');
      await this.wait(Math.max(0, r.retention - 400));
    } else {
      this.stage.append(board(r.rows, r.cols));
      await this.wait(r.retention);
    }
  }

  async play_where(r) {
    await this.showScene(r, r.items);
    await this.retention(r);
    this.clearStage('stage-echo');
    this.setPrompt(t('echo.where', { sym: inlineSym(r.target, this.settings) }));
    const { cells, result } = clickBoard(this, r.rows, r.cols);
    const { index, rt, el } = await result;
    const correct = index === r.target.cell;
    cells.forEach((c) => (c.disabled = true));
    // Ghost-reveal the whole scene so the player sees what was there.
    r.items.forEach((it) => {
      if (it.cell !== r.target.cell) {
        cells[it.cell].innerHTML = sym(it, this.settings);
        cells[it.cell].classList.add('is-ghost');
      }
    });
    cells[r.target.cell].innerHTML = sym(r.target, this.settings);
    cells[r.target.cell].classList.add('is-correct', 'is-pop');
    if (!correct) el.classList.add('is-wrong');
    this.recordTrial({ correct, rt, answerLabel: t('ui.shownOnBoard'), origin: el });
  }

  async play_color(r) {
    await this.showScene(r, r.items);
    await this.retention(r);
    this.clearStage('stage-echo');
    const neutral = { shape: r.target.shape, color: '#e8ecff' };
    this.setPrompt(t('echo.color', { sym: `<span class="inline-sym">${sym(neutral, {})}</span>` }));
    await this.askOptions({
      options: r.options.map((c) => colorOption(c, this.settings)),
      correctValue: r.target.color,
    });
  }

  async play_what(r) {
    await this.showScene(r, r.items);
    await this.retention(r);
    this.clearStage('stage-echo');
    this.setPrompt(t('echo.what'));
    const b = board(r.rows, r.cols, (i) => (i === r.target.cell ? '<span class="cell-marker">?</span>' : ''), { cls: 'is-small' });
    b.children[r.target.cell].classList.add('is-target');
    this.stage.append(b);
    const opts = r.options.map((o) => symbolOption(o, this.settings));
    const correctValue = `${r.target.shape}|${r.target.color}`;
    await this.askOptions({ options: opts, correctValue });
  }

  async play_order(r) {
    this.clearStage('stage-echo');
    this.setPrompt(`<span class="prompt-eye">◉</span> ${t('echo.watchOrder')}`);
    const b = board(r.rows, r.cols, () => '', { cls: 'is-seq' });
    this.stage.append(b);
    await this.wait(500);
    for (const cell of r.seq) {
      const c = b.children[cell];
      c.classList.add('is-lit');
      await this.wait(r.step * 0.75);
      c.classList.remove('is-lit');
      await this.wait(r.step * 0.25);
    }
    await this.wait(250);
    this.clearStage('stage-echo');
    this.setPrompt(t('echo.repeatOrder', { n: r.seq.length }));
    const t0 = now();
    let pos = 0;
    await new Promise((resolve) => {
      const { cells } = multiClickBoard(this, r.rows, r.cols, (i, btn) => {
        if (pos >= r.seq.length) return;
        const ok = r.seq[pos] === i;
        btn.classList.add(ok ? 'is-hit' : 'is-wrong', 'is-pop');
        btn.textContent = String(pos + 1);
        this.hooks?.sound?.(ok ? 'tap' : 'wrong');
        this.hooks?.haptic?.(ok ? 'tick' : 'error');
        pos++;
        if (!ok || pos === r.seq.length) {
          cells.forEach((c) => (c.disabled = true));
          if (!ok) r.seq.forEach((cell, k) => { cells[cell].classList.add('is-correct'); cells[cell].textContent = String(k + 1); });
          this.recordTrial({
            correct: ok,
            rt: now() - t0,
            targetTime: r.seq.length * 800,
            answerLabel: t('ui.shownOnBoard'),
            weight: seqWeight(r.seq.length),
            origin: btn,
          });
          resolve();
        }
      }, { cls: 'is-seq' });
    });
  }

  async play_change(r) {
    await this.showScene(r, r.items, { label: t('echo.sceneA') });
    await this.retention({ ...r, retention: Math.max(500, r.retention) });
    await this.showScene({ ...r, exposure: Math.max(900, r.exposure * 0.7) }, r.after, { label: t('echo.sceneB') });
    this.clearStage('stage-echo');
    this.setPrompt(t('echo.change'));
    const { cells, result } = clickBoard(this, r.rows, r.cols);
    const { index, rt, el } = await result;
    const correct = index === r.changedCell;
    cells.forEach((c) => (c.disabled = true));
    cells[r.changedCell].classList.add('is-correct');
    const a = r.items.find((i) => i.cell === r.changedCell);
    const bItem = r.after.find((i) => i.cell === r.changedCell);
    cells[r.changedCell].innerHTML = `<span class="diff-pair">${a ? sym(a, this.settings) : '<i>∅</i>'}<b>→</b>${bItem ? sym(bItem, this.settings) : '<i>∅</i>'}</span>`;
    if (!correct) el.classList.add('is-wrong');
    cells[r.changedCell].classList.add('is-pop');
    this.recordTrial({ correct, rt, targetTime: 3200, answerLabel: t(`echo.kind.${r.kind}`), origin: el });
  }
}
