// Screen router, transitions, back-button handling, toasts, modal dialogs and touch ripples.
import { h, replay } from '../utils/dom.js';
import { t } from '../game/i18n.js';
import { haptic } from '../game/haptics.js';

const screens = {};
let root = null;
let current = null; // { name, el, cleanup, onBack }
let navToken = 0;
const lastPointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
const modalStack = []; // close functions of open dialogs / overlays

export const app = {};

export function mountRoot(el) {
  root = el;
}

export function registerScreen(name, factory) {
  screens[name] = factory;
}

export function currentScreen() {
  return current?.name;
}

const reduced = () => document.body.classList.contains('reduce-motion');

/** Navigate to a screen. factory(props) -> { el, cleanup?, onShow?, onBack? } */
export function go(name, props = {}) {
  const token = ++navToken;
  const prev = current;
  if (prev) {
    const y = window.scrollY;
    prev.cleanup?.();
    prev.el.classList.add('is-leaving');
    const old = prev.el;
    // the leaving page fades where the player was looking, not snapped back to its top
    if (y) old.style.top = `${-y}px`;
    setTimeout(() => old.remove(), reduced() ? 0 : 280);
    warp(props.warpColor);
    current = null;
  }
  let view;
  try {
    view = screens[name](props);
  } catch (err) {
    // a screen that cannot be built (e.g. unexpected saved data) must never leave a blank app
    console.error(err);
    if (name === 'home') throw err;
    go('home');
    return;
  }
  if (token !== navToken) return;
  view.el.classList.add('screen', `screen-${name}`, 'is-entering');
  root.append(view.el);
  requestAnimationFrame(() => requestAnimationFrame(() => view.el.classList.remove('is-entering')));
  current = { name, ...view };
  window.scrollTo(0, 0); // (both coordinates: the object form forces a synchronous layout)
  view.onShow?.();
  const focusTarget = view.el.querySelector('[data-autofocus]');
  if (focusTarget && !document.body.classList.contains('is-touch')) setTimeout(() => focusTarget.focus({ preventScroll: true }), 30);
}

/**
 * Hardware / browser back. Returns true when handled inside the app,
 * false when we are at the root (home) and the app may exit.
 */
export function handleBack() {
  if (modalStack.length) {
    modalStack[modalStack.length - 1]();
    return true;
  }
  if (current?.onBack?.()) return true;
  // home and a first-launch tutorial are roots: Back leaves the app
  if (current && current.name !== 'home' && current.name !== 'onboarding') {
    go('home');
    return true;
  }
  return false;
}

/** Register a closable layer (dialog/overlay) so Back closes it first. Returns an unregister fn. */
export function pushLayer(close) {
  modalStack.push(close);
  return () => {
    const i = modalStack.indexOf(close);
    if (i >= 0) modalStack.splice(i, 1);
  };
}

// ---------- transitions ----------
/** Circular neural "warp" from the last touch point. */
export function warp(color) {
  if (reduced()) return;
  const layer = document.getElementById('fx-top');
  if (!layer) return;
  const el = h('div.warp', { '--x': `${lastPointer.x}px`, '--y': `${lastPointer.y}px`, '--c': color || 'rgba(176,123,255,.45)' }, h('i'), h('i.r2'));
  layer.append(el);
  setTimeout(() => el.remove(), 750);
}

// ---------- touch ripple + haptics ----------
export function initTouchFeedback() {
  document.addEventListener(
    'pointerdown',
    (e) => {
      lastPointer.x = e.clientX;
      lastPointer.y = e.clientY;
      const btn = e.target.closest?.('button, .ripple');
      if (!btn || btn.disabled || btn.classList.contains('no-ripple')) return;
      haptic('tap');
      if (reduced()) return;
      let wrap = btn.querySelector(':scope > .ripple-wrap');
      if (!wrap) {
        wrap = h('span.ripple-wrap');
        btn.append(wrap);
      }
      const r = btn.getBoundingClientRect();
      const size = Math.max(r.width, r.height) * 2.2;
      const dot = h('i', { style: { width: `${size}px`, height: `${size}px`, left: `${e.clientX - r.left - size / 2}px`, top: `${e.clientY - r.top - size / 2}px` } });
      wrap.append(dot);
      setTimeout(() => dot.remove(), 650);
    },
    { passive: true, capture: true },
  );
}

