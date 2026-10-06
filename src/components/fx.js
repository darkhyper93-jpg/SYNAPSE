// Reusable "game juice": flying points, combo texts, countdowns and full-screen celebrations.
import { h } from '../utils/dom.js';
import { pushLayer } from './ui.js';
import { haptic } from '../game/haptics.js';
import { sfx } from '../game/audio.js';

const reduced = () => document.body.classList.contains('reduce-motion');
const topLayer = () => document.getElementById('fx-top') || document.body;

/** A "+125" chip that flies from a point to a target element (e.g. the HUD score). */
export function flyPoints(from, toEl, text, color = '#3dff9a') {
  if (!toEl) return Promise.resolve();
  const to = toEl.getBoundingClientRect();
  const chip = h('div.fly-pts', { '--c': color }, text);
  topLayer().append(chip);
  const x0 = from.x;
  const y0 = from.y;
  const x1 = to.left + to.width / 2;
  const y1 = to.top + to.height / 2;
  if (reduced() || !chip.animate) {
    chip.remove();
    return Promise.resolve();
  }
  const mid = { x: (x0 + x1) / 2 + (x1 > x0 ? -60 : 60), y: Math.min(y0, y1) - 70 };
  const anim = chip.animate(
    [
      { transform: `translate(${x0}px, ${y0}px) translate(-50%, -50%) scale(.6)`, opacity: 0 },
      { transform: `translate(${x0}px, ${y0 - 26}px) translate(-50%, -50%) scale(1.25)`, opacity: 1, offset: 0.18 },
      { transform: `translate(${mid.x}px, ${mid.y}px) translate(-50%, -50%) scale(1)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${x1}px, ${y1}px) translate(-50%, -50%) scale(.45)`, opacity: 0.2 },
    ],
    { duration: 720, easing: 'cubic-bezier(.5,0,.3,1)' },
  );
  // (the target bumps when its value updates: callers chain the update on this promise)
  return anim.finished.then(() => chip.remove());
}

/** Big centered combo word ("GREAT!") inside a container. */
export function comboText(container, text, color = '#ffb02e') {
  if (reduced()) return;
  const el = h('div.combo-text', { '--c': color, 'data-text': text }, text);
  container.append(el);
  setTimeout(() => el.remove(), 1100);
}

/**
 * 3·2·1·GO! countdown (or just GO). Resolves true when done, or false right away when `signal`
 * aborts (pause / quit), so no number, beep or vibration is left running behind the pause menu.
 */
export function countdown(container, { full = true, signal } = {}) {
  return new Promise((resolve) => {
    const steps = full ? ['3', '2', '1', 'GO!'] : ['GO!'];
    const el = h('div.countdown');
    let timer = 0;
    const stop = (done) => {
      clearTimeout(timer);
      el.remove();
      resolve(done === true);
    };
    if (signal?.aborted) return resolve(false);
    signal?.addEventListener('abort', stop, { once: true });
    container.append(el);
    let i = 0;
    const next = () => {
      if (i >= steps.length) {
        signal?.removeEventListener('abort', stop);
        stop(true);
        return;
      }
      const s = steps[i++];
      // real seconds: 3 · 2 · 1 last one second each, GO! a little less (CSS reads the same --step)
      const ms = s === 'GO!' ? 650 : 1000;
      el.style.setProperty('--step', `${ms}ms`);
      el.replaceChildren(h(`span${s === 'GO!' ? '.is-go' : ''}`, s));
      sfx(s === 'GO!' ? 'go' : 'count');
      haptic(s === 'GO!' ? 'medium' : 'tick');
      timer = setTimeout(next, ms);
    };
    next();
  });
}

/**
 * Full-screen celebration (level up, unlock, record). Tap / Back / timeout closes it.
 * opts: { kicker, title, subtitle, color, icon, extra (Node), duration }
 */
export function celebrate({ kicker = '', title, subtitle = '', color = '#b07bff', icon = '▲', extra = null, duration = 2600, sound = 'levelup' }) {
  return new Promise((resolve) => {
    let done = false;
    let unregister = () => {};
    const close = () => {
      if (done) return;
      done = true;
      unregister();
      el.classList.add('is-out');
      setTimeout(() => {
        el.remove();
        resolve();
      }, 320);
    };
    const el = h(
      'div.celebrate',
      { '--c': color, onclick: close, role: 'dialog' },
      raysCanvas(color),
      h(
        'div.cel-body',
        h('div.cel-icon', icon),
        kicker ? h('div.cel-kicker', kicker) : null,
        h('div.cel-title', { 'data-text': title }, title),
        subtitle ? h('div.cel-sub', { html: subtitle }) : null,
        extra,
      ),
    );
    unregister = pushLayer(close);
    topLayer().append(el);
    sfx(sound);
    haptic('levelup');
    setTimeout(close, duration);
  });
}

/**
 * Light rays for celebrations, drawn once into a canvas and spun by CSS: a 1024px texture on the
 * GPU instead of a giant masked conic-gradient layer repainted every frame. Same look as the
 * original `repeating-conic-gradient(c 28% 0–8deg, transparent 8–22deg)` with a radial mask that
 * reached 0 at 55% of the farthest corner (62.2vmax): the canvas box is 125vmax (radius 62.5vmax).
 */
function raysCanvas(color) {
  const c = document.createElement('canvas');
  c.className = 'cel-rays';
  const S = 1024;
  c.width = c.height = S;
  const g = c.getContext('2d');
  const r = S / 2;
  const wedge = (from, to) => {
    g.beginPath();
    g.moveTo(r, r);
    g.arc(r, r, r, ((from - 90) * Math.PI) / 180, ((to - 90) * Math.PI) / 180);
    g.closePath();
    g.fill();
  };
  g.fillStyle = color;
  g.globalAlpha = 0.28;
  for (let a = 22; a < 352; a += 22) wedge(a, a + 8);
  wedge(352, 368); // the repeat's last partial ray and the first one meet at the top: one wedge, no seam
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'destination-in';
  const fade = g.createRadialGradient(r, r, 0, r, r, r);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(62.2 / 62.5, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fade;
  g.fillRect(0, 0, S, S);
  return c;
}

/** Animated star rating (0-3) element; call .play() to reveal stars one by one. */
export function starRating(stars) {
  const el = h('div.stars', [0, 1, 2].map((i) => h(`span.star${i < stars ? '.is-on' : ''}`, { '--i': i }, '★')));
  el.play = () => {
    [...el.children].forEach((s, i) => {
      setTimeout(() => {
        s.classList.add('is-in');
        if (i < stars) {
          sfx('star');
          haptic('light');
        }
      }, 250 + i * 260);
    });
  };
  return el;
}

export const starsFor = (accuracy) => (accuracy >= 0.9 ? 3 : accuracy >= 0.7 ? 2 : accuracy >= 0.4 ? 1 : 0);
