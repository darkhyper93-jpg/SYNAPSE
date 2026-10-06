// Haptic feedback. Uses the native Capacitor Haptics plugin inside the Android/iOS app,
// and the Vibration API in browsers that support it. Always optional (Settings).
import { settings } from './settings.js';
import { plugin } from './platform.js';

const native = () => (typeof window !== 'undefined' ? plugin('Haptics') : null);

const PATTERNS = {
  tap: 8,
  light: 12,
  medium: 22,
  heavy: 40,
  success: [14, 40, 22],
  error: [28, 50, 28],
  levelup: [16, 40, 16, 40, 40],
  tick: 6,
};

export function haptic(kind = 'light') {
  if (!settings.get().haptics) return;
  try {
    const h = native();
    if (h) {
      const p =
        kind === 'success' || kind === 'levelup'
          ? h.notification({ type: 'SUCCESS' })
          : kind === 'error'
            ? h.notification({ type: 'ERROR' })
            : kind === 'tick' || kind === 'tap'
              ? h.selectionChanged()
              : h.impact({ style: kind === 'heavy' ? 'HEAVY' : kind === 'medium' ? 'MEDIUM' : 'LIGHT' });
      p?.catch?.(() => {});
      return;
    }
    // Browsers only allow vibration after a real user gesture.
    if (typeof navigator !== 'undefined' && navigator.vibrate && navigator.userActivation?.hasBeenActive !== false) navigator.vibrate(PATTERNS[kind] ?? 10);
  } catch {
    /* haptics are best-effort */
  }
}
