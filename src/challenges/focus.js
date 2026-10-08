// FOCUS — selective attention: respond only to the target conjunction, ignore lures,
// flankers and (at higher levels) the exception rule.
import { Challenge } from '../engine/challenge.js';
import { byDiff, byDiffF } from '../utils/math.js';
import { DISTINCT_COLORS, BASIC_SHAPES } from '../data/visuals.js';
import { sym, inlineSym } from './common.js';
import { h, now } from '../utils/dom.js';
import { t } from '../game/i18n.js';

export class FocusChallenge extends Challenge {
  static meta = { id: 'focus', skill: 'attention', targetTime: 650, reactionLike: true };

  generate() {
    const d = this.difficulty;
    const rng = this.rng;
    const colors = rng.sample(DISTINCT_COLORS, 4);
    const shapes = rng.sample(BASIC_SHAPES.filter((s) => s !== 'ring'), 4);
    const target = { shape: shapes[0], color: colors[0] };
    const exception = d >= 0.55 ? { shape: shapes[1], color: colors[1] } : null;
    const count = byDiff(d, 18, 28);
    const pTarget = 0.28;
    const items = [];
    for (let i = 0; i < count; i++) {
      const prev = items[i - 1];
      const r = rng.next();
      let it;
      if (i > 0 && r < pTarget && !(prev && prev.isTarget)) it = { ...target };
      else if (r < pTarget + 0.25) it = { shape: target.shape, color: rng.pick(colors.slice(1)) }; // same shape lure
      else if (r < pTarget + 0.5) it = { shape: rng.pick(shapes.slice(1)), color: target.color }; // same colour lure
      else it = { shape: rng.pick(shapes.slice(1)), color: rng.pick(colors.slice(1)) };
      it.isTarget = it.shape === target.shape && it.color === target.color;
      items.push(it);
    }
    if (exception) {
      // Insert exception → target pairs, and a few exceptions followed by non-targets.
      const pairs = byDiff(d, 2, 3);
      let placed = 0;
      for (let tries = 0; placed < pairs && tries < 60; tries++) {
        const i = rng.int(2, count - 2);
        if (items[i - 1].isTarget || items[i].exception || items[i + 1].exception || items[i - 1].exception) continue;
        items[i] = { ...exception, exception: true, isTarget: false };
        items[i + 1] = { ...target, isTarget: true };
        placed++;
      }
    }
    // The rule is about what the player sees: a filler that happens to look exactly like the
    // exception is the exception (the target right after it must be held back too).
    if (exception) items.forEach((it) => it.shape === exception.shape && it.color === exception.color && (it.exception = true));
    // Who must respond? Targets not preceded by the exception.
    items.forEach((it, i) => {
      it.respond = it.isTarget && !(exception && items[i - 1]?.exception);
    });
    const flankers = d >= 0.35;
    const flankerTargets = d >= 0.7;
    this.params = {
      target,
      exception,
      items,
      show: byDiff(d, 1050, 560),
      gap: byDiff(d, 260, 140),
      flankers,
      flankerTargets,
      flankerCount: byDiff(d, 2, 5),
      flankerAnim: byDiffF(d, 0.4, 1),
    };
  }

  validate() {
    const { items, exception } = this.params;
    const responds = items.filter((i) => i.respond).length;
    if (responds < 4 || items[0].isTarget) return false;
    if (exception) {
      const withheld = items.filter((it, i) => it.isTarget && items[i - 1]?.exception).length;
      if (withheld < 1) return false;
      if (exception.shape === this.params.target.shape && exception.color === this.params.target.color) return false;
    }
    return true;
  }

  async run() {
    const p = this.params;
    this.clearStage('stage-focus');
    const ruleHtml = p.exception
      ? t('focus.ruleEx', { target: inlineSym(p.target, this.settings), ex: inlineSym(p.exception, this.settings) })
      : t('focus.rule', { target: inlineSym(p.target, this.settings) });
    this.setPrompt(ruleHtml);
    const arena = h('div.focus-arena');
    const center = h('div.focus-center');
    const flank = h('div.focus-flankers');
    const btn = h('button.hit-btn', { type: 'button' }, h('span', t('focus.hit')), h('kbd.key-hint', 'SPACE'));
    arena.append(flank, center);
    this.stage.append(arena, btn);

    let current = null; // { idx, t0, responded }
    const respond = () => {
      if (!current || current.responded) {
        // Pressing during the blank gap: counts as a false alarm only if nothing is showing.
        if (!current) {
          arena.classList.add('flash-bad');
          this.later(() => arena.classList.remove('flash-bad'), 200);
        }
        return;
      }
      current.responded = true;
      const it = p.items[current.idx];
      const rt = now() - current.t0;
      center.classList.add(it.respond ? 'is-hit' : 'is-bad');
      if (it.respond) {
        const ring = h('span.hit-wave');
        arena.append(ring);
        setTimeout(() => ring.remove(), 600);
      }
      this.recordTrial({
        correct: it.respond,
        rt: it.respond ? rt : null,
        feedback: 'mini',
        answerLabel: it.isTarget ? t('focus.exceptionHit') : t('focus.falseAlarm'),
      });
    };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      respond();
    });
    arena.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      respond();
    });
    this._keyHandler = (input) => {
      if (input.type === 'key' && (input.code === 'Space' || input.key === ' ' || input.key === 'Enter')) respond();
    };

    await this.wait(1200);
    for (let i = 0; i < p.items.length; i++) {
      this.setProgress(i, p.items.length);
      const it = p.items[i];
      center.className = 'focus-center is-on';
      center.innerHTML = sym(it, this.settings);
      if (p.flankers) {
        flank.innerHTML = '';
        for (let k = 0; k < p.flankerCount; k++) {
          const lure = p.flankerTargets && this.rng.chance(0.3)
            ? p.target
            : { shape: this.rng.pick(BASIC_SHAPES), color: this.rng.pick(DISTINCT_COLORS) };
          const f = h('span.flanker', { html: sym(lure, this.settings) });
          const ang = (360 / p.flankerCount) * k + this.rng.range(-20, 20);
          f.style.setProperty('--a', `${ang}deg`);
          f.style.setProperty('--spin', `${this.rng.range(-1, 1) * 120 * p.flankerAnim}deg`);
          flank.append(f);
        }
      }
      current = { idx: i, t0: now(), responded: false };
      await this.wait(p.show);
      if (!current.responded) {
        if (it.respond) {
          center.classList.add('is-miss');
          this.recordTrial({ correct: false, rt: null, feedback: 'mini', answerLabel: t('focus.missed') });
        } else {
          // Correct rejection: low weight so streams don't inflate accuracy.
          this.recordTrial({ correct: true, rt: null, feedback: 'none', weight: it.isTarget ? 1 : 0.2 });
        }
      }
      current = null;
      center.className = 'focus-center';
      center.innerHTML = '';
      flank.innerHTML = '';
      await this.wait(p.gap);
    }
    this._keyHandler = null;
    this.setProgress(p.items.length, p.items.length);
  }
}

