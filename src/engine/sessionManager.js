// SessionManager: decides which challenge comes next, which skill it trains, at which
// difficulty, how long the session lasts and when it ends.
//   startSession → selectSkill → getPlayerDifficulty → generateChallenge → (UI runs it)
//   → completeChallenge (evaluate, updateProfile, adjustDifficulty) → next → finish
import { SKILL_IDS, CORE_SKILLS } from '../data/skills.js';
import { RNG } from '../utils/rng.js';
import { clamp, mean } from '../utils/math.js';
import { DifficultyManager } from './difficultyManager.js';
import { trialPoints, challengeBonus } from './scoreSystem.js';
import { CHALLENGE_TYPES, TYPES_BY_ID, typesForSkill, isUnlocked, createChallenge } from './challengeGenerator.js';
import { dailyInfo } from './daily.js';

export const MODES = {
  quick: { id: 'quick', duration: 5 * 60_000, offset: 0, adapt: 'full', scoreMult: 1 },
  standard: { id: 'standard', duration: 10 * 60_000, offset: 0, adapt: 'full', scoreMult: 1 },
  challenge: { id: 'challenge', duration: 5 * 60_000, offset: 0.18, adapt: 'upOnly', scoreMult: 1.25, unlockAll: true },
  daily: { id: 'daily', count: 7, adapt: 'none', scoreMult: 1, unlockAll: true },
  // Practice one specific challenge type (3 rounds, adaptive).
  practice: { id: 'practice', count: 3, offset: 0, adapt: 'full', scoreMult: 1 },
};

// Share of picks: general / strengths / weaknesses (adaptive selection).
export const MIX = {
  balanced: [0.4, 0.3, 0.3],
  weakness: [0.3, 0.2, 0.5],
  strength: [0.3, 0.5, 0.2],
};

// Rough per-challenge overhead (intro + feedback) counted toward session time.
const OVERHEAD_MS = 2500;

export class SessionManager {
  constructor({ mode = 'quick', profile, settings = {}, seed, typeId, difficulty } = {}) {
    this.mode = MODES[mode] || MODES.quick;
    this.practiceType = this.mode.id === 'practice' && TYPES_BY_ID[typeId] ? typeId : null;
    if (this.mode.id === 'practice' && !this.practiceType) this.mode = MODES.quick;
    this.forcedDifficulty = typeof difficulty === 'number' ? clamp(difficulty) : null;
    this.profile = profile;
    this.settings = settings;
    this.dm = new DifficultyManager(profile);
    this.daily = this.mode.id === 'daily' ? dailyInfo() : null;
    this.rng = new RNG(this.daily ? this.daily.seed : seed);
  }

  startSession() {
    this.index = 0;
    this.activeMs = 0;
    this.startedAt = Date.now();
    this.score = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.errorRun = 0;
    this.history = []; // completed challenge summaries
    this.recentSkills = [];
    this.recentTypes = [];
    this.forceComfort = false;
    this.events = []; // level ups, unlocks
    this.unlockedBefore = new Set(CHALLENGE_TYPES.filter((T) => isUnlocked(T, this.profile)).map((T) => T.meta.id));
    this.firstSession = this.profile.state.stats.sessions === 0;
    this.plan = this.daily ? this.daily.plan : null;
    return this;
  }

  // ---------- flow ----------
  isFinished() {
    if (this.mode.count) return this.index >= this.mode.count;
    return this.activeMs >= this.mode.duration;
  }

  progress() {
    if (this.mode.count) return this.index / this.mode.count;
    return clamp(this.activeMs / this.mode.duration);
  }

