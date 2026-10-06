// SYNAPSE — entry point.
import { settings, applySettings } from './game/settings.js';
import { setLang } from './game/i18n.js';
import { NeuralBackground } from './components/background.js';
import { app, mountRoot, registerScreen, go } from './components/ui.js';
import { homeScreen } from './components/screens/home.js';
import { playScreen } from './components/screens/play.js';
import { resultsScreen } from './components/screens/results.js';
import { profileScreen } from './components/screens/profile.js';
import { settingsScreen } from './components/screens/settings.js';

function boot() {
  const s = settings.get();
  setLang(s.lang);
  applySettings(s);

  app.background = new NeuralBackground(document.getElementById('bg'));
  app.background.setMode(s.background);

  mountRoot(document.getElementById('app'));
  registerScreen('home', homeScreen);
  registerScreen('play', playScreen);
  registerScreen('results', resultsScreen);
  registerScreen('profile', profileScreen);
  registerScreen('settings', settingsScreen);

  // Touch users don't need keyboard hints.
  window.addEventListener('pointerdown', (e) => document.body.classList.toggle('is-touch', e.pointerType === 'touch'), { passive: true });
  if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) document.body.classList.add('is-touch');

  document.body.classList.add('is-ready');
  // Deep link for practice / testing: ?practice=parallax&d=0.6
  const q = new URLSearchParams(location.search);
  if (q.get('practice')) go('play', { mode: 'practice', typeId: q.get('practice'), difficulty: q.has('d') ? Number(q.get('d')) : undefined });
  else go('home');
}

boot();
