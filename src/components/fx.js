// Reusable "game juice": flying points, combo texts, countdowns and full-screen celebrations.
import { h } from '../utils/dom.js';
import { app, pushLayer } from './ui.js';
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
  return anim.finished.then(() => {
    chip.remove();
    toEl.classList.remove('bump');
    void toEl.offsetWidth;
    toEl.classList.add('bump');
  });
}

/** Big centered combo word ("GREAT!") inside a container. */
export function comboText(container, text, color = '#ffb02e') {
  if (reduced()) return;
  const el = h('div.combo-text', { '--c': color, 'data-text': text }, text);
  container.append(el);
  setTimeout(() => el.remove(), 1100);
}

/** 3·2·1·GO! countdown (or just GO). Resolves when done. */
export function countdown(container, { full = true } = {}) {
  return new Promise((resolve) => {
    const steps = full ? ['3', '2', '1', 'GO!'] : ['GO!'];
    const el = h('div.countdown');
    container.append(el);
    let i = 0;
    const next = () => {
      if (i >= steps.length) {
        el.remove();
        resolve();
        return;
      }
      const s = steps[i++];
      el.innerHTML = '';
      el.append(h(`span${s === 'GO!' ? '.is-go' : ''}`, s));
      sfx(s === 'GO!' ? 'go' : 'count');
      haptic(s === 'GO!' ? 'medium' : 'tick');
      setTimeout(next, s === 'GO!' ? 420 : 520);
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
      h('div.cel-rays'),
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
    app.background?.confetti(90);
    app.background?.surge(color);
    setTimeout(close, duration);
  });
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
