export const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a);
export const sum = (arr) => arr.reduce((s, x) => s + x, 0);
export const mean = (arr) => (arr.length ? sum(arr) / arr.length : 0);

export function median(arr) {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function std(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(mean(arr.map((x) => (x - m) ** 2)));
}

/** Interpolate a numeric parameter by difficulty and round it. */
export const byDiff = (d, easy, hard) => Math.round(lerp(easy, hard, clamp(d)));
/** Same but keeps decimals. */
export const byDiffF = (d, easy, hard) => lerp(easy, hard, clamp(d));
/** Pick a step from a list by difficulty. */
export const stepDiff = (d, steps) => steps[Math.min(steps.length - 1, Math.floor(clamp(d) * steps.length))];

export const round = (v, digits = 0) => {
  const p = 10 ** digits;
  return Math.round(v * p) / p;
};

export const easeOutCubic = (t) => 1 - (1 - t) ** 3;
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
