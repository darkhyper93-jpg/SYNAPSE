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
    prev.cleanup?.();
    prev.el.classList.add('is-leaving');
    const old = prev.el;
    setTimeout(() => old.remove(), reduced() ? 0 : 280);
    warp(props.warpColor);
  }
  const view = screens[name](props);
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
  if (current && current.name !== 'home') {
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

// Neuron mark nodes: [x, y, r] in the 64×64 mark. They are filled with the same diagonal pink→violet→cyan
// gradient the SVG used (objectBoundingBox of the node group), sampled across each node.
const MARK_NODES = [[10, 46, 5], [24, 30, 5.5], [40, 38, 5], [54, 16, 5.5], [30, 12, 3.5], [46, 54, 3.5]];
const NODE_BOX = { x: 5, y: 8.5, w: 54.5, h: 49 };
const GRAD_STOPS = [[255, 79, 216], [176, 123, 255], [46, 230, 255]];
const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
function gradColor(t) {
  const k = Math.min(1, Math.max(0, t));
  const c = k < 0.5 ? mix(GRAD_STOPS[0], GRAD_STOPS[1], k / 0.5) : mix(GRAD_STOPS[1], GRAD_STOPS[2], (k - 0.5) / 0.5);
  return `rgb(${c.join(',')})`;
}
function nodeFill(x, y, r) {
  const gx = 1 / (2 * NODE_BOX.w);
  const gy = 1 / (2 * NODE_BOX.h);
  const t = ((x - NODE_BOX.x) / NODE_BOX.w + (y - NODE_BOX.y) / NODE_BOX.h) / 2;
  const ang = Math.atan2(gy, gx);
  const half = (Math.hypot(gx, gy) * 2 * r * (Math.abs(Math.sin(ang)) + Math.abs(Math.cos(ang)))) / 2;
  return `linear-gradient(${Math.round(90 + (ang * 180) / Math.PI)}deg, ${gradColor(t - half)}, ${gradColor(t + half)})`;
}

/**
 * Logo markup (animated gradient letters + neuron mark). Letters react to taps.
 * The mark is built for the compositor: the lines are "drawn" by a sliding reveal window
 * (two counter-moving transforms) and the nodes pulse with transform — no SVG animation,
 * so nothing is restyled, laid out or repainted while it animates.
 */
export function logo(size = 'lg') {
  const letters = 'SYNAPSE'.split('').map((c, i) => `<span style="--i:${i}">${c}<i class="lw-fill" aria-hidden="true"></i></span>`).join('');
  const dots = MARK_NODES.map(([x, y, r], i) => `<i class="lm-dot" style="--x:${x};--y:${y};--r:${r};--d:${[0, 0.3, 0.6, 0.9, 0, 0][i]}s;background:${nodeFill(x, y, r)}"></i>`).join('');
  const el = h('div', {
    class: `logo logo-${size}`,
    html: `<span class="logo-mark" aria-hidden="true"><span class="lm-reveal"><span class="lm-reveal-inner"><svg viewBox="0 0 64 64">
      <defs><linearGradient id="lm${size}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff4fd8"/><stop offset=".5" stop-color="#b07bff"/><stop offset="1" stop-color="#2ee6ff"/></linearGradient></defs>
      <g fill="none" stroke="url(#lm${size})" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 46 L24 30 L40 38 L54 16"/><path d="M24 30 L30 12 M40 38 L46 54"/>
      </g>
    </svg></span></span>${dots}</span><span class="logo-word">${letters}</span>`,
  });
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
      const masks = await Promise.all(
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
      if (g !== gen || !word.isConnected) throw new Error('stale');
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
