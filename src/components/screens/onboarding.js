// First-launch onboarding: four swipeable animated slides.
import { h } from '../../utils/dom.js';
import { t } from '../../game/i18n.js';
import { go, logo } from '../ui.js';
import { storage } from '../../game/storage.js';
import { SKILLS, SKILL_IDS } from '../../data/skills.js';
import { radarChart } from '../charts.js';
import { haptic } from '../../game/haptics.js';
import { sfx } from '../../game/audio.js';

const SLIDES = ['welcome', 'skills', 'adapt', 'short'];

function visual(key) {
  if (key === 'welcome') {
    return h('div.onb-visual.onb-core', h('div.core-orbit', h('i'), h('i'), h('i')), logo('md'));
  }
  if (key === 'skills') {
    const radar = h('div.onb-radar');
    const chips = h('div.onb-chips', SKILL_IDS.map((id, i) => h('span.skill-chip', { '--c': SKILLS[id].color, style: { animationDelay: `${i * 70}ms` } }, t(`skill.${id}`))));
    // The radar morphs between random profiles: every player is different.
    // It only cycles while its slide is on screen (rebuilding it off-screen was periodic main-thread work).
    let timer = 0;
    const render = () => (radar.innerHTML = radarChart(SKILL_IDS.map((id) => ({ id, label: '', value: 35 + Math.random() * 60, color: SKILLS[id].color })), { size: 220, showLabels: false }));
    const cycle = () => {
      render();
      timer = setTimeout(cycle, 1600);
    };
    render();
    const el = h('div.onb-visual', radar, chips);
    el.setActive = (on) => {
      clearTimeout(timer);
      timer = 0;
      if (on) cycle();
    };
    return el;
  }
  if (key === 'adapt') {
    return h(
      'div.onb-visual.onb-adapt',
      h('div.adapt-track', h('div.adapt-zone', h('span', '70–90%')), h('div.adapt-rail', h('div.adapt-marker'))),
      h('div.adapt-labels', h('span', t('onb.easy')), h('span', t('onb.hard'))),
      h('div.adapt-bars', [0.3, 0.45, 0.6, 0.72, 0.8, 0.78, 0.83].map((v, i) => h('i', { style: { height: `${v * 100}%`, animationDelay: `${i * 90}ms` } }))),
    );
  }
  return h(
    'div.onb-visual.onb-short',
    h('div.clock', {
      // The progress arc sweeps with two rotating half-rings (compositor-only) instead of animating stroke-dashoffset.
      html: '<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="clock-bg"/></svg><div class="clock-sweep"><span class="cs-half cs-r"><span class="cs-arm"><i></i></span></span><span class="cs-half cs-l"><span class="cs-arm"><i></i></span></span><span class="cs-seam"></span><span class="cs-cap"></span><span class="cs-head"><i></i></span></div><b>5′</b>',
    }),
    h('p.onb-note', t('home.disclaimer')),
  );
}

export function onboardingScreen({ from } = {}) {
  let index = 0;
  const track = h('div.onb-track');
  const slides = SLIDES.map((key) => h('section.onb-slide', visual(key), h('h2', t(`onb.${key}.title`)), h('p', t(`onb.${key}.body`))));
  track.append(...slides);
  const dots = h('div.onb-dots', SLIDES.map((_, i) => h('i', { onclick: () => to(i) })));
  const nextBtn = h('button.btn.btn-primary.onb-next', { type: 'button', onclick: () => (index < SLIDES.length - 1 ? to(index + 1) : finish()) });
  const skipBtn = h('button.onb-skip', { type: 'button', onclick: () => finish() }, t('onb.skip'));
  const viewport = h('div.onb-viewport', track);

  const to = (i) => {
    index = Math.max(0, Math.min(SLIDES.length - 1, i));
    track.style.transform = `translateX(${-index * 100}%)`;
    slides.forEach((s, k) => {
      if (s.classList.contains('is-active') !== (k === index)) s.firstChild.setActive?.(k === index);
      s.classList.toggle('is-active', k === index);
    });
    [...dots.children].forEach((d, k) => d.classList.toggle('is-on', k === index));
    nextBtn.textContent = index === SLIDES.length - 1 ? t('onb.start') : t('onb.next');
    skipBtn.style.visibility = index === SLIDES.length - 1 ? 'hidden' : 'visible';
    haptic('tick');
    sfx('whoosh');
  };

  const finish = () => {
    storage.save('onboarded', true);
    sfx('go');
    go('home', { warpColor: 'rgba(46,230,255,.45)' });
  };

  // Swipe with the finger: the track follows, then snaps.
  let drag = null;
  viewport.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, dx: 0, w: viewport.clientWidth };
    track.classList.add('is-dragging');
    viewport.setPointerCapture?.(e.pointerId);
  });
  viewport.addEventListener('pointermove', (e) => {
    if (!drag) return;
    drag.dx = e.clientX - drag.x;
    const edge = (index === 0 && drag.dx > 0) || (index === SLIDES.length - 1 && drag.dx < 0) ? 0.3 : 1;
    track.style.transform = `translateX(calc(${-index * 100}% + ${drag.dx * edge}px))`;
  });
  const end = () => {
    if (!drag) return;
    track.classList.remove('is-dragging');
    const { dx, w } = drag;
    drag = null;
    if (Math.abs(dx) > Math.min(80, w * 0.18)) to(index + (dx < 0 ? 1 : -1));
    else to(index);
  };
  viewport.addEventListener('pointerup', end);
  viewport.addEventListener('pointercancel', end);

  const el = h('main.onboarding', skipBtn, viewport, h('div.onb-footer', dots, nextBtn));

  const onKey = (e) => {
    if (e.key === 'ArrowRight') to(index + 1);
    if (e.key === 'ArrowLeft') to(index - 1);
    if (e.key === 'Enter') nextBtn.click();
  };
  document.addEventListener('keydown', onKey);

  return {
    el,
    onShow: () => to(0),
    onBack: () => {
      if (index > 0) to(index - 1);
      else if (from) go(from); // replayed from Settings: back where it came from
      else return false; // first launch: Back exits the app (the tutorial shows again next time)
      return true;
    },
    cleanup: () => {
      document.removeEventListener('keydown', onKey);
      slides.forEach((s) => s.firstChild.setActive?.(false));
    },
  };
}
