// Tiny looping animated demos that show how each challenge works (intro cards, unlocks).
// Each demo = static HTML + a timeline of [ms, action] steps, replayed while visible.
import { h } from '../utils/dom.js';
import { shapeSVG } from '../data/visuals.js';
import { isoSVG } from '../challenges/parallax.js';

const S = (shape, color) => shapeSVG(shape, color);
const $ = (el, sel) => el.querySelector(sel);
const $$ = (el, sel) => [...el.querySelectorAll(sel)];

// timeline helpers
const add = (sel, c = 'on') => (el) => $$(el, sel).forEach((n) => n.classList.add(c));
const rm = (sel, c = 'on') => (el) => $$(el, sel).forEach((n) => n.classList.remove(c));
const html = (sel, v) => (el) => $$(el, sel).forEach((n) => (n.innerHTML = v));
const tap = (sel) => (el) => {
  const target = $(el, sel);
  if (!target) return;
  const ring = h('span.d-tap');
  const r = target.getBoundingClientRect();
  const b = el.getBoundingClientRect();
  ring.style.left = `${r.left - b.left + r.width / 2}px`;
  ring.style.top = `${r.top - b.top + r.height / 2}px`;
  el.append(ring);
  setTimeout(() => ring.remove(), 700);
};
const move = (positions) => (el) =>
  $$(el, '.d-dot').forEach((d, i) => (d.style.transform = `translate(${positions[i][0]}px, ${positions[i][1]}px)`));
const seq = (...fns) => (el) => fns.forEach((f) => f(el));

const cells = (n, fill = () => '') => Array.from({ length: n }, (_, i) => `<span class="dc" data-i="${i}">${fill(i)}</span>`).join('');