// ---------- toasts ----------
let toastWrap = null;
export function toast(html, { color = '#2ee6ff', icon = '◆', duration = 2600 } = {}) {
  if (!toastWrap) {
    toastWrap = h('div.toasts', { 'aria-live': 'polite' });
    document.body.append(toastWrap);
  }
  const el = h('div.toast', { '--c': color }, h('span.toast-icon', icon), h('span.toast-body', { html }));
  toastWrap.append(el);
  setTimeout(() => {
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 400);
  }, duration);
}

// ---------- modal ----------
export function confirmDialog({ title, body = '', confirm = t('ui.confirm'), cancel = t('ui.cancel'), danger = false }) {
  return new Promise((resolve) => {
    let unregister = () => {};
    const close = (v) => {
      unregister();
      overlay.classList.add('is-out');
      document.removeEventListener('keydown', onKey, true);
      setTimeout(() => overlay.remove(), 200);
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(false);
      }
    };
    const okBtn = h(`button.btn${danger ? '.btn-danger' : '.btn-primary'}`, { type: 'button', onclick: () => close(true) }, confirm);
    const overlay = h(
      'div.modal-overlay',
      { role: 'dialog', 'aria-modal': 'true', onclick: (e) => e.target === overlay && close(false) },
      h('div.modal', h('h3', title), body ? h('p', { html: body }) : null, h('div.modal-actions', h('button.btn.btn-ghost', { type: 'button', onclick: () => close(false) }, cancel), okBtn)),
    );
    unregister = pushLayer(() => close(false));
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    if (!document.body.classList.contains('is-touch')) setTimeout(() => okBtn.focus(), 30);
  });
}

// Neuron mark nodes: [x, y, r] in the 64×64 mark; the delays match the old SVG node pulse.
const MARK_NODES = [[10, 46, 5], [24, 30, 5.5], [40, 38, 5], [54, 16, 5.5], [30, 12, 3.5], [46, 54, 3.5]];
const NODE_DELAYS = [0, 0.3, 0.6, 0.9, 0, 0];

// Neuron mark lines. They used to "draw themselves" with an SVG stroke-dashoffset animation (dash 80,
// 80→0 over the first 45% of 3.2s with --ease-out; the branches 0.6s later), which repaints every
// frame. Now every straight segment sits in its own clip box and is revealed by two counter-moving
// transforms that follow exactly how far that dash had drawn — same look, compositor only.
// box = the path's bounding box: the stroke gradient was objectBoundingBox, i.e. per path.
const MARK_PATHS = [
  { delay: 0, box: [10, 16, 44, 30], pts: [[10, 46], [24, 30], [40, 38], [54, 16]] },
  { delay: 600, box: [24, 12, 22, 42], segs: [[[24, 30], [30, 12]], [[40, 38], [46, 54]]] }, // two subpaths
];
const DASH = 80;
const PAD = 2; // stroke half-width + round cap, in mark units

// cubic-bezier(0.16, 1, 0.3, 1) (--ease-out), solved for y at a given x
function easeOut(x) {
  const bz = (t, a, b) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (bz(mid, 0.16, 0.3) < x) lo = mid;
    else hi = mid;
  }
  return bz((lo + hi) / 2, 1, 1);
}

