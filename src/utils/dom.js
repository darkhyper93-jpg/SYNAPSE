// Tiny DOM helpers. `h('div.card#id', {onclick}, ...children)`

export function h(tag, attrs = {}, ...children) {
  if (attrs === null || typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs)) {
    children.unshift(attrs);
    attrs = {};
  }
  const [, name = 'div', rest = ''] = tag.match(/^([a-z0-9-]*)(.*)$/i);
  const el = document.createElement(name || 'div');
  for (const part of rest.match(/[.#][^.#]+/g) || []) {
    if (part[0] === '.') el.classList.add(part.slice(1));
    else el.id = part.slice(1);
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className += ` ${v}`;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('--')) el.style.setProperty(k, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function svgEl(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstChild;
}

export const now = () => performance.now();

export const isTouch = () => window.matchMedia('(hover: none) and (pointer: coarse)').matches;

/** Animate a number inside an element. */
export function countUp(el, to, { from = 0, duration = 900, format = (v) => Math.round(v).toLocaleString() } = {}) {
  const start = now();
  const reduce = document.body.classList.contains('reduce-motion');
  if (reduce || duration <= 0) {
    el.textContent = format(to);
    return;
  }
  const step = () => {
    const t = Math.min(1, (now() - start) / duration);
    const e = 1 - (1 - t) ** 3;
    el.textContent = format(from + (to - from) * e);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Move focus between buttons of a grid with arrow keys. */
export function gridKeyNav(container, cols) {
  container.addEventListener('keydown', (e) => {
    const items = $$('button:not([disabled])', container);
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
    if (!delta) return;
    e.preventDefault();
    e.stopPropagation();
    const next = items[(i + delta + items.length) % items.length];
    next?.focus();
  });
}