  /** Returns { challenge, skill, typeId, difficulty } or null when the session is over. */
  next() {
    if (this.isFinished()) return null;
    let typeId;
    let skill;
    let difficulty;
    if (this.plan) {
      ({ typeId, difficulty } = this.plan[this.index]);
      skill = TYPES_BY_ID[typeId].meta.skill;
    } else if (this.practiceType) {
      typeId = this.practiceType;
      skill = TYPES_BY_ID[typeId].meta.skill;
      difficulty = this.forcedDifficulty ?? this.getPlayerDifficulty(skill);
    } else {
      skill = this.selectSkill();
      typeId = this.selectType(skill);
      difficulty = this.getPlayerDifficulty(skill);
    }
    const challenge = this.generateChallenge(typeId, difficulty);
    this.current = { challenge, skill, typeId, difficulty: challenge.difficulty };
    return this.current;
  }

  eligibleTypes(skill) {
    return typesForSkill(skill).filter((T) => this.mode.unlockAll || isUnlocked(T, this.profile));
  }

  selectSkill() {
    const rng = this.rng;
    const last = this.recentSkills[this.recentSkills.length - 1];
    const skills = SKILL_IDS.filter((s) => s !== last && this.eligibleTypes(s).length);
    const rating = (s) => this.profile.rating(s);

    // First ever session: start with the four core skills (memory, perception, logic, reaction).
    if (this.firstSession && this.index < CORE_SKILLS.length) return CORE_SKILLS[this.index];

    // Anti-frustration: after an error streak, give a confidence-restoring challenge.
    if (this.forceComfort) {
      this.forceComfort = false;
      const played = skills.filter((s) => this.profile.skill(s).plays > 0);
      const pool = played.length ? played : skills;
      return pool.slice().sort((a, b) => rating(b) - rating(a))[0];
    }

    // Calibrate skills never played before.
    const unplayed = skills.filter((s) => this.profile.skill(s).plays === 0 && !this.recentSkills.includes(s));
    if (unplayed.length && rng.chance(0.6)) return rng.pick(unplayed);

    const [pGeneral, pStrong] = MIX[this.settings.adaptMix] || MIX.balanced;
    const played = skills.filter((s) => this.profile.skill(s).plays > 0);
    const byRating = played.slice().sort((a, b) => rating(b) - rating(a));
    let pool = skills;
    const roll = rng.next();
    if (byRating.length >= 4) {
      if (roll < pGeneral) pool = skills;
      else if (roll < pGeneral + pStrong) pool = byRating.slice(0, 3);
      else pool = byRating.slice(-3);
    }
    // Anti-repetition: weight down recently used skills.
    return rng.weighted(pool, (s) => 1 / (1 + 2 * this.recentSkills.slice(-4).filter((x) => x === s).length));
  }

  selectType(skill) {
    const types = this.eligibleTypes(skill);
    const lastTypes = this.recentTypes.slice(-3);
    return this.rng.weighted(types, (T) => {
      let w = 1 / (1 + 2 * lastTypes.filter((x) => x === T.meta.id).length);
      if (T.meta.minRating) w *= 0.8; // combined challenges are a spice, not the meal
      return w;
    }).meta.id;
  }

  getPlayerDifficulty(skill) {
    let d = this.dm.get(skill) + (this.mode.offset || 0);
    if (this.index === 0) d -= 0.05; // warm-up
    if (this.easeNext) {
      d -= 0.05;
      this.easeNext = false;
    }
    return clamp(d, 0.02, 1);
  }

  generateChallenge(typeId, difficulty) {
    return createChallenge(typeId, difficulty, { rng: this.rng.fork(`c${this.index}`), settings: this.settings });
  }

  // ---------- scoring ----------
  /** Called by the challenge for every trial. Returns awarded points. */
  onTrial(trial, challenge) {
    const lowWeight = trial.weight < 0.5;
    if (trial.correct) {
      if (!lowWeight) {
        this.streak += 1;
        this.errorRun = 0;
      }
    } else if (!trial.forgiving) {
      this.streak = 0;
      if (!lowWeight) this.errorRun += 1;
      if (this.errorRun >= 3) {
        this.frustrated = true;
        this.errorRun = 0;
      }
    }
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    const pts = trialPoints(trial, { difficulty: challenge.difficulty, streak: this.streak, modeMult: this.mode.scoreMult });
    this.score += pts;
    return pts;
  }

