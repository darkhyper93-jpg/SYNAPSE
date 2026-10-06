// Challenge registry + Fairness Engine.
// generate → validate → (retry / ease) so that every challenge shown is solvable and unambiguous.
import { EchoChallenge } from '../challenges/echo.js';
import { OneSecondChallenge } from '../challenges/oneSecond.js';
import { TraceChallenge } from '../challenges/trace.js';
import { ContradictChallenge } from '../challenges/contradict.js';
import { SparkChallenge } from '../challenges/spark.js';
import { FocusChallenge } from '../challenges/focus.js';
import { MirrorChallenge } from '../challenges/mirror.js';
import { ParallaxChallenge } from '../challenges/parallax.js';
import { FlexChallenge } from '../challenges/flex.js';
import { DecisionChallenge } from '../challenges/decision.js';
import { DualChallenge } from '../challenges/dual.js';
import { NexusChallenge } from '../challenges/nexus.js';
import { RNG } from '../utils/rng.js';
import { clamp } from '../utils/math.js';

export const CHALLENGE_TYPES = [
  EchoChallenge,
  OneSecondChallenge,
  TraceChallenge,
  ContradictChallenge,
  SparkChallenge,
  FocusChallenge,
  MirrorChallenge,
  ParallaxChallenge,
  FlexChallenge,
  DecisionChallenge,
  DualChallenge,
  NexusChallenge,
];

export const TYPES_BY_ID = Object.fromEntries(CHALLENGE_TYPES.map((T) => [T.meta.id, T]));

export const typesForSkill = (skill) => CHALLENGE_TYPES.filter((T) => T.meta.skill === skill);

/** Combined challenges unlock only after demonstrating performance. */
export function isUnlocked(Type, profile) {
  const m = Type.meta;
  if (!m.minRating) return true;
  return (m.unlockSkills || []).every((s) => profile.rating(s) >= m.minRating);
}

const MAX_ATTEMPTS = 40;

/**
 * Create a validated challenge. If validation keeps failing, difficulty is eased a bit
 * (never shown to the player) rather than presenting an unfair puzzle.
 */
export function createChallenge(typeId, difficulty, { rng = new RNG(), settings = {} } = {}) {
  const Type = TYPES_BY_ID[typeId];
  if (!Type) throw new Error(`Unknown challenge type: ${typeId}`);
  let d = clamp(difficulty);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const ch = new Type({ difficulty: d, rng: rng.fork(`${typeId}:${attempt}`), settings });
    ch.generate();
    if (ch.validate()) {
      // If the engine had to ease the level, scoring uses the level actually played.
      ch.attempts = attempt + 1;
      return ch;
    }
    if (attempt % 10 === 9) d = clamp(d - 0.05);
  }
  throw new Error(`Fairness engine could not produce a valid ${typeId} challenge at ${difficulty}`);
}

// Spec-style generator entry points: generate<Skill>Challenge(difficulty)
const bySkill = (skill) => (difficulty, opts = {}) => {
  const rng = opts.rng || new RNG();
  const Type = rng.pick(typesForSkill(skill).filter((T) => !T.meta.minRating));
  return createChallenge(Type.meta.id, difficulty, { ...opts, rng });
};
export const generateMemoryChallenge = bySkill('memory');
export const generatePerceptionChallenge = bySkill('perception');
export const generatePatternChallenge = bySkill('logic');
export const generateReactionChallenge = bySkill('reaction');
export const generateAttentionChallenge = bySkill('attention');
export const generateSpatialChallenge = bySkill('spatial');
export const generateDecisionChallenge = bySkill('decision');
export const generateFlexibilityChallenge = bySkill('flexibility');
