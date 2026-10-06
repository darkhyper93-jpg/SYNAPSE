// Small synthesized sound effects (WebAudio). Optional, never continuous.
import { settings } from './settings.js';
import { isNative } from './platform.js';

let ctx = null;
function create() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) ctx = new AC();
  }
  return ctx;
}
function ac() {
  if (!create()) return null;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone({ freq = 440, to = null, type = 'sine', dur = 0.12, gain = 0.2, delay = 0 }) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const vol = gain * settings.get().volume;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const SOUNDS = {
  correct: () => {
    tone({ freq: 880, to: 1320, type: 'triangle', dur: 0.11, gain: 0.18 });
    tone({ freq: 1320, type: 'sine', dur: 0.14, gain: 0.1, delay: 0.05 });
  },
  wrong: () => tone({ freq: 220, to: 140, type: 'sawtooth', dur: 0.2, gain: 0.08 }),
  tick: () => tone({ freq: 1500, type: 'sine', dur: 0.04, gain: 0.06 }),
  tap: () => tone({ freq: 660, type: 'triangle', dur: 0.05, gain: 0.08 }),
  go: () => tone({ freq: 520, to: 1040, type: 'triangle', dur: 0.18, gain: 0.14 }),
  rule: () => {
    tone({ freq: 392, type: 'square', dur: 0.09, gain: 0.06 });
    tone({ freq: 587, type: 'square', dur: 0.12, gain: 0.06, delay: 0.09 });
  },
  perfect: () => [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.16, gain: 0.12, delay: i * 0.07 })),
  end: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: 'sine', dur: 0.3, gain: 0.12, delay: i * 0.09 })),
  levelup: () => [659, 880, 1175].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.22, gain: 0.12, delay: i * 0.1 })),
  star: () => tone({ freq: 1046, to: 1568, type: 'triangle', dur: 0.14, gain: 0.12 }),
  combo: () => {
    tone({ freq: 784, to: 1175, type: 'square', dur: 0.08, gain: 0.05 });
    tone({ freq: 1175, to: 1568, type: 'triangle', dur: 0.12, gain: 0.1, delay: 0.06 });
  },
  whoosh: () => tone({ freq: 300, to: 900, type: 'sine', dur: 0.16, gain: 0.05 }),
  count: () => tone({ freq: 660, type: 'sine', dur: 0.09, gain: 0.1 }),
  stamp: () => {
    tone({ freq: 120, to: 60, type: 'sine', dur: 0.25, gain: 0.3 });
    tone({ freq: 1568, type: 'triangle', dur: 0.12, gain: 0.08, delay: 0.05 });
  },
};

/** Called when the app goes to background / comes back. */
/**
 * Creating the AudioContext sets up the audio device synchronously (slow on some Android phones).
 * Do it while the app is idle after start-up, not inside the first PLAY tap.
 */
export function warmAudio() {
  // Browsers only allow it after a user gesture (they would just log a warning); the app's WebView allows it.
  if (!settings.get().sound || !isNative()) return;
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1200));
  idle(
    () => {
      try {
        create(); // the first sound (inside a tap) resumes it
      } catch {
        /* audio is best-effort */
      }
    },
    { timeout: 3000 },
  );
}

export function suspendAudio() {
  if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
}

export function sfx(name) {
  if (!settings.get().sound) return;
  try {
    SOUNDS[name]?.();
  } catch {
    /* audio is best-effort */
  }
}