  /** Evaluate a finished challenge: bonuses, adaptation, profile. */
  completeChallenge(challenge, result) {
    const { bonus, perfect } = challengeBonus(result, this.mode.scoreMult);
    this.score += bonus;
    result.points += bonus;
    const diff = this.dm.update(result.skill, result, this.mode.adapt);
    const rec = this.profile.recordChallenge(result);

    // Anti-frustration: ease the skill slightly and switch to a comfortable challenge.
    let eased = false;
    if (this.frustrated && this.mode.adapt !== 'none') {
      this.dm.ease(result.skill, 0.04);
      this.forceComfort = true;
      this.easeNext = true;
      eased = true;
    }
    this.frustrated = false;

    for (const r of [rec.primary, rec.secondary]) if (r?.levelUp) this.events.push({ type: 'levelup', skill: r.skill, level: r.levelUp });
    const unlockedNow = CHALLENGE_TYPES.filter((T) => isUnlocked(T, this.profile) && !this.unlockedBefore.has(T.meta.id));
    unlockedNow.forEach((T) => {
      this.unlockedBefore.add(T.meta.id);
      this.events.push({ type: 'unlock', typeId: T.meta.id });
    });

    this.activeMs += (result.duration || 0) + OVERHEAD_MS;
    this.recentSkills.push(result.skill);
    this.recentTypes.push(result.type);
    this.index += 1;
    const summary = {
      ...result,
      bonus,
      perfect,
      diffBefore: diff.before,
      diffAfter: this.profile.skill(result.skill).difficulty,
      ratingBefore: rec.primary.before,
      ratingAfter: rec.primary.after,
      levelUp: rec.primary.levelUp,
      eased,
      newEvents: this.events.slice(this.lastEventCount || 0),
    };
    this.lastEventCount = this.events.length;
    this.history.push(summary);
    this.profile.saveSoon();
    return summary;
  }

  /** Build the session summary and persist it. */
  finish() {
    const h = this.history;
    const trials = h.reduce((s, x) => s + x.trials, 0);
    const correct = h.reduce((s, x) => s + x.correct, 0);
    const reactionRts = h.filter((x) => x.reactionLike && x.avgRt).map((x) => x.avgRt);
    const skills = {};
    for (const x of h) {
      const s = (skills[x.skill] ||= { skill: x.skill, challenges: 0, accSum: 0, diffStart: x.diffBefore, diffEnd: x.diffAfter, ratingStart: x.ratingBefore, ratingEnd: x.ratingAfter });
      s.challenges += 1;
      s.accSum += x.accuracy;
      s.diffEnd = x.diffAfter;
      s.ratingEnd = x.ratingAfter;
    }
    Object.values(skills).forEach((s) => (s.accuracy = s.accSum / s.challenges));
    const summary = {
      mode: this.mode.id,
      score: this.score,
      challenges: h.length,
      trials,
      correct,
      accuracy: trials ? correct / trials : 0,
      avgReactionRt: reactionRts.length ? mean(reactionRts) : null,
      bestStreak: this.bestStreak,
      durationMs: Date.now() - this.startedAt,
      skills: Object.values(skills),
      events: this.events,
      perfects: h.filter((x) => x.perfect).length,
      history: h,
      dailyNumber: this.daily?.number,
      typeId: this.practiceType,
    };
    const { isRecord, prevBest } = this.profile.recordSession(summary);
    summary.isRecord = isRecord && h.length > 0 && !this.practiceType;
    summary.prevBest = prevBest;
    const today = this.profile.todayStats();
    summary.recommendBreak = today.playMs > 25 * 60_000 || today.sessions >= 4;
    return summary;
  }
}
