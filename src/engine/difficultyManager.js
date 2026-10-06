// Per-skill adaptive difficulty (0.00 = trivial, 1.00 = extreme).
// Goal: keep the player in the 70–90 % accuracy zone with smooth changes.
import { clamp, mean } from '../utils/math.js';

export const TARGET_ACCURACY = 0.8;
export const MIN_DIFFICULTY = 0.02;
export const MAX_STEP_UP = 0.06;
export const MAX_STEP_DOWN = 0.08;

export class DifficultyManager {
  /** @param {import('../game/playerProfile.js').PlayerProfile} profile */
  constructor(profile) {
    this.profile = profile;
  }

  get(skill) {
    return this.profile.skill(skill).difficulty;
  }

  /**
   * Compute the next difficulty from a challenge result.
   * mode: 'full' (normal), 'upOnly' (challenge mode), 'none' (daily: fixed difficulty).
   */
  update(skill, result, mode = 'full') {
    const s = this.profile.skill(skill);
    const before = s.difficulty;
    s.recent = [...(s.recent || []), { a: result.accuracy, r: result.speedRatio, d: result.difficulty }].slice(-6);
    if (mode === 'none') return { before, after: before, delta: 0 };

    // Blend this challenge with the recent window to avoid over-reacting to one result.
    const windowAcc = mean(s.recent.map((x) => x.a));
    const acc = 0.65 * result.accuracy + 0.35 * windowAcc;
    let delta = (acc - TARGET_ACCURACY) * 0.3;

    // Speed only nudges when the player is also precise.
    if (result.accuracy >= 0.9 && result.speedRatio < 0.85) delta += 0.015;
    if (result.accuracy >= 0.9 && result.speedRatio > 1.4) delta -= 0.01;

    // Calibration phase: the first plays of a skill move faster to find the right level.
    const calib = s.plays < 3 ? 1.8 : 1;
    delta = clamp(delta * calib, -MAX_STEP_DOWN * calib, MAX_STEP_UP * calib);
    if (mode === 'upOnly') delta = Math.max(0, delta * 0.6);

    s.difficulty = clamp(before + delta, MIN_DIFFICULTY, 1);
    s.bestDifficulty = Math.max(s.bestDifficulty || 0, s.difficulty);
    return { before, after: s.difficulty, delta: s.difficulty - before };
  }

  /** Anti-frustration: ease a skill slightly after an error streak. */
  ease(skill, amount = 0.04) {
    const s = this.profile.skill(skill);
    s.difficulty = clamp(s.difficulty - amount, MIN_DIFFICULTY, 1);
    return s.difficulty;
  }
}
