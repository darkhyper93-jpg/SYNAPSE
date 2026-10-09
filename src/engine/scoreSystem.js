// Score = base × difficulty multiplier × accuracy (correct/incorrect) × speed factor × streak.
// Speed is deliberately bounded (0.85–1.25) so that it never dominates precision:
// a wrong answer, however fast, is worth 0 points.
import { clamp } from '../utils/math.js';

export const BASE_POINTS = 100;
// A flawless challenge is worth as much as POINT_UNITS full questions, whatever its format: a stream of
// twenty quick taps and three long puzzles get the same budget (see Challenge.pointUnits()).
export const POINT_UNITS = 3;

export function difficultyMultiplier(d) {
  return 1 + 2 * clamp(d);
}

export function speedFactor(rt, targetTime) {
  if (rt == null || !targetTime) return 1;
  const r = rt / targetTime;
  return clamp(1.3 - 0.3 * r, 0.85, 1.25);
}

/** streak: the run in point units (SessionManager.heat; a flawless challenge adds POINT_UNITS). */
export function streakMultiplier(streak) {
  return 1 + Math.min(streak, 25) * 0.02;
}

/**
 * Unrounded points of one trial (SessionManager rounds them to steps of 5, carrying the remainder).
 * scale: the challenge's share of POINT_UNITS per unit of weight (1 for a three-question challenge).
 * speed: the speed factor to use instead of the trial's own (a correct "do nothing" has no reaction time).
 */
export function trialRaw({ correct, rt, targetTime, weight = 1 }, { difficulty, streak = 0, modeMult = 1, scale = 1, speed }) {
  if (!correct) return 0;
  return BASE_POINTS * difficultyMultiplier(difficulty) * (speed ?? speedFactor(rt, targetTime)) * streakMultiplier(streak) * weight * scale * modeMult;
}

/** Consistency bonus at the end of a challenge. */
export function challengeBonus(result, modeMult = 1) {
  if (result.trials < 2) return { bonus: 0, perfect: false };
  const m = difficultyMultiplier(result.difficulty) * modeMult;
  if (result.accuracy >= 0.999) return { bonus: Math.round((150 * m) / 5) * 5, perfect: true };
  if (result.accuracy >= 0.8) return { bonus: Math.round((50 * m) / 5) * 5, perfect: false };
  return { bonus: 0, perfect: false };
}
