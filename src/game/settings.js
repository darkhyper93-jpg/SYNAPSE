import { storage } from './storage.js';

const prefersReduced = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const detectLang = () => {
  const l = (typeof navigator !== 'undefined' && navigator.language) || 'en';
  return l.toLowerCase().startsWith('es') ? 'es' : 'en';
};

export const DEFAULT_SETTINGS = () => ({
  lang: detectLang(),
  sound: true,
  volume: 0.6,
  reducedMotion: prefersReduced(),
  background: 'full', // full | calm | off
  textScale: 1,
  colorAssist: false, // letter tags on colours
  highContrast: false,
  showKeyHints: true,
  adaptMix: 'balanced', // balanced | weakness | strength
});

const listeners = new Set();
let current = { ...DEFAULT_SETTINGS(), ...storage.load('settings', {}) };

export const settings = {
  get: () => current,
  set(patch) {
    current = { ...current, ...patch };
    storage.save('settings', current);
    listeners.forEach((fn) => fn(current));
  },
  reset() {
    current = DEFAULT_SETTINGS();
    storage.save('settings', current);
    listeners.forEach((fn) => fn(current));
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

/** Reflect settings onto the document (classes + CSS vars). */
export function applySettings(s = current) {
  const b = document.body;
  b.classList.toggle('reduce-motion', !!s.reducedMotion);
  b.classList.toggle('high-contrast', !!s.highContrast);
  b.classList.toggle('no-key-hints', !s.showKeyHints);
  document.documentElement.style.setProperty('--text-scale', s.textScale);
  document.documentElement.lang = s.lang;
}
