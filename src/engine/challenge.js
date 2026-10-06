// Common Challenge interface. Every challenge type extends this class:
//   id, type, skill, difficulty, duration,
//   generate() -> builds content from (difficulty, rng) — pure, DOM free
//   validate() -> fairness check (FairnessEngine retries generation if false)
//   start(stage, hooks) -> runs the challenge, resolves with getResult()
//   handleInput(input) -> keyboard / generic input
//   evaluate(answer) -> correctness of one answer
//   getResult() -> aggregated performance

import { clamp, mean, median } from '../utils/math.js';
import { h, now, gridKeyNav } from '../utils/dom.js';
import { t } from '../game/i18n.js';

let uid = 0;

export class Challenge {
  /** Override in subclasses. */
  static meta = {
    id: 'base',
    skill: 'memory',
    secondary: null, // optional secondary skill (combined challenges)
    minRating: 0, // rating required in `unlockSkills` to appear
    unlockSkills: [],
    targetTime: 2000,
  };

  constructor({ difficulty = 0.3, rng, settings = {} } = {}) {
    this.id = `${this.constructor.meta.id}-${++uid}`;
    this.type = this.constructor.meta.id;
    this.skill = this.constructor.meta.skill;
    this.difficulty = clamp(difficulty);
    this.rng = rng;
    this.settings = settings;
    this.trials = [];
    this.duration = 0;
    this.params = {};
    this._timers = new Set();
    this._raf = new Set();
    this._keyHandler = null;
    this._waiters = new Set();
    this.destroyed = false;
  }

  get meta() {
    return this.constructor.meta;
  }

  generate() {
    throw new Error('generate() not implemented');
  }

  validate() {
    return true;
  }

  async start(stage, hooks = {}) {
    this.stage = stage;
    this.hooks = hooks;
    this.startedAt = now();
    await this.run();
    this.duration = now() - this.startedAt;
    return this.getResult();
  }

  async run() {
    throw new Error('run() not implemented');
  }

  handleInput(input) {
    if (this._keyHandler) this._keyHandler(input);
  }

  evaluate(answer, expected) {
    return answer === expected;
  }

  /**
   * Record one trial. Fields:
   *  correct, rt (ms), targetTime (ms), weight (adaptation/score weight),
   *  feedback: 'full' | 'mini' | 'none', answerLabel, explanation, forgiving
   */
  recordTrial(trial) {
    const tr = {
      correct: false,
      rt: null,
      targetTime: this.meta.targetTime,
      weight: 1,
      feedback: 'full',
      ...trial,
    };
    this.trials.push(tr);
    tr.points = this.hooks?.onTrial?.(tr, this) ?? 0;
    return tr;
  }

  getResult() {
    const scored = this.trials.filter((tr) => tr.weight > 0);
    const wSum = scored.reduce((s, tr) => s + tr.weight, 0) || 1;
    const accuracy = scored.reduce((s, tr) => s + (tr.correct ? tr.weight : 0), 0) / wSum;
    const rts = this.trials.filter((tr) => tr.correct && tr.rt != null).map((tr) => tr.rt);
    const ratios = this.trials
      .filter((tr) => tr.correct && tr.rt != null && tr.targetTime)
      .map((tr) => tr.rt / tr.targetTime);
    // Low-weight trials (e.g. correct rejections in a stream) don't inflate counts.
    const main = this.trials.filter((tr) => tr.weight >= 0.5);
    return {
      type: this.type,
      skill: this.skill,
      secondary: this.meta.secondary,
      difficulty: this.difficulty,
      accuracy: scored.length ? accuracy : 0,
      trials: main.length,
      correct: main.filter((tr) => tr.correct).length,
      avgRt: rts.length ? mean(rts) : null,
      bestRt: rts.length ? Math.min(...rts) : null,
      speedRatio: ratios.length ? median(ratios) : 1,
      points: this.trials.reduce((s, tr) => s + (tr.points || 0), 0),
      duration: this.duration,
      reactionLike: !!this.meta.reactionLike,
    };
  }