// Per segment: geometry, clip box and the keyframes of its reveal (computed once).
const MARK_SEGS = MARK_PATHS.flatMap((path) => {
  const segs = path.segs || path.pts.slice(1).map((p, i) => [path.pts[i], p]);
  let start = 0;
  return segs.map(([[x0, y0], [x1, y1]]) => {
    if (path.segs) start = 0; // separate subpaths: SVG restarts the dash pattern on each one
    const len = Math.hypot(x1 - x0, y1 - y0);
    const bx = Math.min(x0, x1) - PAD;
    const by = Math.min(y0, y1) - PAD;
    const bw = Math.abs(x1 - x0) + 2 * PAD;
    const bh = Math.abs(y1 - y0) + 2 * PAD;
    const from = start;
    start += len;
    // visible fraction of the box (left → right: every segment runs rightwards)
    const edge = (t) => {
      const drawn = t >= 1440 ? DASH : DASH * easeOut(t / 1440);
      const f = Math.min(1, Math.max(0, (drawn - from) / len));
      return f <= 0 ? 0 : f >= 1 ? 1 : (PAD + f * (bw - 2 * PAD)) / bw;
    };
    const times = [];
    for (let i = 0; i <= 48; i++) times.push(1440 * (i / 48) ** 2); // dense where the ease is steep
    times.push(3200);
    const outer = times.map((t) => ({ offset: t / 3200, transform: `translateX(${((edge(t) - 1) * 100).toFixed(2)}%)` }));
    const inner = times.map((t) => ({ offset: t / 3200, transform: `translateX(${((1 - edge(t)) * 100).toFixed(2)}%)` }));
    return { x0, y0, x1, y1, bx, by, bw, bh, box: path.box, delay: path.delay, outer, inner };
  });
});

/**
 * Logo markup (animated gradient letters + neuron mark). Letters react to taps.
 * The mark is built for the compositor: line segments are revealed by sliding windows and the nodes
 * pulse with transform — no SVG animation, so nothing is restyled, laid out or repainted while it animates.
 */
export function logo(size = 'lg') {
  const letters = 'SYNAPSE'.split('').map((c, i) => `<span style="--i:${i}">${c}<i class="lw-fill" aria-hidden="true"></i></span>`).join('');
  const dots = MARK_NODES.map(([x, y, r], i) => `<i class="lm-dot" style="--x:${x};--y:${y};--r:${r};--d:${NODE_DELAYS[i]}s"></i>`).join('');
  const pct = (v, of) => `${((v / of) * 100).toFixed(3)}%`;
  const lines = MARK_SEGS.map((g, i) => {
    const [gx, gy, gw, gh] = g.box;
    return `<span class="lm-seg" style="left:${pct(g.bx, 64)};top:${pct(g.by, 64)};width:${pct(g.bw, 64)};height:${pct(g.bh, 64)}"><span class="lm-wipe"><span class="lm-wipe-in"><svg viewBox="0 0 64 64" style="left:${pct(-g.bx, g.bw)};top:${pct(-g.by, g.bh)};width:${pct(64, g.bw)};height:${pct(64, g.bh)}">
      <defs><linearGradient id="lm${size}${i}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1" y2="1" gradientTransform="matrix(${gw} 0 0 ${gh} ${gx} ${gy})"><stop offset="0" stop-color="#ff4fd8"/><stop offset=".5" stop-color="#b07bff"/><stop offset="1" stop-color="#2ee6ff"/></linearGradient></defs>
      <path d="M${g.x0} ${g.y0} L${g.x1} ${g.y1}" fill="none" stroke="url(#lm${size}${i})" stroke-width="3" stroke-linecap="round"/>
    </svg></span></span></span>`;
  }).join('');
  const el = h('div', {
    class: `logo logo-${size}`,
    html: `<span class="logo-mark" aria-hidden="true">${lines}${dots}</span><span class="logo-word">${letters}</span>`,
  });
  if (!reduced()) {
    el.querySelectorAll('.lm-seg').forEach((seg, i) => {
      const g = MARK_SEGS[i];
      const timing = { duration: 3200, iterations: Infinity, delay: g.delay };
      seg.firstChild.animate(g.outer, timing);
      seg.firstChild.firstChild.animate(g.inner, timing);
    });
  }
  flowLetters(el.querySelector('.logo-word'));
  // Easter egg: tap letters to make them jump and spark.
  el.addEventListener('pointerdown', (e) => {
    const target = e.target.closest('.logo-word span, .logo-mark');
    if (!target) return;
    replay(target, 'is-jump');
    haptic('light');
  });
  return el;
}

