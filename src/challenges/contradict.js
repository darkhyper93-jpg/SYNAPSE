// CONTRADICT — rule discovery: number mappings, sequences, visual patterns and
// "which example contradicts the rule?". Every puzzle is checked against a broad
// hypothesis space so that exactly one answer is defensible.
import { Challenge } from '../engine/challenge.js';
import { byDiff } from '../utils/math.js';
import { pickShapes, pickColors } from '../data/visuals.js';
import { sym, symbolLabel } from './common.js';
import { h } from '../utils/dom.js';
import { t } from '../game/i18n.js';

// ---------- rule library (what we generate) ----------
const R = (id, tier, gen) => ({ id, tier, gen });
const MAP_RULES = [
  R('add', 0, (rng) => { const a = rng.int(2, 9); return { f: (n) => n + a, text: `n + ${a}` }; }),
  R('mul', 0, (rng) => { const a = rng.int(2, 5); return { f: (n) => n * a, text: `n × ${a}` }; }),
  R('sub', 0, (rng) => { const a = rng.int(1, 4); return { f: (n) => n - a, text: `n − ${a}`, minN: a + 1 }; }),
  R('mulAdd', 1, (rng) => { const a = rng.int(2, 4), b = rng.int(1, 5); return { f: (n) => a * n + b, text: `n × ${a} + ${b}` }; }),
  R('mulSub', 1, (rng) => { const a = rng.int(2, 4), b = rng.int(1, 3); return { f: (n) => a * n - b, text: `n × ${a} − ${b}` }; }),
  R('sq', 1, () => ({ f: (n) => n * n, text: 'n × n' })),
  R('sqAdd', 2, (rng) => { const a = rng.int(1, 5); return { f: (n) => n * n + a, text: `n × n + ${a}` }; }),
  R('sqSub', 2, (rng) => { const a = rng.int(1, 3); return { f: (n) => n * n - a, text: `n × n − ${a}`, minN: 2 }; }),
  R('nn1', 2, () => ({ f: (n) => n * (n + 1), text: 'n × (n + 1)' })),
  R('addMul', 2, (rng) => { const a = rng.int(1, 3), b = rng.int(2, 3); return { f: (n) => (n + a) * b, text: `(n + ${a}) × ${b}` }; }),
  R('nn_1', 3, () => ({ f: (n) => n * (n - 1), text: 'n × (n − 1)', minN: 2 })),
  R('pow2', 3, () => ({ f: (n) => 2 ** n, text: '2ⁿ', maxN: 9 })),
  R('cube', 3, () => ({ f: (n) => n ** 3, text: 'n × n × n', maxN: 6 })),
  R('sqPlusN', 3, (rng) => { const a = rng.int(2, 3); return { f: (n) => n * n + a * n, text: `n × n + ${a} × n` }; }),
];

// ---------- hypothesis space (what a reasonable player might infer) ----------
let HYPS = null;
function hypotheses() {
  if (HYPS) return HYPS;
  HYPS = [];
  for (let a = -6; a <= 12; a++) for (let b = -30; b <= 40; b++) HYPS.push((n) => a * n + b);
  for (let k = 1; k <= 2; k++)
    for (let b = -5; b <= 5; b++) for (let c = -12; c <= 12; c++) HYPS.push((n) => k * n * n + b * n + c);
  for (let c = -4; c <= 4; c++) {
    HYPS.push((n) => 2 ** n + c);
    HYPS.push((n) => 3 ** n + c);
    HYPS.push((n) => n ** 3 + c);
  }
  return HYPS;
}

/** Answers that every hypothesis consistent with `pairs` gives for q. */
export function consistentAnswers(pairs, q) {
  const out = new Set();
  for (const f of hypotheses()) if (pairs.every(([x, y]) => f(x) === y)) out.add(f(q));
  return out;
}
const fits = (pairs) => hypotheses().some((f) => pairs.every(([x, y]) => f(x) === y));