const DEMOS = {
  echo: {
    loop: 3800,
    html: `<div class="d-grid" style="--c:3">${cells(6, (i) => (i === 0 ? `<i class="d-sym">${S('star', 'yellow')}</i>` : i === 2 ? `<i class="d-sym">${S('circle', 'cyan')}</i>` : i === 4 ? `<i class="d-sym">${S('triangle', 'pink')}</i>` : ''))}</div>
      <div class="d-q">? ${S('star', 'yellow')}</div>`,
    steps: [
      [100, add('.d-sym')],
      [1500, seq(rm('.d-sym'), add('.d-q'))],
      [2300, seq(tap('.dc[data-i="0"]'), add('.dc[data-i="0"]', 'ok'), add('.dc[data-i="0"] .d-sym'))],
    ],
  },
  onesecond: {
    loop: 3400,
    html: `<div class="d-grid d-dense" style="--c:4">${cells(8, (i) => `<i class="d-sym">${S(['star', 'circle', 'square', 'triangle', 'diamond', 'cross', 'ring', 'hexagon'][i], ['red', 'blue', 'yellow', 'green', 'violet', 'cyan', 'pink', 'orange'][i])}</i>`)}</div>
      <div class="d-mask"></div>
      <div class="d-opts"><b>${S('circle', 'blue')}</b><b>${S('cross', 'cyan')}</b><b>${S('star', 'red')}</b></div>`,
    steps: [
      [200, add('.d-sym')],
      [700, seq(rm('.d-sym'), add('.d-mask'))],
      [900, seq(rm('.d-mask'), add('.d-opts'))],
      [1800, seq(tap('.d-opts b:nth-child(3)'), add('.d-opts b:nth-child(3)', 'ok'))],
    ],
  },
  trace: {
    loop: 3600,
    html: `<div class="d-arena">${'<i class="d-dot"></i>'.repeat(5)}</div>`,
    steps: [
      [0, seq(move([[20, 20], [120, 30], [70, 70], [180, 60], [40, 75]]), add('.d-dot:first-child', 'pink'))],
      [1000, seq(rm('.d-dot', 'pink'), move([[150, 70], [40, 40], [190, 20], [80, 20], [110, 60]]))],
      [1800, move([[70, 30], [170, 75], [30, 65], [130, 25], [190, 50]])],
      [2700, seq(tap('.d-dot:first-child'), add('.d-dot:first-child', 'ok'))],
    ],
  },
  contradict: {
    loop: 3600,
    html: `<div class="d-pairs"><span>2 → 4</span><span>3 → 9</span><span>4 → <b class="d-ans">?</b></span></div>`,
    steps: [
      [100, add('.d-pairs span:nth-child(1)')],
      [500, add('.d-pairs span:nth-child(2)')],
      [900, add('.d-pairs span:nth-child(3)')],
      [1900, seq(add('.d-ans', 'flip'), html('.d-ans', '16'))],
    ],
  },
  spark: {
    loop: 3400,
    html: `<div class="d-grid d-nodes" style="--c:3">${cells(9, () => '<i class="d-node"></i>')}</div>`,
    steps: [
      [300, add('.dc[data-i="4"]', 'lit')],
      [650, seq(tap('.dc[data-i="4"]'), add('.dc[data-i="4"]', 'ok'))],
      [900, rm('.dc', 'lit')],
      [920, rm('.dc', 'ok')],
      [1300, add('.dc[data-i="2"]', 'decoy')],
      [2100, rm('.dc', 'decoy')],
      [2400, add('.dc[data-i="6"]', 'lit')],
      [2700, seq(tap('.dc[data-i="6"]'), add('.dc[data-i="6"]', 'ok'))],
      [3000, rm('.dc', 'lit')],
    ],
  },
  focus: {
    loop: 3200,
    html: `<div class="d-rule">→ ${S('square', 'green')}</div><div class="d-center"></div>`,
    steps: [
      [0, seq(html('.d-center', S('circle', 'green')), add('.d-center'))],
      [500, rm('.d-center')],
      [650, seq(html('.d-center', S('square', 'green')), add('.d-center'))],
      [900, seq(tap('.d-center'), add('.d-center', 'ok'))],
      [1200, seq(rm('.d-center'), rm('.d-center', 'ok'))],
      [1350, seq(html('.d-center', S('square', 'red')), add('.d-center'))],
      [1900, rm('.d-center')],
      [2050, seq(html('.d-center', S('square', 'green')), add('.d-center'))],
      [2300, seq(tap('.d-center'), add('.d-center', 'ok'))],
      [2700, seq(rm('.d-center'), rm('.d-center', 'ok'))],
    ],
  },
  mirror: {
    loop: 3400,
    html: `<div class="d-mirror"><div class="d-mgrid">${cells(9, (i) => ([0, 1, 4, 8].includes(i) ? '<i class="on"></i>' : '<i></i>'))}</div><b>⇆</b></div>`,
    steps: [
      [700, add('.d-mgrid', 'flip')],
      [2300, rm('.d-mgrid', 'flip')],
    ],
  },
  parallax: {
    loop: 2400,
    html: (() => {
      const base = [[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 1, 0], [2, 1, 1]];
      const rot = (c, k) => {
        let [x, y] = c;
        for (let i = 0; i < k; i++) [x, y] = [-y, x];
        return [x, y, c[2]];
      };
      const frames = [0, 1, 2, 3].map((k) => `<i class="d-frame">${isoSVG(base.map((c) => rot(c, k)), 205)}</i>`).join('');
      return `<div class="d-iso"><span class="d-ref">${isoSVG(base, 205)}</span><b>=</b><span class="d-spin">${frames}</span></div>`;
    })(),
    steps: [
      [0, seq(rm('.d-frame'), add('.d-frame:nth-child(1)'))],
      [600, seq(rm('.d-frame'), add('.d-frame:nth-child(2)'))],
      [1200, seq(rm('.d-frame'), add('.d-frame:nth-child(3)'))],
      [1800, seq(rm('.d-frame'), add('.d-frame:nth-child(4)'))],
    ],
  },
  flex: {
    loop: 4200,
    html: `<div class="d-flex"><span class="d-side">←</span><div class="d-frame-box"><i class="d-stim"></i></div><span class="d-side">→</span></div><div class="d-flex-rule"></div><div class="d-banner">NEW RULE</div>`,
    steps: [
      [0, seq(html('.d-flex-rule', `← <b style="color:#ff4d6d">●</b> · <b style="color:#4d7cff">●</b> →`), html('.d-stim', S('square', 'red')), add('.d-stim'))],
      [800, seq(tap('.d-side:first-child'), add('.d-stim', 'fly-l'))],
      [1300, seq(rm('.d-stim'), rm('.d-stim', 'fly-l'))],
      [1500, add('.d-banner')],
      [2300, seq(rm('.d-banner'), html('.d-flex-rule', `← ${S('circle', '#e8ecff')} · ${S('square', '#e8ecff')} →`))],
      [2600, seq(html('.d-stim', S('square', 'red')), add('.d-stim'))],
      [3300, seq(tap('.d-side:last-child'), add('.d-stim', 'fly-r'))],
      [3800, seq(rm('.d-stim'), rm('.d-stim', 'fly-r'))],
    ],
  },
  decision: {
    loop: 4200,
    html: `<div class="d-field">${['red', 'blue', 'red', 'yellow', 'red', 'blue'].map((c, i) => `<i class="d-fdot" style="--c:var(--d-${c});left:${[15, 60, 35, 80, 50, 20][i]}%;top:${[30, 20, 65, 55, 35, 60][i]}%"></i>`).join('')}</div>
      <div class="d-q">LEAST?</div><div class="d-opts d-colors"><b style="--c:var(--d-red)"></b><b style="--c:var(--d-blue)"></b><b style="--c:var(--d-yellow)"></b></div>`,
    steps: [
      ...[0, 1, 2, 3, 4, 5].flatMap((i) => [
        [200 + i * 320, add(`.d-fdot:nth-child(${i + 1})`)],
        [440 + i * 320, rm(`.d-fdot:nth-child(${i + 1})`)],
      ]),
      [2300, seq(add('.d-q'), add('.d-opts'))],
      [3100, seq(tap('.d-colors b:nth-child(3)'), add('.d-colors b:nth-child(3)', 'ok'))],
    ],
  },
  dual: {
    loop: 4200,
    html: `<div class="d-dual"><div class="d-grid" style="--c:3">${cells(9)}</div><div class="d-count">0</div></div>`,
    steps: [
      [300, html('.dc[data-i="1"]', `<i class="d-sym on">${S('circle', 'blue')}</i>`)],
      [500, html('.d-count', '1')],
      [900, html('.dc', '')],
      [1200, html('.dc[data-i="5"]', `<i class="d-sym on">${S('square', 'red')}</i>`)],
      [1450, seq(tap('.dc[data-i="5"]'), add('.dc[data-i="5"]', 'ok'))],
      [1900, seq(html('.dc', ''), rm('.dc', 'ok'))],
      [2200, html('.dc[data-i="6"]', `<i class="d-sym on">${S('circle', 'blue')}</i>`)],
      [2400, html('.d-count', '2')],
      [2800, html('.dc', '')],
      [3100, html('.dc[data-i="3"]', `<i class="d-sym on">${S('square', 'blue')}</i>`)],
      [3600, seq(html('.dc', ''), html('.d-count', '0'))],
    ],
  },
  nexus: {
    loop: 4000,
    html: `<div class="d-grid" style="--c:3">${cells(6, (i) => (i === 1 ? `<i class="d-sym">${S('diamond', 'yellow')}</i>` : i === 2 ? `<i class="d-sym">${S('circle', 'pink')}</i>` : i === 3 ? `<i class="d-sym">${S('star', 'green')}</i>` : ''))}</div>
      <div class="d-q">${S('diamond', '#e8ecff')} → ?</div><div class="d-opts d-colors"><b style="--c:var(--d-green)"></b><b style="--c:var(--d-pink)"></b><b style="--c:var(--d-blue)"></b></div>`,
    steps: [
      [100, add('.d-sym')],
      [1500, seq(rm('.d-sym'), add('.d-q'), add('.d-opts'))],
      [2500, seq(tap('.d-colors b:nth-child(2)'), add('.d-colors b:nth-child(2)', 'ok'))],
    ],
  },
};

