// Shared rendering helpers for challenges.
import { h, now, gridKeyNav } from '../utils/dom.js';
import { shapeSVG, colorChip } from '../data/visuals.js';
import { t } from '../game/i18n.js';

export const sym = (item, settings = {}, opts = {}) =>
  shapeSVG(item.shape, item.color, { glyph: settings.colorAssist ? t(`glyph.${item.color}`) : '', ...opts });

export const symbolLabel = (item) => `${t(`color.${item.color}`)} ${t(`shape.${item.shape}`)}`;

export const colorOption = (color, settings = {}) => ({
  value: color,
  label: t(`color.${color}`),
  html: `${colorChip(color)}<span>${t(`color.${color}`)}</span>${settings.colorAssist ? `<em class="glyph">${t(`glyph.${color}`)}</em>` : ''}`,
});

export const symbolOption = (item, settings = {}, value) => ({
  value: value ?? `${item.shape}|${item.color}`,
  label: symbolLabel(item),
  html: sym(item, settings),
});

/** Inline symbol for prompts. */
export const inlineSym = (item, settings = {}) => `<span class="inline-sym">${sym(item, settings)}</span>`;

/** A board (grid) element. cellFn(i) -> html string | null. */
export function board(rows, cols, cellFn = () => '', { cls = '' } = {}) {
  const el = h(`div.board${cls ? '.' + cls : ''}`);
  el.style.setProperty('--cols', cols);
  el.style.setProperty('--rows', rows);
  for (let i = 0; i < rows * cols; i++) {
    const c = h('div.cell', { dataset: { i } });
    const html = cellFn(i);
    if (html) c.innerHTML = html;
    el.append(c);
  }
  return el;
}

/** Clickable board. Resolves with { index, rt } on first click. */
export function clickBoard(ch, rows, cols, { cls = '', cellFn = () => '', container } = {}) {
  const el = h(`div.board.is-clickable${cls ? '.' + cls : ''}`, { role: 'grid' });
  el.style.setProperty('--cols', cols);
  el.style.setProperty('--rows', rows);
  const t0 = now();
  let resolveFn;
  const promise = new Promise((r) => (resolveFn = r));
  const cells = [];
  for (let i = 0; i < rows * cols; i++) {
    const btn = h('button.cell', {
      type: 'button',
      dataset: { i },
      'aria-label': t('ui.cellAria', { r: Math.floor(i / cols) + 1, c: (i % cols) + 1 }),
      onclick: () => resolveFn({ index: i, rt: now() - t0, el: btn }),
    });
    const html = cellFn(i);
    if (html) btn.innerHTML = html;
    cells.push(btn);
    el.append(btn);
  }
  gridKeyNav(el, cols);
  (container || ch.stage).append(el);
  requestAnimationFrame(() => cells[0]?.focus({ preventScroll: true }));
  return { el, cells, result: promise };
}

/** Clickable board that yields every click (for sequences). */
export function multiClickBoard(ch, rows, cols, onClick, { cls = '' } = {}) {
  const el = h(`div.board.is-clickable${cls ? '.' + cls : ''}`);
  el.style.setProperty('--cols', cols);
  el.style.setProperty('--rows', rows);
  const cells = [];
  for (let i = 0; i < rows * cols; i++) {
    const btn = h('button.cell', {
      type: 'button',
      dataset: { i },
      'aria-label': t('ui.cellAria', { r: Math.floor(i / cols) + 1, c: (i % cols) + 1 }),
      onclick: () => onClick(i, btn),
    });
    cells.push(btn);
    el.append(btn);
  }
  gridKeyNav(el, cols);
  ch.stage.append(el);
  requestAnimationFrame(() => cells[0]?.focus({ preventScroll: true }));
  return { el, cells };
}

/** Thin progress bar that drains over `ms` (exposure timers). */
export function drainBar(ms, cls = '') {
  const bar = h(`div.drain${cls ? '.' + cls : ''}`, h('i'));
  bar.style.setProperty('--dur', `${ms}ms`);
  requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.add('is-running')));
  return bar;
}

/** Visual noise mask between encoding and recall (prevents after-images). */
export function noiseMask(rng, rows, cols) {
  const shapes = ['circle', 'square', 'triangle', 'diamond', 'star', 'cross', 'ring', 'hexagon'];
  const colors = ['red', 'blue', 'yellow', 'green', 'violet', 'cyan', 'pink', 'orange'];
  return board(rows, cols, () => (rng.chance(0.75) ? shapeSVG(rng.pick(shapes), rng.pick(colors), { cls: 'is-noise' }) : ''), { cls: 'is-mask' });
}

export const CORNERS = ['tl', 'tr', 'bl', 'br'];
export function cornerIndex(corner, rows, cols) {
  return { tl: 0, tr: cols - 1, bl: (rows - 1) * cols, br: rows * cols - 1 }[corner];
}