  // ---------- lifecycle helpers ----------
  later(fn, ms) {
    const id = setTimeout(() => {
      this._timers.delete(id);
      if (!this.destroyed) fn();
    }, ms);
    this._timers.add(id);
    return id;
  }

  cancel(id) {
    clearTimeout(id);
    this._timers.delete(id);
  }

  /** Promise that resolves after ms (never resolves if destroyed). */
  wait(ms) {
    return new Promise((resolve) => this.later(resolve, ms));
  }

  frame(fn) {
    const id = requestAnimationFrame((ts) => {
      this._raf.delete(id);
      if (!this.destroyed) fn(ts);
    });
    this._raf.add(id);
    return id;
  }

  destroy() {
    this.destroyed = true;
    this._timers.forEach(clearTimeout);
    this._raf.forEach(cancelAnimationFrame);
    this._timers.clear();
    this._raf.clear();
    this._keyHandler = null;
  }

  // ---------- UI helpers shared by challenges ----------
  clearStage(cls = '') {
    this.stage.innerHTML = '';
    this.stage.className = `stage ${cls}`;
  }

  setPrompt(html) {
    this.hooks?.setPrompt?.(html);
  }

  setProgress(i, n) {
    this.hooks?.setProgress?.(i, n);
  }

  glyph(color) {
    return this.settings.colorAssist ? t(`glyph.${color}`) : '';
  }

  /**
   * Generic multiple choice. options: [{ value, html, label }]
   * Resolves { value, correct, rt, timedOut }.
   */
  askOptions({ container, options, correctValue, timeLimit = 0, targetTime, cols, className = '', trial = {} }) {
    return new Promise((resolve) => {
      const wrap = h(`div.options${className ? '.' + className : ''}`, { role: 'group' });
      wrap.style.setProperty('--cols', cols || Math.min(options.length, 4));
      const t0 = now();
      let done = false;
      let timerBar = null;
      let timeoutId = null;

      const finish = (value, btn) => {
        if (done) return;
        done = true;
        this._keyHandler = null;
        if (timeoutId) this.cancel(timeoutId);
        const rt = now() - t0;
        const timedOut = value === undefined;
        const correct = !timedOut && this.evaluate(value, correctValue);
        [...wrap.children].forEach((b) => {
          b.disabled = true;
          if (b.dataset.value === String(correctValue)) b.classList.add('is-correct');
        });
        if (btn && !correct) btn.classList.add('is-wrong');
        timerBar?.classList.add('is-stopped');
        const correctOpt = options.find((o) => o.value === correctValue);
        this.recordTrial({
          correct,
          rt: timedOut ? null : rt,
          targetTime: targetTime || this.meta.targetTime,
          answerLabel: correctOpt?.label,
          timedOut,
          ...trial,
        });
        resolve({ value, correct, rt, timedOut });
      };

      options.forEach((o, i) => {
        const btn = h(
          'button.option',
          { type: 'button', dataset: { value: String(o.value) }, 'aria-label': o.label || String(o.value), onclick: () => finish(o.value, btn) },
          h('span.option-key', String(i + 1)),
          h('span.option-body', { html: o.html ?? o.label ?? String(o.value) }),
        );
        btn.style.setProperty('--i', i);
        wrap.append(btn);
      });
      gridKeyNav(wrap, cols || Math.min(options.length, 4));
      (container || this.stage).append(wrap);

      this._keyHandler = (input) => {
        if (input.type !== 'key') return;
        const n = parseInt(input.key, 10);
        if (n >= 1 && n <= options.length) finish(options[n - 1].value, wrap.children[n - 1]);
      };

      if (timeLimit > 0) {
        timerBar = h('div.answer-timer', h('i'));
        timerBar.style.setProperty('--dur', `${timeLimit}ms`);
        (container || this.stage).append(timerBar);
        requestAnimationFrame(() => timerBar.classList.add('is-running'));
        timeoutId = this.later(() => finish(undefined, null), timeLimit);
      }
    });
  }
}
