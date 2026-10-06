// SYNAPSE — entry point.
import { settings, applySettings } from './game/settings.js';
import { setLang } from './game/i18n.js';
import { storage } from './game/storage.js';
import { suspendAudio } from './game/audio.js';
import { initPlatform, isLowPower } from './game/platform.js';
import { NeuralBackground } from './components/background.js';
import { app, mountRoot, registerScreen, go, handleBack, initTouchFeedback, currentScreen } from './components/ui.js';
import { homeScreen } from './components/screens/home.js';
import { playScreen } from './components/screens/play.js';
import { resultsScreen } from './components/screens/results.js';
import { profileScreen } from './components/screens/profile.js';
import { settingsScreen } from './components/screens/settings.js';
import { onboardingScreen } from './components/screens/onboarding.js';

function boot() {
  const s = settings.get();
  setLang(s.lang);
  applySettings(s);
  const low = isLowPower() && !new URLSearchParams(location.search).has('hq');
  document.body.classList.toggle('low-power', low);

  app.background = new NeuralBackground(document.getElementById('bg'), { lowPower: low });
  app.background.setMode(s.background);

  mountRoot(document.getElementById('app'));
  registerScreen('home', homeScreen);
  registerScreen('play', playScreen);
  registerScreen('results', resultsScreen);
  registerScreen('profile', profileScreen);
  registerScreen('settings', settingsScreen);
  registerScreen('onboarding', onboardingScreen);

  initTouchFeedback();
  initInteractiveBackground();
  initTilt();
  initPlatform({
    onBack: handleBack,
    onPause: () => {
      suspendAudio();
      app.onAppPause?.();
    },
  });

  // Touch users don't need keyboard hints.
  window.addEventListener('pointerdown', (e) => document.body.classList.toggle('is-touch', e.pointerType === 'touch'), { passive: true });
  if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) document.body.classList.add('is-touch');

  document.body.classList.add('is-ready');
  // Dev hook for automated screenshots / QA (only with ?debug in the URL).
  if (new URLSearchParams(location.search).has('debug')) {
    import('./components/fx.js').then((fx) => import('./game/playerProfile.js').then(({ profile }) => (window.__synapse = { go, fx, app, profile })));
  }
  // Deep link for practice / testing: ?practice=parallax&d=0.6
  const q = new URLSearchParams(location.search);
  if (q.get('practice')) go('play', { mode: 'practice', typeId: q.get('practice'), difficulty: q.has('d') ? Number(q.get('d')) : undefined });
  else if (!storage.load('onboarded', false) && !q.has('skipintro')) go('onboarding');
  else go('home');
}

/** Tapping or dragging on empty space makes the neural network react (outside challenges). */
function initInteractiveBackground() {
  const interactive = (target) => !target.closest('button, a, input, select, label, canvas.trace-canvas, .stage, .play-overlay, .modal-overlay');
  let dragging = false;
  let lastTrail = 0;
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (currentScreen() === 'play' && document.querySelector('.play.is-running')) return;
      if (!interactive(e.target)) return;
      dragging = true;
      app.background?.touch(e.clientX, e.clientY);
    },
    { passive: true },
  );
  document.addEventListener(
    'pointermove',
    (e) => {
      if (!dragging) return;
      const now = performance.now();
      if (now - lastTrail > 30) {
        lastTrail = now;
        app.background?.trail(e.clientX, e.clientY);
      }
    },
    { passive: true },
  );
  const stop = () => (dragging = false);
  document.addEventListener('pointerup', stop, { passive: true });
  document.addEventListener('pointercancel', stop, { passive: true });
}

/** Subtle parallax: device tilt on phones/tablets, pointer position on desktop. */
function initTilt() {
  const layer = document.querySelector('.parallax-layer');
  const apply = (nx, ny) => {
    if (document.body.classList.contains('reduce-motion')) return;
    const x = Math.max(-1, Math.min(1, nx));
    const y = Math.max(-1, Math.min(1, ny));
    layer?.style.setProperty('--tx', `${x * 26}px`);
    layer?.style.setProperty('--ty', `${y * 26}px`);
    document.documentElement.style.setProperty('--tilt-x', x.toFixed(3));
    document.documentElement.style.setProperty('--tilt-y', y.toFixed(3));
    app.background?.setParallax(x * -14, y * -14);
  };
  let base = null;
  window.addEventListener('deviceorientation', (e) => {
    if (e.gamma == null || e.beta == null) return;
    if (!base) base = { g: e.gamma, b: e.beta };
    apply((e.gamma - base.g) / 25, (e.beta - base.b) / 25);
  });
  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      apply((e.clientX / window.innerWidth - 0.5) * 2, (e.clientY / window.innerHeight - 0.5) * 2);
    },
    { passive: true },
  );
}

boot();