// ---------- sequences ----------
const SEQ_RULES = [
  R('arith', 0, (rng) => { const s = rng.int(1, 15), d = rng.int(2, 9); return { terms: (k) => s + d * k, text: `+${d}` }; }),
  R('arithDown', 1, (rng) => { const d = rng.int(2, 7), s = rng.int(6 * d, 9 * d); return { terms: (k) => s - d * k, text: `−${d}` }; }),
  R('geo', 1, (rng) => { const s = rng.int(1, 4), r = rng.pick([2, 3]); return { terms: (k) => s * r ** k, text: `× ${r}` }; }),
  R('alt', 1, (rng) => { const a = rng.int(2, 9), b = rng.int(1, 6) * (rng.chance(0.5) ? -1 : 1), s = rng.int(5, 15); return { terms: (k) => s + Math.ceil(k / 2) * a + Math.floor(k / 2) * b, text: `+${a}, ${b > 0 ? '+' : '−'}${Math.abs(b)}`, len: 6 }; }),
  R('grow', 2, (rng) => { const s = rng.int(1, 10), d0 = rng.int(1, 4); return { terms: (k) => s + d0 * k + (k * (k - 1)) / 2, text: `+${d0}, +${d0 + 1}, +${d0 + 2}…` }; }),
  R('fib', 2, (rng) => { const a = rng.int(1, 4), b = rng.int(2, 6); const memo = [a, b]; return { terms: (k) => { while (memo.length <= k) memo.push(memo[memo.length - 1] + memo[memo.length - 2]); return memo[k]; }, text: 'a + b' }; }),
  R('squares', 2, (rng) => { const s = rng.int(1, 4), c = rng.int(0, 3); return { terms: (k) => (s + k) ** 2 + c, text: c ? `n² + ${c}` : 'n²' }; }),
  R('mulAddSeq', 3, (rng) => { const a = 2, b = rng.int(1, 3), s = rng.int(1, 4); return { terms: (k) => { let v = s; for (let i = 0; i < k; i++) v = a * v + b; return v; }, text: `× ${a} + ${b}` }; }),
  R('interleave', 3, (rng) => { const a = rng.int(1, 9), da = rng.int(2, 5), b = rng.int(20, 40), db = -rng.int(1, 4); return { terms: (k) => (k % 2 ? b + db * ((k - 1) / 2) : a + da * (k / 2)), text: `+${da} | −${-db}`, len: 6 }; }),
];

/** Every predictor that fits the shown terms must agree. */
export function sequencePredictions(xs) {
  const preds = new Set();
  const n = xs.length;
  const diffs = xs.slice(1).map((v, i) => v - xs[i]);
  if (diffs.every((d) => d === diffs[0])) preds.add(xs[n - 1] + diffs[0]);
  if (xs.every((v) => v !== 0)) {
    const r = xs[1] / xs[0];
    if (Number.isInteger(r) && Math.abs(r) > 1 && xs.every((v, i) => i === 0 || v === xs[i - 1] * r)) preds.add(xs[n - 1] * r);
  }
  if (diffs.length >= 4 && diffs.every((d, i) => d === diffs[i % 2])) preds.add(xs[n - 1] + diffs[(n - 1) % 2]);
  const d2 = diffs.slice(1).map((v, i) => v - diffs[i]);
  if (d2.length >= 2 && d2.every((v) => v === d2[0])) preds.add(xs[n - 1] + diffs[diffs.length - 1] + d2[0]);
  if (n >= 4 && xs.every((v, i) => i < 2 || v === xs[i - 1] + xs[i - 2])) preds.add(xs[n - 1] + xs[n - 2]);
  if (n >= 4) {
    // x[k+1] = a*x[k] + b, derived from first two transitions
    const den = xs[1] - xs[0];
    if (den !== 0) {
      const a = (xs[2] - xs[1]) / den;
      const b = xs[1] - a * xs[0];
      if (Number.isInteger(a) && a !== 1 && xs.every((v, i) => i === 0 || v === a * xs[i - 1] + b)) preds.add(a * xs[n - 1] + b);
    }
  }
  if (n >= 6) {
    const ev = xs.filter((_, i) => i % 2 === 0);
    const od = xs.filter((_, i) => i % 2 === 1);
    const ar = (s) => s.slice(1).every((v, i) => v - s[i] === s[1] - s[0]);
    if (ar(ev) && ar(od)) {
      const src = n % 2 === 0 ? ev : od;
      preds.add(src[src.length - 1] + (src[1] - src[0]));
    }
  }
  return preds;
}

