// DAILY — same seed for everybody on the same UTC day (ready for a future global leaderboard).
import { RNG } from '../utils/rng.js';
import { SKILL_IDS } from '../data/skills.js';
import { typesForSkill } from './challengeGenerator.js';

const EPOCH = Date.UTC(2026, 0, 1);
const DAILY_SKILLS = 6; // skills trained per day: every skill and challenge rotates through the week
const MIXED = ['nexus', 'dual'];
// Fixed difficulty ramp: comparable between players and days.
const RAMP = [0.3, 0.36, 0.42, 0.48, 0.54, 0.6, 0.62];

export function dailyNumber(date = new Date()) {
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((day - EPOCH) / 86_400_000) + 1;
}

export function dailyInfo(date = new Date()) {
  const number = dailyNumber(date);
  const seed = `synapse-daily-${number}`;
  const rng = new RNG(seed);
  const skills = rng.sample(SKILL_IDS, DAILY_SKILLS).sort((a, b) => SKILL_IDS.indexOf(a) - SKILL_IDS.indexOf(b));
  const plan = skills.map((skill, i) => {
    const types = typesForSkill(skill).filter((T) => !T.meta.minRating);
    return { typeId: rng.pick(types).meta.id, difficulty: RAMP[i], skill };
  });
  plan.push({ typeId: rng.pick(MIXED), difficulty: RAMP[6], skill: 'mixed' });
  return { number, seed, plan };
}

/** Milliseconds until the next daily. */
export function msToNextDaily(now = new Date()) {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return next - now.getTime();
}
