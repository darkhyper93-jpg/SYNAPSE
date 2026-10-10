// Installing the web version as an app (PWA), for the Install row in Settings.
// - Android / desktop Chrome: the browser fires 'beforeinstallprompt' when the game can be installed.
//   It is kept (instead of the browser's own banner) and replayed when the player taps Install.
// - iPhone / iPad: browsers never offer it; the player adds it from the Share menu, so the row explains how.
// - Already installed (opened from the home screen) or the native app: nothing is offered.

/**
 * @param {Window} win the browser window (a stand-in in tests)
 * @returns {{ mode: () => 'prompt' | 'ios' | null, prompt: () => Promise<boolean> }}
 */
export function createInstaller(win) {
  const nav = win.navigator;
  let offer = null;
  win.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    offer = e;
  });
  win.addEventListener('appinstalled', () => (offer = null));

  const isIOS = () => /iphone|ipad|ipod/i.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  // the manifest asks for fullscreen; some browsers fall back to standalone
  const installed = () =>
    nav.standalone === true || ['fullscreen', 'standalone'].some((m) => win.matchMedia?.(`(display-mode: ${m})`).matches);

  return {
    /** 'prompt': the browser can install it now; 'ios': show how; null: nothing to offer. */
    mode() {
      if (installed()) return null;
      if (offer) return 'prompt';
      return isIOS() ? 'ios' : null;
    },
    /** Shows the browser's install dialog (an offer works once). Resolves true if the player accepted. */
    async prompt() {
      const e = offer;
      if (!e) return false;
      offer = null;
      e.prompt();
      try {
        return (await e.userChoice)?.outcome === 'accepted';
      } catch {
        return false;
      }
    },
  };
}

let current = null;

/** Starts listening for the browser's offer (web only; call once, early). */
export function listenForInstall(win = window) {
  current ??= createInstaller(win);
}

export const installMode = () => current?.mode() ?? null;
export const promptInstall = () => current?.prompt() ?? Promise.resolve(false);
