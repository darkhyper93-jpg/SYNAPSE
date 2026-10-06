// FLEX — cognitive flexibility: sort by COLOUR or by SHAPE, the rule switches.
// The first error right after a switch is "forgiven" (keeps streak, half weight).
import { Challenge } from '../engine/challenge.js';
import { byDiff } from '../utils/math.js';
import { h, now } from '../utils/dom.js';
import { t } from '../game/i18n.js';
import { sym } from './common.js';
import { COLORS } from '../data/visuals.js';

export class FlexChallenge extends Challenge {
  static meta = { id: 'flex', skill: 'flexibility', targetTime: 800, reactionLike: true };

  generate() {
    const d = this.difficulty;
    const rng = this.rng;
    const colors = rng.sample(['red', 'blue', 'yellow', 'green'], 2);
    const shapes = rng.sample(['circle', 'square', 'triangle', 'star'], 2);
    const count = byDiff(d, 16, 22);
    const cueOnly = d >= 0.7; // rule announced only by the frame colour
    const reversals = d >= 0.4 && !cueOnly; // mapping can also flip inside a dimension
    const minRun = byDiff(d, 6, 2);
    const maxRun = byDiff(d, 8, 5);

    // A rule = { dim: 'color'|'shape', flip: bool }
    // In cue mode each dimension keeps a fixed mapping; only the frame colour tells which is active.
    const flipOf = () => (cueOnly ? false : rng.chance(0.5));
    let rule = { dim: rng.pick(['color', 'shape']), flip: flipOf() };
    const trials = [];
    let run = rng.int(minRun, maxRun);
    for (let i = 0; i < count; i++) {
      let switched = false;
      if (i > 0 && --run <= 0) {
        const opts = [{ dim: rule.dim === 'color' ? 'shape' : 'color', flip: flipOf() }];
        if (reversals) opts.push({ dim: rule.dim, flip: !rule.flip });
        rule = rng.pick(opts);
        run = rng.int(minRun, maxRun);
        switched = true;
      }
      const ci = rng.int(0, 1);
      // Mostly incongruent trials (colour and shape point to different sides): that's the test.
      const incongruent = rng.chance(byDiff(d, 50, 80) / 100);
      const si = incongruent ? 1 - ci : ci;
      const stim = { color: colors[ci], shape: shapes[si] };
      const idx = rule.dim === 'color' ? ci : si;
      const side = (rule.flip ? 1 - idx : idx) === 0 ? 'left' : 'right';
      trials.push({ ...stim, rule: { ...rule }, switched, side });
    }
    this.params = { colors, shapes, trials, window: byDiff(d, 2300, 1100), cueOnly, legend: d < 0.5 };
  }

  validate() {
    const { trials } = this.params;
    // At least one switch and both sides used.
    return trials.some((x) => x.switched) && trials.some((x) => x.side === 'left') && trials.some((x) => x.side === 'right');
  }

  mappingHTML(rule) {
    const { colors, shapes } = this.params;
    const vals = rule.dim === 'color' ? colors : shapes;
    const [l, r] = rule.flip ? [vals[1], vals[0]] : vals;
    const show = (v) =>
      rule.dim === 'color'
        ? `<b style="color:${COLORS[v].hex}">${t(`color.${v}`)}</b>`
        : `<span class="inline-sym">${sym({ shape: v, color: '#e8ecff' }, {})}</span>`;
    return `<span class="map-side">← ${show(l)}</span><span class="map-dim">${t(`flex.by.${rule.dim}`)}</span><span class="map-side">${show(r)} →</span>`;
  }

