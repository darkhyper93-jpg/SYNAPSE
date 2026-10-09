// SPARK — reaction: nodes ignite; hit the cyan sparks fast, never the red decoys.
import { Challenge } from '../engine/challenge.js';
import { byDiff, byDiffF } from '../utils/math.js';
import { h, now } from '../utils/dom.js';
import { t } from '../game/i18n.js';
import { shapeSVG } from '../data/visuals.js';

const KEYS3 = ['q', 'w', 'e', 'a', 's', 'd', 'z', 'x', 'c'];
const KEYS4 = ['1', '2', '3', '4', 'q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 'z', 'x', 'c', 'v'];

export class SparkChallenge extends Challenge {
  static meta = { id: 'spark', skill: 'reaction', targetTime: 520, reactionLike: true };

  generate() {
    const d = this.difficulty;
    const rng = this.rng;
    const size = d < 0.45 ? 3 : 4;
    const count = byDiff(d, 9, 13);
    const decoyRate = d < 0.25 ? 0 : byDiffF(d, 0.15, 0.35);
    const doubleRate = d >= 0.65 ? byDiffF(d, 0, 0.35) : 0;
    const window = byDiff(d, 1300, 600);
    const events = [];
    let last = -1;
    for (let i = 0; i < count; i++) {
      const cells = [...Array(size * size).keys()].filter((c) => c !== last);
      const decoy = i > 1 && rng.chance(decoyRate);
      const cell = rng.pick(cells);
      const ev = { cell, decoy, fore: Math.round(rng.range(byDiff(d, 650, 350), byDiff(d, 1400, 1700))) };
      if (!decoy && rng.chance(doubleRate)) ev.decoyCell = rng.pick(cells.filter((c) => c !== cell));
      events.push(ev);
      last = cell;
    }
    this.params = { size, window, events };
  }

  /** Every spark is a trial; a decoy left alone counts 0.3. */
  pointUnits() {
    return this.params.events.reduce((s, e) => s + (e.decoy ? 0.3 : 1), 0);
  }

  validate() {
    const { events } = this.params;
    const targets = events.filter((e) => !e.decoy).length;
    return targets / events.length >= 0.6 && events.slice(0, 2).every((e) => !e.decoy);
  }

  async run() {
    const { size, window, events } = this.params;
    this.clearStage('stage-spark');
    this.setPrompt(t('spark.prompt', { target: `<span class="inline-sym">${shapeSVG('circle', 'cyan')}</span>`, decoy: `<span class="inline-sym">${shapeSVG('cross', 'red')}</span>` }));
    const keys = size === 3 ? KEYS3 : KEYS4;
    const grid = h('div.spark-grid');
    grid.style.setProperty('--cols', size);
    const nodes = [];
    for (let i = 0; i < size * size; i++) {
      const n = h('button.spark-node', { type: 'button', tabindex: -1, 'aria-label': t('ui.cellAria', { r: Math.floor(i / size) + 1, c: (i % size) + 1 }) }, h('span.spark-core'), h('kbd.key-hint', keys[i].toUpperCase()));
      n.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        hit(i);
      });
      nodes.push(n);
      grid.append(n);
    }
    this.stage.append(grid);

    let active = null; // { cell, decoy, decoyCell, t0, resolved }
    let resolveEvent = null;
    let lastEnd = -Infinity; // when the last spark went out

    const clearNodes = () => nodes.forEach((n) => n.classList.remove('is-target', 'is-decoy', 'is-hit', 'is-miss', 'is-bad'));

    const hit = (i) => {
      if (!active) {
        nodes[i].classList.add('is-bad');
        this.later(() => nodes[i].classList.remove('is-bad'), 250);
        // just after a spark went out it's a late answer to that one (already counted as missed)
        if (now() - lastEnd < 300) return;
        // Anticipation: tapping when nothing is lit.
        this.recordTrial({ correct: false, rt: null, feedback: 'mini', answerLabel: t('spark.early'), weight: 0.5 });
        return;
      }
      if (active.resolved) return;
      const rt = now() - active.t0;
      // Faster than humanly possible = anticipation, not reaction.
      if (rt < 90) {
        active.resolved = true;
        nodes[i].classList.add('is-bad');
        this.recordTrial({ correct: false, rt: null, feedback: 'mini', answerLabel: t('spark.early') });
        resolveEvent?.();
        return;
      }
      const onTarget = !active.decoy && i === active.cell;
      active.resolved = true;
      if (onTarget) {
        nodes[i].classList.add('is-hit');
        const ring = h('span.spark-burst');
        nodes[i].append(ring);
        setTimeout(() => ring.remove(), 500);
        const r = nodes[i].getBoundingClientRect();
        this.hooks?.burst?.(r.left + r.width / 2, r.top + r.height / 2, '#2ee6ff', 14);
      } else nodes[i].classList.add('is-bad');
      this.recordTrial({ correct: onTarget, rt: onTarget ? rt : null, feedback: 'mini', answerLabel: active.decoy ? t('spark.decoy') : t('spark.wrongNode') });
      resolveEvent?.();
    };

    this._keyHandler = (input) => {
      if (input.type !== 'key') return;
      const idx = keys.indexOf(String(input.key).toLowerCase());
      if (idx >= 0) hit(idx);
    };

    await this.wait(900);
    for (let k = 0; k < events.length; k++) {
      this.setProgress(k, events.length);
      const ev = events[k];
      await this.wait(ev.fore);
      clearNodes();
      active = { ...ev, t0: now(), resolved: false };
      nodes[ev.cell].classList.add(ev.decoy ? 'is-decoy' : 'is-target');
      if (ev.decoyCell != null) nodes[ev.decoyCell].classList.add('is-decoy');
      await new Promise((resolve) => {
        resolveEvent = resolve;
        this.later(resolve, window);
      });
      resolveEvent = null;
      if (!active.resolved) {
        active.resolved = true;
        if (ev.decoy) this.recordTrial({ correct: true, rt: null, feedback: 'none', weight: 0.3 });
        else {
          nodes[ev.cell].classList.add('is-miss');
          this.recordTrial({ correct: false, rt: null, feedback: 'mini', answerLabel: t('spark.missed') });
        }
      }
      await this.wait(160);
      active = null;
      lastEnd = now();
      clearNodes();
    }
    this._keyHandler = null;
    this.setProgress(events.length, events.length);
    await this.wait(300);
  }
}
