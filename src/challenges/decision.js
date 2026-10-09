// DECISION — decisions under time pressure. Precision still matters most:
// timeouts and wrong answers score zero. Every round can be settled by quick estimation (the
// approximate number sense tells amounts ~15–20 % apart; reading a number takes ~300 ms): harder
// levels give less time and closer amounts, never a gap only exact counting or adding could find.
import { Challenge } from '../engine/challenge.js';
import { byDiff, byDiffF, sum } from '../utils/math.js';
import { pickShapes, COLORS } from '../data/visuals.js';
import { sym, inlineSym, colorOption } from './common.js';
import { h } from '../utils/dom.js';
import { t } from '../game/i18n.js';

export class DecisionChallenge extends Challenge {
  static meta = { id: 'decision', skill: 'decision', targetTime: 1500 };

  generate() {
    const kinds = ['stream', 'compare', 'value'];
    const order = this.rng.shuffle(kinds);
    order.push(this.rng.pick(kinds.filter((k) => k !== order[2])));
    this.rounds = order.map((k) => this[`make_${k}`]());
  }

  limit() {
    return byDiff(this.difficulty, 3200, 1700);
  }

  /** Time to answer each kind of round (also what the fairness tests check). */
  answerTime(kind) {
    if (kind === 'compare') return this.limit() + 600;
    if (kind === 'value') return this.limit() + byDiff(this.difficulty, 2000, 2200); // ≥ 300 ms per number shown
    return this.limit();
  }

  make_stream() {
    const d = this.difficulty;
    const rng = this.rng;
    const k = d < 0.4 ? 3 : 4;
    const colors = rng.sample(['red', 'blue', 'yellow', 'green', 'violet'], k);
    const total = byDiff(d, 10, 20);
    const margin = 2; // with uniqueExtreme's 25 % ratio: a lead you can feel in a fast stream
    const ask = rng.pick(['least', 'most']);
    // Build counts with a unique extreme.
    let counts;
    let guard = 0;
    do {
      counts = colors.map(() => 1);
      for (let i = k; i < total; i++) counts[rng.int(0, k - 1)]++;
      guard++;
    } while (!this.uniqueExtreme(counts, ask, margin) && guard < 200);
    const seq = rng.shuffle(colors.flatMap((c, i) => Array(counts[i]).fill(c)));
    const answer = colors[this.extremeIndex(counts, ask)];
    return { kind: 'stream', colors, counts, seq, ask, answer, margin, step: byDiff(d, 420, 230) };
  }

  extremeIndex(counts, ask) {
    const v = ask === 'least' ? Math.min(...counts) : Math.max(...counts);
    return counts.indexOf(v);
  }

  uniqueExtreme(counts, ask, margin) {
    const sorted = counts.slice().sort((a, b) => (ask === 'least' ? a - b : b - a));
    const [a, b] = [sorted[0], sorted[1]];
    return Math.abs(b - a) >= margin && Math.max(a, b) / Math.min(a, b) >= 1.25;
  }

  make_compare() {
    const d = this.difficulty;
    const rng = this.rng;
    const [target, ...others] = pickShapes(rng, 4, d);
    const base = rng.int(byDiff(d, 3, 6), byDiff(d, 5, 9));
    // the extra items shrink from ~80 % to ~20 % of the count, never under 16 % (estimable at a glance)
    const diff = Math.max(1, Math.ceil(base * 0.16), Math.round(base * byDiffF(d, 0.8, 0.2)));
    const more = rng.chance(0.5) ? 'left' : 'right';
    const counts = { left: base, right: base };
    counts[more] += diff;
    const fillers = byDiff(d, 3, 9);
    const color = rng.pick(['cyan', 'yellow', 'pink', 'green']);
    // Jittered grid placement: items never overlap, so counting is always possible.
    const G = 5;
    const side = (n) => {
      const shapes = rng.shuffle([...Array(n).fill(target), ...Array.from({ length: fillers + rng.int(-1, 1) }, () => rng.pick(others))]);
      const cells = rng.sample([...Array(G * G).keys()], Math.min(shapes.length, G * G));
      // (max edge 96 %: nothing crosses the panel's rounded border; neighbours stay ≥ 15 % apart)
      return cells.map((c, i) => ({ shape: shapes[i], color, x: (c % G) * 19 + 2 + rng.range(0, 4), y: Math.floor(c / G) * 19 + 2 + rng.range(0, 4) }));
    };
    return { kind: 'compare', target, color, counts, answer: more, left: side(counts.left), right: side(counts.right) };
  }

  make_value() {
    const d = this.difficulty;
    const rng = this.rng;
    const n = d < 0.5 ? 3 : 4;
    const terms = d < 0.3 ? 2 : 3;
    // the best card leads the next by 30 % of its total at first, 12 % at the top: rounding each
    // number to its tens is enough, exact sums never are needed
    const lead = byDiffF(d, 0.3, 0.12);
    const gapFor = (cards) => Math.max(2, Math.ceil(lead * Math.abs(Math.max(...cards.map(sum)))));
    let cards;
    let guard = 0;
    do {
      cards = Array.from({ length: n }, () => Array.from({ length: terms }, () => rng.int(1, byDiff(d, 9, 19)) * (d >= 0.7 && rng.chance(0.25) ? -1 : 1)));
      guard++;
    } while (!this.clearMax(cards, gapFor(cards)) && guard < 400);
    const sums = cards.map(sum);
    return { kind: 'value', cards, answer: sums.indexOf(Math.max(...sums)), gap: gapFor(cards) };
  }