// Each demo's markup is parsed once and cloned on every loop (re-parsing the SVG-heavy HTML was
// periodic main-thread work under the intro card).
const templates = new Map();
function demoContent(id, markup) {
  let tpl = templates.get(id);
  if (!tpl) {
    tpl = document.createElement('template');
    tpl.innerHTML = markup;
    templates.set(id, tpl);
  }
  return tpl.content.cloneNode(true);
}

/** Build a looping demo element for a challenge type (null if none). */
export function demoFor(id) {
  const spec = DEMOS[id];
  if (!spec) return null;
  const el = h(`div.demo.demo-${id}`, { 'aria-hidden': 'true' });
  let wasConnected = false;
  let orphanCycles = 0;
  const timers = new Set();
  const cycle = () => {
    if (el.isConnected) wasConnected = true;
    else if (wasConnected || ++orphanCycles > 2) {
      timers.forEach(clearTimeout);
      return;
    }
    el.replaceChildren(demoContent(id, spec.html));
    for (const [ms, fn] of spec.steps) {
      const id2 = setTimeout(() => {
        timers.delete(id2);
        if (el.isConnected) fn(el);
      }, ms);
      timers.add(id2);
    }
    const next = setTimeout(() => {
      timers.delete(next);
      cycle();
    }, spec.loop);
    timers.add(next);
  };
  cycle();
  return el;
}

export const DEMO_IDS = Object.keys(DEMOS);