const tierFor = (d) => (d < 0.3 ? 0 : d < 0.5 ? 1 : d < 0.75 ? 2 : 3);

export class ContradictChallenge extends Challenge {
  static meta = { id: 'contradict', skill: 'logic', targetTime: 7000 };

  generate() {
    const d = this.difficulty;
    const kinds = ['map', 'seq', 'visual'];
    if (d >= 0.5) kinds.push('anomaly');
    let order = this.rng.shuffle(kinds);
    if (d >= 0.5 && !order.slice(0, 3).includes('anomaly') && this.rng.chance(0.6)) order = ['anomaly', ...order];
    this.rounds = order.slice(0, 3).map((k) => this[`make_${k}`]());
  }

  pickRule(lib) {
    const tier = tierFor(this.difficulty);
    // Prefer the current tier, keep easier rules in the mix.
    const pool = lib.filter((r) => r.tier <= tier);
    return this.rng.weighted(pool, (r) => (r.tier === tier ? 3 : 1));
  }

  inputs(rule, k) {
    const lo = Math.max(1, rule.minN || 1);
    const hi = Math.min(rule.maxN || 12, 12);
    const xs = this.rng.sample(Array.from({ length: hi - lo + 1 }, (_, i) => lo + i), k);
    return this.difficulty < 0.4 ? xs.slice(0, k - 1).sort((a, b) => a - b).concat(xs[k - 1]) : xs;
  }

  numberOptions(answer, extra = []) {
    const rng = this.rng;
    const cands = new Set(extra.filter((v) => v !== answer && v >= 0));
    const near = [answer + 1, answer - 1, answer + 2, answer - 2, answer + 10, answer - 10, answer * 2];
    for (const v of rng.shuffle(near)) if (v >= 0 && v !== answer) cands.add(v);
    const lures = rng.shuffle([...cands]).slice(0, 3);
    return rng.shuffle([answer, ...lures]);
  }

  make_map() {
    const base = this.pickRule(MAP_RULES);
    const rule = base.gen(this.rng);
    const k = 4;
    const xs = this.inputs(rule, k);
    const pairs = xs.slice(0, k - 1).map((x) => [x, rule.f(x)]);
    const q = xs[k - 1];
    const answer = rule.f(q);
    const others = MAP_RULES.filter((r) => r !== base)
      .map((r) => r.gen(this.rng).f(q))
      .filter((v) => v <= Math.max(50, answer * 3));
    return { kind: 'map', pairs, q, answer, options: this.numberOptions(answer, others), text: rule.text };
  }

  make_seq() {
    const base = this.pickRule(SEQ_RULES);
    const rule = base.gen(this.rng);
    const len = rule.len || (this.difficulty < 0.5 ? 5 : 6);
    const terms = Array.from({ length: len }, (_, k) => rule.terms(k));
    const answer = rule.terms(len);
    const last = terms[len - 1];
    const extra = [last + (terms[len - 1] - terms[len - 2]), answer + (terms[1] - terms[0])];
    return { kind: 'seq', terms, answer, options: this.numberOptions(answer, extra), text: rule.text };
  }