/**
 * Moves the letters' colour flow to the compositor. Each glyph is drawn once into a canvas that becomes
 * the mask of its .lw-fill, under which a gradient strip slides with a transform. Until the masks are
 * ready (or if anything is unsupported) the letters keep the original background-clip:text animation.
 * Masks are rebuilt whenever the word changes size (rotation, font swap) and freed when it leaves the DOM.
 */
const FLOW_OK = typeof window.ResizeObserver === 'function' && !!window.CSS?.supports && (window.CSS.supports('mask-image', 'url(a.png)') || window.CSS.supports('-webkit-mask-image', 'url(a.png)'));
function flowLetters(word) {
  if (!FLOW_OK || !word) return;
  let urls = [];
  let size = '';
  let gen = 0;
  const free = () => {
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls = [];
  };
  const ro = new window.ResizeObserver(() => {
    if (!word.isConnected) {
      if (size) {
        ro.disconnect();
        free();
      }
      return;
    }
    const key = `${word.offsetWidth}x${word.offsetHeight}`;
    if (!word.offsetWidth || key === size) return;
    size = key;
    build(++gen);
  });
  ro.observe(word);

  async function build(g) {
    const spans = [...word.children];
    const cs = getComputedStyle(spans[0]);
    const font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    try {
      await document.fonts?.load(font, 'SYNAPSE');
    } catch {
      /* draw with whatever is available */
    }
    if (g !== gen || !word.isConnected) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    // Measure everything in two layout passes (sizes + baselines), then draw off the layout path.
    // The baseline: a 0×0 inline-block sits on it (offsets ignore the float/jump transforms).
    const sizes = spans.map((s) => [s.offsetWidth, s.offsetHeight]);
    const probes = spans.map((s) => {
      const b = document.createElement('b');
      b.style.cssText = 'display:inline-block;width:0;height:0';
      s.append(b);
      return b;
    });
    const bases = probes.map((b) => b.offsetTop);
    probes.forEach((b) => b.remove());
    const next = [];
    try {
      // allSettled: every blob URL is created (and tracked in `next`) before we decide, so none leaks
      const settled = await Promise.allSettled(
        spans.map(async (s, i) => {
          const [w, hgt] = sizes[i];
          if (!w || !hgt) throw new Error('size');
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(w * dpr));
          c.height = Math.max(1, Math.round(hgt * dpr));
          const ctx = c.getContext('2d');
          ctx.scale(c.width / w, c.height / hgt);
          ctx.font = font;
          ctx.fillStyle = '#fff';
          ctx.textBaseline = 'alphabetic';
          ctx.fillText(s.firstChild.textContent, 0, bases[i]);
          const blob = await new Promise((res) => c.toBlob(res));
          if (!blob) throw new Error('mask');
          const url = URL.createObjectURL(blob);
          next.push(url);
          const img = new window.Image();
          img.src = url;
          await img.decode();
          return url;
        }),
      );
      if (g !== gen || !word.isConnected || settled.some((r) => r.status !== 'fulfilled')) throw new Error('stale');
      const masks = settled.map((r) => r.value);
      masks.forEach((url, i) => {
        const fill = spans[i].querySelector('.lw-fill');
        fill.style.webkitMaskImage = `url(${url})`;
        fill.style.maskImage = `url(${url})`;
      });
      word.classList.add('is-flow');
      free();
      urls = next;
    } catch {
      next.forEach((u) => URL.revokeObjectURL(u));
    }
  }
}