  clearMax(cards, gap) {
    const s = cards.map(sum).sort((a, b) => b - a);
    return s[0] - s[1] >= gap;
  }

  validate() {
    return this.rounds.every((r) => {
      if (r.kind === 'stream') return this.uniqueExtreme(r.counts, r.ask, r.margin) && r.seq.length === sum(r.counts);
      if (r.kind === 'value') return this.clearMax(r.cards, r.gap);
      if (r.kind === 'compare') {
        const l = r.left.filter((x) => x.shape === r.target).length;
        const rr = r.right.filter((x) => x.shape === r.target).length;
        return l === r.counts.left && rr === r.counts.right && l !== rr;
      }
      return true;
    });
  }

  async run() {
    for (let i = 0; i < this.rounds.length; i++) {
      this.setProgress(i, this.rounds.length);
      const r = this.rounds[i];
      this.currentKind = r.kind;
      this.clearStage('stage-decision');
      await this[`play_${r.kind}`](r);
      await this.wait(850);
    }
    this.setProgress(this.rounds.length, this.rounds.length);
  }

  async play_stream(r) {
    this.setPrompt(t('decision.watch'));
    const field = h('div.dot-field');
    this.stage.append(field);
    await this.wait(500);
    for (const c of r.seq) {
      const dot = h('span.dot', { style: { left: `${this.rng.range(8, 88)}%`, top: `${this.rng.range(10, 85)}%` } });
      dot.style.setProperty('--c', COLORS[c].hex);
      if (this.settings.colorAssist) dot.textContent = t(`glyph.${c}`);
      field.append(dot);
      await this.wait(r.step * 0.75);
      dot.remove();
      await this.wait(r.step * 0.25);
    }
    this.clearStage('stage-decision');
    this.setPrompt(t(`decision.${r.ask}`));
    await this.askOptions({
      options: r.colors.map((c) => colorOption(c, this.settings)),
      correctValue: r.answer,
      timeLimit: this.answerTime('stream'),
      targetTime: this.answerTime('stream') * 0.55,
      trial: { explanation: r.colors.map((c, i) => `${t(`color.${c}`)} ${r.counts[i]}`).join(' · ') },
    });
  }

  async play_compare(r) {
    this.setPrompt(t('decision.compare', { sym: inlineSym({ shape: r.target, color: r.color }, this.settings) }));
    const panels = h('div.compare');
    const panel = (items) => {
      const p = h('div.compare-panel');
      items.forEach((it) => {
        const s = h('span.scatter', { html: sym(it, this.settings) });
        s.style.left = `${it.x}%`;
        s.style.top = `${it.y}%`;
        p.append(s);
      });
      return p;
    };
    panels.append(panel(r.left), panel(r.right));
    this.stage.append(panels);
    await this.askOptions({
      options: [
        { value: 'left', label: t('decision.left'), html: `← ${t('decision.left')}` },
        { value: 'right', label: t('decision.right'), html: `${t('decision.right')} →` },
      ],
      correctValue: r.answer,
      timeLimit: this.answerTime('compare'),
      targetTime: this.answerTime('compare') * 0.55,
      cols: 2,
      trial: { explanation: `${r.counts.left} vs ${r.counts.right}` },
    });
  }

  async play_value(r) {
    this.setPrompt(t('decision.value'));
    const answered = this.askOptions({
      options: r.cards.map((c, i) => ({
        value: i,
        label: c.join(' + '),
        html: `<span class="value-card">${c.map((v) => `<b class="${v < 0 ? 'neg' : ''}">${v < 0 ? '−' + Math.abs(v) : v}</b>`).join('<i>+</i>')}</span>`,
      })),
      correctValue: r.answer,
      timeLimit: this.answerTime('value'),
      targetTime: this.answerTime('value') * 0.55,
      cols: r.cards.length,
      className: 'is-values',
      trial: { explanation: r.cards.map((c) => sum(c)).join(' · ') },
    });
    // long sums (negative two-digit terms) on a narrow phone: shrink just those digits to fit
    this.stage.querySelectorAll('.value-card').forEach((vc) => {
      const avail = vc.closest('.option').clientWidth - 20;
      for (let k = 0; k < 3 && vc.scrollWidth > avail; k++) {
        const size = parseFloat(getComputedStyle(vc).fontSize);
        vc.style.fontSize = `${((size * avail) / vc.scrollWidth).toFixed(1)}px`;
      }
    });
    await answered;
  }

  handleInput(input) {
    // Arrow keys map to left/right in the compare round.
    if (this.currentKind === 'compare' && input.type === 'key' && (input.key === 'ArrowLeft' || input.key === 'ArrowRight')) {
      return super.handleInput({ ...input, key: input.key === 'ArrowLeft' ? '1' : '2' });
    }
    return super.handleInput(input);
  }
}
