// Screen router, transitions, back-button handling, toasts, modal dialogs and touch ripples (the logo lives in logo.js).
import { h } from '../utils/dom.js';
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
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
const touchOnly = () => document.body.classList.contains('is-touch');

/**
 * Keeps keyboard focus inside an open dialog: focuses `initial` (keyboard/mouse users only, so
 * touch screens never get a focus ring), wraps Tab / Shift+Tab inside `box`, and on release puts
 * focus back where it was before the dialog opened.
 * @returns {() => void} release
 */
export function holdFocus(box, initial) {
  const prev = document.activeElement;
  const onKey = (e) => {
    if (e.key !== 'Tab' || !box.isConnected) return;
    const items = [...box.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null);
    if (!items.length) return;
    const inside = box.contains(document.activeElement);
    const edge = e.shiftKey ? items[0] : items[items.length - 1];
    if (!inside || document.activeElement === edge) {
      e.preventDefault();
      (e.shiftKey ? items[items.length - 1] : items[0]).focus();
    }
  };
  document.addEventListener('keydown', onKey, true);
  if (!touchOnly()) setTimeout(() => box.isConnected && (initial || box.querySelector(FOCUSABLE))?.focus({ preventScroll: true }), 30);
  return () => {
    document.removeEventListener('keydown', onKey, true);
    if (!touchOnly() && prev?.isConnected && box.contains(document.activeElement)) prev.focus?.({ preventScroll: true });
  };
}

let dialogIds = 0;
export function confirmDialog({ title, body = '', confirm = t('ui.confirm'), cancel = t('ui.cancel'), danger = false }) {
  return new Promise((resolve) => {
    let unregister = () => {};
    let release = () => {};
    const close = (v) => {
      unregister();
      release();
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
    const cancelBtn = h('button.btn.btn-ghost', { type: 'button', onclick: () => close(false) }, cancel);
    const id = `dlg-${++dialogIds}`;
    const overlay = h(
      'div.modal-overlay',
      { role: danger ? 'alertdialog' : 'dialog', 'aria-modal': 'true', 'aria-labelledby': `${id}-t`, 'aria-describedby': body ? `${id}-b` : null, onclick: (e) => e.target === overlay && close(false) },
      h('div.modal', h('h3', { id: `${id}-t` }, title), body ? h('p', { id: `${id}-b`, html: body }) : null, h('div.modal-actions', cancelBtn, okBtn)),
    );
    unregister = pushLayer(() => close(false));
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    // a destructive action never sits under the Enter key by default
    release = holdFocus(overlay, danger ? cancelBtn : okBtn);
  });
}
