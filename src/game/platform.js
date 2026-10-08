// Platform glue: native app (Capacitor) vs. browser/PWA.
// - Android back button → handled by the current screen
// - App pause/resume → game pauses, audio suspends
// - Status bar / splash screen styling
// - Low-power detection to keep animations smooth on modest phones

const cap = () => (typeof window !== 'undefined' ? window.Capacitor : null);

export const isNative = () => !!cap()?.isNativePlatform?.();

// Native plugins are reached through the Capacitor runtime (www/capacitor.js, added by the build).
const plugins = {};
export function plugin(name) {
  const c = cap();
  if (!c?.isNativePlatform?.() || !c.isPluginAvailable?.(name)) return null;
  if (!plugins[name]) plugins[name] = c.Plugins?.[name] || c.registerPlugin?.(name) || null;
  return plugins[name];
}

/** The Android system font size (1 = default; see MainActivity), or null on the web. */
export function systemFontScale() {
  const display = plugin('Display');
  if (!display) return Promise.resolve(null);
  return display
    .getFontScale()
    .then((r) => Number(r?.fontScale) || null)
    .catch(() => null);
}

export function isLowPower() {
  const cores = navigator.hardwareConcurrency || 8;
  const mem = navigator.deviceMemory || 8;
  return cores <= 4 || mem <= 3;
}

/**
 * @param {{ onBack: () => boolean, onPause: () => void, onResume?: () => void }} handlers
 * onBack returns true when the app handled it; false means "at the root": exit (native) / leave (web).
 */
export function initPlatform({ onBack, onPause, onResume }) {
  document.documentElement.classList.toggle('is-native', isNative());

  // Long-press menus and pinch/double-tap zoom don't belong in a game. Text fields and the privacy
  // policy keep them: its contact address must be copyable on a phone without a mail app.
  document.addEventListener('contextmenu', (e) => {
    if (!e.target.closest?.('input, textarea, .doc-sheet')) e.preventDefault();
  });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

  if (isNative()) {
    const App = plugin('App');
    // Back with nothing left to close sends the app to the background (the Android 12+ default for
    // a launcher activity) instead of destroying it, so coming back is a warm resume, not a cold start.
    App?.addListener('backButton', () => {
      if (!onBack()) App.minimizeApp();
    });
    App?.addListener('pause', () => onPause());
    App?.addListener('resume', () => onResume?.());
    // System bars: light icons on the dark game come from capacitor.config.json (SystemBars.style = DARK).
    plugin('SplashScreen')?.hide().catch(() => {});
  } else {
    // Browser / installed PWA: keep one guard history entry so the hardware back
    // button navigates inside the game instead of leaving it.
    try {
      history.replaceState({ synapse: 'root' }, '');
      history.pushState({ synapse: 'guard' }, '');
      window.addEventListener('popstate', () => {
        if (onBack()) history.pushState({ synapse: 'guard' }, '');
        else history.back();
      });
    } catch {
      /* history unavailable (file://) */
    }
    registerServiceWorker();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) onPause();
    else onResume?.();
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!secure || new URLSearchParams(location.search).has('nosw')) return;
  const register = () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    // The first visit loads everything before the worker exists: hand it the list of files this
    // page actually used, so an app installed on that visit also opens offline.
    navigator.serviceWorker.ready.then((reg) =>
      setTimeout(() => {
        const urls = [location.href, ...performance.getEntriesByType('resource').map((e) => e.name)];
        reg.active?.postMessage({ type: 'precache', urls });
      }, 3000),
    );
  };
  // the game starts after an async restore (boot.js), often once 'load' has already fired
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
