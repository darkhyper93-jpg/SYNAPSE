// Screen router, transitions, back-button handling, toasts, modal dialogs and touch ripples.
import { h } from '../utils/dom.js';
import { t } from '../game/i18n.js';
import { haptic } from '../game/haptics.js';

const screens = {};
let root = null;
let current = null; // { name, el, cleanup, onBack }
let navToken = 0;
const lastPointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
const modalStack = []; // close functions of open dialogs / overlays

export const app = {
  background: null,
};

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
  window.scrollTo({ top: 0 });
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

/** Logo markup (animated gradient letters + neuron mark). Letters react to taps. */
export function logo(size = 'lg') {
  const letters = 'SYNAPSE'.split('').map((c, i) => `<span style="--i:${i}">${c}</span>`).join('');
  const el = h('div', {
    class: `logo logo-${size}`,
    html: `<svg class="logo-mark" viewBox="0 0 64 64" aria-hidden="true">
      <defs><linearGradient id="lm${size}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff4fd8"/><stop offset=".5" stop-color="#b07bff"/><stop offset="1" stop-color="#2ee6ff"/></linearGradient></defs>
      <g fill="none" stroke="url(#lm${size})" stroke-width="3" stroke-linecap="round">
        <path class="lm-path" d="M10 46 L24 30 L40 38 L54 16"/><path class="lm-path b" d="M24 30 L30 12 M40 38 L46 54"/>
      </g>
      <g fill="url(#lm${size})"><circle class="lm-node" cx="10" cy="46" r="5"/><circle class="lm-node" cx="24" cy="30" r="5.5"/><circle class="lm-node" cx="40" cy="38" r="5"/><circle class="lm-node" cx="54" cy="16" r="5.5"/><circle class="lm-node" cx="30" cy="12" r="3.5"/><circle class="lm-node" cx="46" cy="54" r="3.5"/></g>
    </svg><span class="logo-word">${letters}</span>`,
  });
  // Easter egg: tap letters to make them jump and spark.
  el.addEventListener('pointerdown', (e) => {
    const target = e.target.closest('.logo-word span, .logo-mark');
    if (!target) return;
    target.classList.remove('is-jump');
    void target.getBoundingClientRect();
    target.classList.add('is-jump');
    haptic('light');
    const r = target.getBoundingClientRect();
    const colors = ['#ff4fd8', '#b07bff', '#2ee6ff', '#34f5c5', '#ffc53d'];
    app.background?.burst(r.left + r.width / 2, r.top + r.height / 2, colors[Math.floor(Math.random() * colors.length)], 18);
  });
  return el;
}