  make_visual() {
    const d = this.difficulty;
    const rng = this.rng;
    const rotate = d >= 0.6;
    // Rotation is only shown on shapes whose 90° steps all look different.
    const pShape = rotate ? 2 : rng.int(2, byDiff(d, 2, 4));
    const pColor = rng.int(d < 0.3 ? 1 : 2, byDiff(d, 2, 3));
    const pRot = rotate ? rng.int(2, 4) : 1;
    const shapeSeq = rotate ? rng.shuffle(['triangle', 'star']) : pickShapes(rng, pShape, Math.min(d, 0.55));
    const colors = pickColors(rng, pColor, Math.min(d, 0.6));
    const rots = [0, 90, 180, 270].slice(0, pRot);
    const len = Math.max(2 * Math.max(pShape, pColor, pRot), 5);
    const item = (k) => ({ shape: shapeSeq[k % pShape], color: colors[k % pColor], rot: rots[k % pRot] });
    const shown = Array.from({ length: len }, (_, k) => item(k));
    const answer = item(len);
    const key = (it) => `${it.shape}|${it.color}|${it.rot}`;
    const lures = new Map();
    const tryAdd = (it) => { if (key(it) !== key(answer) && !lures.has(key(it))) lures.set(key(it), it); };
    tryAdd({ ...answer, shape: shapeSeq[(len + 1) % pShape] });
    tryAdd({ ...answer, color: colors[(len + 1) % pColor] });
    if (rotate) tryAdd({ ...answer, rot: rots[(len + 1) % pRot] });
    tryAdd(item(len + 1));
    const extraColors = pickColors(rng, 5, 0).filter((c) => !colors.includes(c));
    let guard = 0;
    while (lures.size < 3 && guard++ < 60) {
      tryAdd({
        shape: rng.pick(shapeSeq),
        color: rng.pick([...colors, ...extraColors.slice(0, 1)]),
        rot: rotate ? rng.pick([0, 90, 180, 270]) : 0,
      });
    }
    const options = rng.shuffle([answer, ...[...lures.values()].slice(0, 3)]);
    return { kind: 'visual', shown, answer, options, key, periods: [pShape, pColor, pRot], len, textKey: rotate ? 'logic.visualRuleRot' : 'logic.visualRule' };
  }

  make_anomaly() {
    const base = this.pickRule(MAP_RULES.filter((r) => r.tier >= 1));
    const rule = base.gen(this.rng);
    const xs = this.inputs(rule, 5).sort((a, b) => a - b);
    const pairs = xs.map((x) => [x, rule.f(x)]);
    const bad = this.rng.int(0, 4);
    const delta = this.rng.pick([1, -1, 2, -2, 3]);
    pairs[bad] = [pairs[bad][0], pairs[bad][1] + delta];
    return { kind: 'anomaly', pairs, bad, text: rule.text };
  }

  validate() {
    for (const r of this.rounds) {
      if (r.kind === 'map') {
        const ans = consistentAnswers(r.pairs, r.q);
        if (ans.size !== 1 || !ans.has(r.answer)) return false;
        if (new Set(r.options).size !== 4) return false;
        if (r.answer < 0 || r.answer > 2000) return false;
      } else if (r.kind === 'seq') {
        const p = sequencePredictions(r.terms);
        if (p.size !== 1 || !p.has(r.answer)) return false;
        if (new Set(r.options).size !== 4 || r.terms.some((v) => v < 0 || v > 999)) return false;
        // a negative answer would be the only negative option: solvable without the rule
        if (r.answer < 0 || r.answer > 999) return false;
      } else if (r.kind === 'visual') {
        if (new Set(r.options.map(r.key)).size !== 4) return false;
        if (r.periods.some((p) => r.len < 2 * p)) return false;
      } else if (r.kind === 'anomaly') {
        // Removing the bad pair must leave a coherent rule; removing any other must not.
        for (let j = 0; j < r.pairs.length; j++) {
          const rest = r.pairs.filter((_, i) => i !== j);
          if (j === r.bad ? !fits(rest) : fits(rest)) return false;
        }
        if (r.pairs.some(([, y]) => y < 0)) return false;
      }
    }
    return true;
  }

