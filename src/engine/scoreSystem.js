// Score = base × difficulty multiplier × accuracy (correct/incorrect) × speed factor × streak.
// Speed is deliberately bounded (0.85–1.25) so that it never dominates precision:
// a wrong answer, however fast, is worth 0 points.
import { clamp } from '../utils/math.js';

export const BASE_POINTS = 100;

export function difficultyMultiplier(d) {
  return 1 + 2 * clamp(d);
}

export function speedFactor(rt, targetTime) {
  if (rt == null || !targetTime) return 1;
  const r = rt / targetTime;
  return clamp(1.3 - 0.3 * r, 0.85, 1.25);
}

export function streakMultiplier(streak) {
  return 1 + Math.min(streak, 25) * 0.02;
}

export function trialPoints({ correct, rt, targetTime, weight = 1 }, { difficulty, streak = 0, modeMult = 1 }) {
  if (!correct) return 0;
  const raw = BASE_POINTS * difficultyMultiplier(difficulty) * speedFactor(rt, targetTime) * streakMultiplier(streak) * weight * modeMult;
  return Math.max(5, Math.round(raw / 5) * 5);
}

/** Consistency bonus at the end of a challenge. */
export function challengeBonus(result, modeMult = 1) {
  if (result.trials < 2) return { bonus: 0, perfect: false };
  const m = difficultyMultiplier(result.difficulty) * modeMult;
  if (result.accuracy >= 0.999) return { bonus: Math.round((150 * m) / 5) * 5, perfect: true };
  if (result.accuracy >= 0.8) return { bonus: Math.round((50 * m) / 5) * 5, perfect: false };
  return { bonus: 0, perfect: false };
}
