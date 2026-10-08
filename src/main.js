// SYNAPSE — entry point.
import { settings, applySettings } from './game/settings.js';
import { setLang } from './game/i18n.js';
import { storage } from './game/storage.js';
import { suspendAudio, warmAudio } from './game/audio.js';
import { initPlatform, isLowPower, systemFontScale } from './game/platform.js';
import { profile } from './game/playerProfile.js';
import { TYPES_BY_ID } from './engine/challengeGenerator.js';
import { app, mountRoot, registerScreen, go, handleBack, initTouchFeedback } from './components/ui.js';
import { homeScreen } from './components/screens/home.js';
import { playScreen } from './components/screens/play.js';
import { resultsScreen } from './components/screens/results.js';
import { profileScreen } from './components/screens/profile.js';
import { settingsScreen } from './components/screens/settings.js';
import { onboardingScreen } from './components/screens/onboarding.js';

/**
 * Android keeps the system font size out of the game's layouts (MainActivity), so once, the in-app
 * text size is raised to the option closest to it: large-font players start with large text.
 */
function matchSystemTextSize() {
  if (settings.get().systemTextChecked) return;
  systemFontScale().then((scale) => {
    if (!scale) return;
    const closest = scale >= 1.25 ? 1.3 : scale >= 1.1 ? 1.15 : 1;
    // only ever raises it: a size the player picked (S included) is kept with a default system font
    const textScale = closest > 1 ? Math.max(settings.get().textScale, closest) : settings.get().textScale;
    settings.set({ textScale, systemTextChecked: true });
    applySettings(settings.get());
  });
}

function boot() {
  const s = settings.get();
  setLang(s.lang);
  applySettings(s);
  matchSystemTextSize();
  const low = isLowPower() && !new URLSearchParams(location.search).has('hq');
  document.body.classList.toggle('low-power', low);

  mountRoot(document.getElementById('app'));
  registerScreen('home', homeScreen);
  registerScreen('play', playScreen);
  registerScreen('results', resultsScreen);
  registerScreen('profile', profileScreen);
  registerScreen('settings', settingsScreen);
  registerScreen('onboarding', onboardingScreen);

  initTouchFeedback();
  initPlatform({
    onBack: handleBack,
    onPause: () => {
      profile.flush();
      suspendAudio();
      app.onAppPause?.();
    },
  });

  // Touch users don't need keyboard hints.
  // (only touch the class when it actually changes: a body class change restyles the whole page)
  window.addEventListener(
    'pointerdown',
    (e) => {
      const touch = e.pointerType === 'touch';
      if (touch !== document.body.classList.contains('is-touch')) document.body.classList.toggle('is-touch', touch);
    },
    { passive: true },
  );
  if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) document.body.classList.add('is-touch');

  document.body.classList.add('is-ready');
  warmAudio();
  // Dev hook for automated screenshots / QA (only with ?debug in the URL).
  if (new URLSearchParams(location.search).has('debug')) {
    import('./components/fx.js').then((fx) => (window.__synapse = { go, fx, app, profile }));
  }
  // Deep link for practice / testing: ?practice=parallax&d=0.6
  profile.recoverPending();
  const q = new URLSearchParams(location.search);
  const practice = q.get('practice');
  const d = q.get('d') ? Number(q.get('d').replace(',', '.')) : NaN;
  if (practice && TYPES_BY_ID[practice]) go('play', { mode: 'practice', typeId: practice, difficulty: Number.isFinite(d) ? d : undefined });
  else if (!storage.load('onboarded', false) && !q.has('skipintro')) go('onboarding');
  else go('home');
}

boot();