  async run() {
    for (let i = 0; i < this.rounds.length; i++) {
      this.setProgress(i, this.rounds.length);
      const r = this.rounds[i];
      this.clearStage('stage-logic');
      await this[`play_${r.kind}`](r);
      await this.wait(1500);
    }
    this.setProgress(this.rounds.length, this.rounds.length);
  }

  timeLimit() {
    return byDiff(this.difficulty, 26000, 16000);
  }

  numOpts(list) {
    return list.map((v) => ({ value: v, label: String(v), html: `<span class="big-num">${v}</span>` }));
  }

  async play_map(r) {
    this.setPrompt(t('logic.map'));
    const box = h('div.rule-box');
    r.pairs.forEach(([x, y], i) => box.append(h('div.pair', { '--i': i }, h('b', String(x)), h('span.arrow', '→'), h('b', String(y)))));
    const q = h('b.q', '?');
    box.append(h('div.pair.is-query', h('b', String(r.q)), h('span.arrow', '→'), q));
    this.stage.append(box);
    const res = await this.askOptions({ options: this.numOpts(r.options), correctValue: r.answer, timeLimit: this.timeLimit(), trial: { explanation: t('logic.rule', { rule: r.text }) } });
    this.reveal(q, String(r.answer), res.correct);
  }

  async play_seq(r) {
    this.setPrompt(t('logic.seq'));
    const box = h('div.seq-box');
    r.terms.forEach((v, i) => box.append(h('span.term', { '--i': i }, String(v))));
    const q = h('span.term.is-query', '?');
    box.append(q);
    this.stage.append(box);
    const res = await this.askOptions({ options: this.numOpts(r.options), correctValue: r.answer, timeLimit: this.timeLimit(), trial: { explanation: t('logic.rule', { rule: r.text }) } });
    this.reveal(q, String(r.answer), res.correct);
  }

  async play_visual(r) {
    this.setPrompt(t('logic.visual'));
    const box = h('div.seq-box.is-visual');
    r.shown.forEach((it, i) => box.append(h('span.term', { '--i': i, html: sym(it, this.settings, { rotate: it.rot }) })));
    const q = h('span.term.is-query', '?');
    box.append(q);
    this.stage.append(box);
    const res = await this.askOptions({
      options: r.options.map((it) => ({ value: r.key(it), label: `${symbolLabel(it)}${it.rot ? ` ${it.rot}°` : ''}`, html: sym(it, this.settings, { rotate: it.rot }) })),
      correctValue: r.key(r.answer),
      timeLimit: this.timeLimit(),
      trial: { explanation: t(r.textKey, { a: r.periods[0], b: r.periods[1], c: r.periods[2] }) },
    });
    this.reveal(q, sym(r.answer, this.settings, { rotate: r.answer.rot }), res.correct, true);
  }

  /** Card-flip the "?" to show the right answer. */
  reveal(el, content, correct, isHtml = false) {
    el.classList.add('is-flip', correct ? 'is-ok' : 'is-bad');
    setTimeout(() => {
      if (isHtml) el.innerHTML = content;
      else el.textContent = content;
    }, 160);
  }

  async play_anomaly(r) {
    this.setPrompt(t('logic.anomaly'));
    const box = h('div.rule-box.is-anomaly');
    this.stage.append(box);
    await this.askOptions({
      container: box,
      options: r.pairs.map(([x, y], i) => ({ value: i, label: `${x} → ${y}`, html: `<span class="pair-inline"><b>${x}</b><span class="arrow">→</span><b>${y}</b></span>` })),
      correctValue: r.bad,
      cols: 5,
      className: 'is-pairs',
      timeLimit: this.timeLimit(),
      trial: { explanation: t('logic.rule', { rule: r.text }) },
    });
  }
}
