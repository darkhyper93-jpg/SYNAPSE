// DUAL — dual task (unlocked at higher levels): count one kind of item while
// reacting to another. Ends with the count question.
import { Challenge } from '../engine/challenge.js';
import { byDiff } from '../utils/math.js';
import { BASIC_SHAPES, DISTINCT_COLORS } from '../data/visuals.js';
import { sym, inlineSym } from './common.js';
import { h, now } from '../utils/dom.js';
import { t } from '../game/i18n.js';

export class DualChallenge extends Challenge {
  static meta = {
    id: 'dual',
    skill: 'attention',
    secondary: 'memory',
    targetTime: 700,
    minRating: 40,
    unlockSkills: ['attention'],
    reactionLike: true,
  };

  generate() {
    const d = this.difficulty;
    const rng = this.rng;
    const [countColor, hitColor, c3] = rng.sample(DISTINCT_COLORS, 3);
    const [countShape, hitShape, s3] = rng.sample(BASIC_SHAPES.filter((s) => s !== 'ring'), 3);
    const countItem = { shape: countShape, color: countColor };
    const hitItem = { shape: hitShape, color: hitColor };
    const duration = 15000;
    const show = byDiff(d, 900, 520);
    const gap = byDiff(d, 260, 120);
    const slots = Math.floor(duration / (show + gap));
    const cells = 9;
    const items = [];
    let countN = 0;
    for (let i = 0; i < slots; i++) {
      const r = rng.next();
      let it;
      if (r < 0.28) { it = { ...countItem, kind: 'count' }; countN++; }
      else if (r < 0.48 && i > 1) it = { ...hitItem, kind: 'hit' };
      else if (r < 0.66) it = { shape: countShape, color: rng.pick([hitColor, c3]), kind: 'lure' }; // count-shape lure
      else if (r < 0.84) it = { shape: rng.pick([hitShape, s3]), color: countColor, kind: 'lure' }; // count-colour lure
      else it = { shape: rng.pick([s3, hitShape]), color: rng.pick([c3, hitColor]), kind: 'lure' };
      if (it.kind === 'lure' && it.shape === hitShape && it.color === hitColor) it.kind = 'hit';
      it.cell = rng.int(0, cells - 1);
      items.push(it);
    }
    const start = Math.max(0, countN - rng.int(1, 2));
    this.params = { countItem, hitItem, items, show, gap, countN, options: [start, start + 1, start + 2, start + 3] };
  }

  validate() {
    const { items, countN, options } = this.params;
    const hits = items.filter((i) => i.kind === 'hit').length;
    return hits >= 3 && countN >= 3 && countN <= 12 && options.includes(countN);
  }

  async run() {
    const p = this.params;
    this.clearStage('stage-dual');
    this.setPrompt(t('dual.prompt', { count: inlineSym(p.countItem, this.settings), hit: inlineSym(p.hitItem, this.settings) }));
    const grid = h('div.dual-grid');
    const cells = Array.from({ length: 9 }, () => h('div.dual-cell'));
    grid.append(...cells);
    const btn = h('button.hit-btn', { type: 'button' }, h('span', t('focus.hit')), h('kbd.key-hint', 'SPACE'));
    this.stage.append(grid, btn);

    let current = null;
    const respond = () => {
      if (!current || current.done) return;
      current.done = true;
      const it = p.items[current.i];
      const ok = it.kind === 'hit';
      cells[it.cell].classList.add(ok ? 'is-hit' : 'is-bad');
      this.recordTrial({ correct: ok, rt: ok ? now() - current.t0 : null, feedback: 'mini', answerLabel: t('focus.falseAlarm') });
    };
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); respond(); });
    grid.addEventListener('pointerdown', (e) => { e.preventDefault(); respond(); });
    this._keyHandler = (input) => {
      if (input.type === 'key' && (input.code === 'Space' || input.key === ' ')) respond();
    };

    await this.wait(1500);
    for (let i = 0; i < p.items.length; i++) {
      this.setProgress(i, p.items.length + 1);
      const it = p.items[i];
      cells[it.cell].innerHTML = sym(it, this.settings);
      cells[it.cell].classList.add('is-on');
      current = { i, t0: now(), done: false };
      await this.wait(p.show);
      if (!current.done) {
        if (it.kind === 'hit') {
          cells[it.cell].classList.add('is-miss');
          this.recordTrial({ correct: false, rt: null, feedback: 'mini', answerLabel: t('focus.missed') });
        } else this.recordTrial({ correct: true, rt: null, feedback: 'none', weight: 0.15 });
      }
      current = null;
      await this.wait(60);
      cells[it.cell].className = 'dual-cell';
      cells[it.cell].innerHTML = '';
      await this.wait(p.gap);
    }
    this._keyHandler = null;
    this.clearStage('stage-dual');
    this.setPrompt(t('dual.count', { count: inlineSym(p.countItem, this.settings) }));
    await this.askOptions({
      options: p.options.map((v) => ({ value: v, label: String(v), html: `<span class="big-num">${v}</span>` })),
      correctValue: p.countN,
      targetTime: 3500,
      trial: { weight: 2, explanation: t('dual.answer', { n: p.countN }) },
    });
    this.setProgress(1, 1);
    await this.wait(900);
  }
}