  async run() {
    const p = this.params;
    this.clearStage('stage-flex');
    const arena = h('div.flex-arena');
    const frame = h('div.flex-frame');
    const stim = h('div.flex-stim');
    frame.append(stim);
    const legend = h('div.flex-legend');
    const left = h('button.flex-side.is-left', { type: 'button' }, h('span', '←'), h('kbd.key-hint', '← / A'));
    const right = h('button.flex-side.is-right', { type: 'button' }, h('span', '→'), h('kbd.key-hint', '→ / L'));
    arena.append(left, frame, right);
    const banner = h('div.rule-banner');
    this.stage.append(banner, arena, legend);
    if (p.cueOnly) {
      this.setPrompt(t('flex.cuePrompt', { color: `<b class="cue-color">${t('flex.frameColor')}</b>`, shape: `<b class="cue-shape">${t('flex.frameShape')}</b>` }));
    } else this.setPrompt(t('flex.prompt'));

    let current = null;
    let lastRule = null;
    let postSwitch = false;
    const answer = (side) => {
      if (!current || current.done) return;
      current.done = true;
      const tr = p.trials[current.i];
      const correct = side === tr.side;
      const rt = now() - current.t0;
      (side === 'left' ? left : right).classList.add(correct ? 'is-hit' : 'is-bad');
      // The symbol flies toward the chosen side.
      stim.classList.add(side === 'left' ? 'fly-left' : 'fly-right', correct ? 'is-ok' : 'is-bad');
      const forgiving = !correct && postSwitch;
      this.recordTrial({
        correct,
        rt: correct ? rt : null,
        feedback: 'mini',
        forgiving,
        weight: forgiving ? 0.5 : 1,
        answerLabel: tr.side === 'left' ? '←' : '→',
      });
      current.resolve();
    };
    left.addEventListener('pointerdown', (e) => { e.preventDefault(); answer('left'); });
    right.addEventListener('pointerdown', (e) => { e.preventDefault(); answer('right'); });
    // Swipe anywhere on the frame: ← / →
    let swipe = null;
    frame.addEventListener('pointerdown', (e) => {
      swipe = { x: e.clientX, y: e.clientY };
      frame.setPointerCapture?.(e.pointerId);
    });
    frame.addEventListener('pointermove', (e) => {
      if (!swipe) return;
      const dx = e.clientX - swipe.x;
      stim.style.transform = `translateX(${Math.max(-60, Math.min(60, dx * 0.5))}px) rotate(${dx * 0.05}deg)`;
      if (Math.abs(dx) > 46 && Math.abs(dx) > Math.abs(e.clientY - swipe.y)) {
        swipe = null;
        stim.style.transform = '';
        answer(dx < 0 ? 'left' : 'right');
      }
    });
    const endSwipe = () => {
      swipe = null;
      stim.style.transform = '';
    };
    frame.addEventListener('pointerup', endSwipe);
    frame.addEventListener('pointercancel', endSwipe);
    this._keyHandler = (input) => {
      if (input.type !== 'key') return;
      const k = String(input.key).toLowerCase();
      if (k === 'arrowleft' || k === 'a') answer('left');
      if (k === 'arrowright' || k === 'l' || k === 'd') answer('right');
    };

    const showRule = async (rule, first) => {
      const changedDim = !lastRule || lastRule.dim !== rule.dim;
      frame.dataset.dim = rule.dim;
      if (p.cueOnly) {
        // Only the frame colour announces the active dimension (mapping is fixed per dimension).
        if (!first) this.hooks?.sound?.('tick');
        return;
      }
      banner.innerHTML = `<div class="rule-banner-inner">${first ? t('flex.rule') : t('flex.newRule')}</div><div class="rule-map">${this.mappingHTML(rule)}</div>`;
      // (is-on was already removed 200ms ago and the inner banner is new, so no reflow is needed to restart it)
      banner.classList.add('is-on');
      if (!first) this.hooks?.sound?.('rule');
      legend.innerHTML = p.legend ? this.mappingHTML(rule) : '';
      await this.wait(first ? 2600 : changedDim ? 1900 : 1600);
      banner.classList.remove('is-on');
      await this.wait(200);
    };

    if (p.cueOnly) {
      banner.innerHTML = `<div class="rule-banner-inner">${t('flex.rule')}</div><div class="rule-map is-cue-color">${this.mappingHTML({ dim: 'color', flip: false })}</div><div class="rule-map is-cue-shape">${this.mappingHTML({ dim: 'shape', flip: false })}</div>`;
      banner.classList.add('is-on');
      await this.wait(4200);
      banner.classList.remove('is-on');
      await this.wait(300);
    }

    for (let i = 0; i < p.trials.length; i++) {
      this.setProgress(i, p.trials.length);
      const tr = p.trials[i];
      if (i === 0 || tr.switched) {
        await showRule(tr.rule, i === 0);
        postSwitch = i > 0;
      }
      lastRule = tr.rule;
      frame.dataset.dim = tr.rule.dim;
      stim.innerHTML = sym(tr, this.settings);
      stim.classList.add('is-on');
      await new Promise((resolve) => {
        current = { i, t0: now(), done: false, resolve };
        this.later(resolve, p.window);
      });
      if (!current.done) {
        current.done = true;
        const forgiving = postSwitch;
        this.recordTrial({ correct: false, rt: null, feedback: 'mini', forgiving, weight: forgiving ? 0.5 : 1, answerLabel: t('flex.tooSlow') });
      }
      postSwitch = false;
      current = null;
      stim.classList.remove('is-on', 'fly-left', 'fly-right', 'is-ok', 'is-bad');
      stim.innerHTML = '';
      left.classList.remove('is-hit', 'is-bad');
      right.classList.remove('is-hit', 'is-bad');
      await this.wait(220);
    }
    this._keyHandler = null;
    this.setProgress(p.trials.length, p.trials.length);
  }
}
