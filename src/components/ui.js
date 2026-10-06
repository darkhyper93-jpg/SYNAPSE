// Screen router, toasts and modal dialogs.
import { h } from '../utils/dom.js';
import { t } from '../game/i18n.js';

const screens = {};
let root = null;
let current = null; // { name, el, cleanup }
let navToken = 0;

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

/** Navigate to a screen. factory(props) -> { el, cleanup?, onShow? } */
export function go(name, props = {}) {
  const token = ++navToken;
  const prev = current;
  if (prev) {
    prev.cleanup?.();
    prev.el.classList.add('is-leaving');
    const old = prev.el;
    setTimeout(() => old.remove(), document.body.classList.contains('reduce-motion') ? 0 : 260);
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
  if (focusTarget) setTimeout(() => focusTarget.focus({ preventScroll: true }), 30);
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
    const close = (v) => {
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
      { role: 'dialog', 'aria-modal': 'true' },
      h('div.modal', h('h3', title), body ? h('p', { html: body }) : null, h('div.modal-actions', h('button.btn.btn-ghost', { type: 'button', onclick: () => close(false) }, cancel), okBtn)),
    );
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    setTimeout(() => okBtn.focus(), 30);
  });
}

/** Logo markup (animated gradient letters + neuron mark). */
export function logo(size = 'lg') {
  const letters = 'SYNAPSE'.split('').map((c, i) => `<span style="--i:${i}">${c}</span>`).join('');
  return h('div', {
    class: `logo logo-${size}`,
    html: `<svg class="logo-mark" viewBox="0 0 64 64" aria-hidden="true">
      <defs><linearGradient id="lm${size}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff4fd8"/><stop offset=".5" stop-color="#b07bff"/><stop offset="1" stop-color="#2ee6ff"/></linearGradient></defs>
      <g fill="none" stroke="url(#lm${size})" stroke-width="3" stroke-linecap="round">
        <path class="lm-path" d="M10 46 L24 30 L40 38 L54 16"/><path class="lm-path b" d="M24 30 L30 12 M40 38 L46 54"/>
      </g>
      <g fill="url(#lm${size})"><circle class="lm-node" cx="10" cy="46" r="5"/><circle class="lm-node" cx="24" cy="30" r="5.5"/><circle class="lm-node" cx="40" cy="38" r="5"/><circle class="lm-node" cx="54" cy="16" r="5.5"/><circle class="lm-node" cx="30" cy="12" r="3.5"/><circle class="lm-node" cx="46" cy="54" r="3.5"/></g>
    </svg><span class="logo-word">${letters}</span>`,
  });
}
