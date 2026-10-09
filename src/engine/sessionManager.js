// SessionManager: decides which challenge comes next, which skill it trains, at which
// difficulty, how long the session lasts and when it ends.
//   startSession → selectSkill → getPlayerDifficulty → generateChallenge → (UI runs it)
//   → completeChallenge (evaluate, updateProfile, adjustDifficulty) → next → finish
import { SKILL_IDS, CORE_SKILLS } from '../data/skills.js';
import { RNG } from '../utils/rng.js';
import { clamp, mean } from '../utils/math.js';
import { DifficultyManager, TARGET_ACCURACY } from './difficultyManager.js';
import { trialRaw, speedFactor, challengeBonus, streakMultiplier, POINT_UNITS, LOSS_PER_MISS } from './scoreSystem.js';
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
// Timed sessions don't open a new challenge in the last seconds (the clock would sit at 0:00).
const MIN_SLICE_MS = 15_000;

const clock = () => (globalThis.performance?.now ? performance.now() : Date.now());

export class SessionManager {
  constructor({ mode = 'quick', profile, settings = {}, seed, typeId, difficulty } = {}) {
    this.mode = MODES[mode] || MODES.quick;
    this.practiceType = this.mode.id === 'practice' && TYPES_BY_ID[typeId] ? typeId : null;
    if (this.mode.id === 'practice' && !this.practiceType) this.mode = MODES.quick;
    this.forcedDifficulty = Number.isFinite(difficulty) ? clamp(difficulty) : null;
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
    this.t0 = clock(); // monotonic: play time never jumps with the wall clock
    this.pausedMs = 0;
    this.pausedAt = null;
    this.rerolls = 0;
    // "Quit without saving" puts the profile back exactly as it was
    this.profileBefore = JSON.stringify(this.profile.state);
    this.score = 0;
    this.streak = 0; // correct answers in a row (what the HUD and "best streak" show)
    this.heat = 0; // the run in point units: a right answer adds its share, a miss takes back 4× it (multiplier)
    this.bestStreak = 0;
    this.errorRun = 0;
    this.history = []; // completed challenge summaries
    this.recentSkills = [];
    this.recentTypes = [];
    this.forceComfort = false;
    this.events = []; // level ups, unlocks
    this.unlockedBefore = new Set(CHALLENGE_TYPES.filter((T) => isUnlocked(T, this.profile)).map((T) => T.meta.id));
    this.persistUnlocks(this.unlockedBefore);
    this.firstSession = this.profile.state.stats.sessions === 0;
    this.plan = this.daily ? this.daily.plan : null;
    // a replayed Daily has known answers: it still scores, but no longer moves the ratings
    this.rated = !(this.daily && this.profile.state.daily[this.daily.number]);
    return this;
  }

  persistUnlocks(ids) {
    const u = (this.profile.state.unlocked ||= {});
    for (const id of ids) if (TYPES_BY_ID[id]?.meta.minRating) u[id] = true;
  }

  // ---------- pause ----------
  pauseClock() {
    if (this.pausedAt == null) this.pausedAt = clock();
  }

  resumeClock() {
    if (this.pausedAt == null) return;
    this.pausedMs += clock() - this.pausedAt;
    this.pausedAt = null;
  }

  /**
   * The current challenge was interrupted (pause, app in background). Its timed stimuli can't pick up
   * where they stopped, so it never continues:
   * - nothing missed yet: it is thrown away with everything it earned and a fresh one takes the slot;
   * - a miss already made: it ends there. What was played stands (points, the miss, the streak), the
   *   slot is used and there is no end bonus, so stepping away can never undo a mistake;
   * - every answer already in (the pause landed on the last feedback): it counts in full, bonus included.
   * In every case the time already spent still counts. seen: the player already saw its content (a Daily
   * then deals a different one for this slot).
   * @returns the summary of the challenge that ended, or null if it was thrown away
   */
  interruptCurrent({ elapsedMs = 0, seen = false } = {}) {
    if (!this.current) return null;
    const { challenge } = this.current;
    const trials = challenge.trials || [];
    const played = trials.reduce((s, tr) => s + Math.max(0, tr.weight), 0);
    const rest = Math.max(0, challenge.pointUnits() - played);
    if (rest < 1e-9) {
      // every answer was already in (the pause landed on the last feedback): it simply counts
      const result = challenge.getResult();
      result.duration = Math.max(0, elapsedMs);
      return this.completeChallenge(challenge, result);
    }
    if (trials.some((tr) => !tr.correct && !tr.forgiving)) {
      // Rated as if the part not played had gone at the target accuracy: an interruption neither
      // drags the rating down nor lifts it.
      const result = challenge.getResult();
      const won = trials.reduce((s, tr) => s + (tr.correct ? Math.max(0, tr.weight) : 0), 0);
      result.accuracy = (won + TARGET_ACCURACY * rest) / (played + rest);
      result.duration = Math.max(0, elapsedMs);
      return this.completeChallenge(challenge, result, { early: true });
    }
    Object.assign(this, this.slotState);
    this.activeMs += Math.max(0, elapsedMs);
    if (seen) this.rerolls += 1;
    this.current = null;
    return null;
  }

  /** Quit without saving: undo every profile change made during this session. */
  abandon() {
    this.profile.state = JSON.parse(this.profileBefore);
    this.profile.save();
  }

  // ---------- flow ----------
  isFinished() {
    if (this.mode.count) return this.index >= this.mode.count;
    return this.activeMs >= this.mode.duration - MIN_SLICE_MS;
  }

  progress() {
    if (this.mode.count) return this.index / this.mode.count;
    return clamp(this.activeMs / this.mode.duration);
  }

  /** Returns { challenge, skill, typeId, difficulty } or null when the session is over. */
  next() {
    if (this.isFinished()) return null;
    // what interruptCurrent() restores if this challenge gets interrupted
    this.slotState = {
      score: this.score,
      streak: this.streak,
      heat: this.heat,
      bestStreak: this.bestStreak,
      errorRun: this.errorRun,
      frustrated: this.frustrated,
      forceComfort: this.forceComfort,
      easeNext: this.easeNext,
    };
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
    // Daily slots are seeded by position: the same puzzles for everyone, whatever happened before
    const rng = this.daily ? new RNG(`${this.daily.seed}:c${this.index}${this.rerolls ? `:r${this.rerolls}` : ''}`) : this.rng.fork(`c${this.index}`);
    return createChallenge(typeId, difficulty, { rng, settings: this.settings });
  }

  // ---------- scoring ----------
  /**
   * Scoring state of the challenge being played, set up on its first trial: its share of the point
   * budget (every format shares the same one), the speed of its answers so far, and the rounding
   * carried from trial to trial.
   */
  scoring(challenge) {
    if (this.scored?.challenge !== challenge) {
      const units = challenge?.pointUnits?.();
      this.scored = { challenge, scale: units > 0 ? POINT_UNITS / units : 1, speedSum: 0, speedN: 0, carry: 0 };
    }
    return this.scored;
  }

  /** The run in point units, without the float dust of adding many small shares (k flawless challenges = 3k). */
  heatNow() {
    return Math.round(this.heat * 1e6) / 1e6;
  }

  /** Score multiplier from the current run: it grows by the same amount for any flawless challenge. */
  multiplier() {
    return streakMultiplier(this.heatNow());
  }

  /** Called by the challenge for every trial. Returns awarded points. */
  onTrial(trial, challenge) {
    const lowWeight = trial.weight < 0.5;
    const sc = this.scoring(challenge);
    if (trial.correct) {
      this.heat += (trial.weight ?? 1) * sc.scale;
      if (!lowWeight) {
        this.streak += 1;
        this.errorRun = 0;
      }
    } else if (!trial.forgiving) {
      this.streak = 0;
      this.heat = Math.max(0, this.heat - LOSS_PER_MISS * (trial.weight ?? 1) * sc.scale);
      if (!lowWeight) this.errorRun += 1;
      if (this.errorRun >= 3) {
        this.frustrated = true;
        this.errorRun = 0;
      }
    }
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    // A correct "do nothing" (a lure left alone) has no reaction time: it is paid at the speed of this
    // challenge's answers, so a fast or slow player earns the same share in every format.
    let speed = 1;
    if (trial.correct && trial.rt != null && trial.targetTime) {
      speed = speedFactor(trial.rt, trial.targetTime);
      sc.speedSum += speed;
      sc.speedN += 1;
    } else if (sc.speedN) speed = sc.speedSum / sc.speedN;
    const raw = trialRaw(trial, { difficulty: challenge.difficulty, streak: this.heatNow(), modeMult: this.mode.scoreMult, scale: sc.scale, speed });
    // Points come in steps of 5. The rounding is carried to the next trial, so small shares (a lure
    // left alone is worth ~8) add up to what they are worth instead of each being rounded up or down.
    let pts = 0;
    if (raw > 0) {
      pts = Math.round((raw + sc.carry) / 5) * 5;
      if (trial.feedback !== 'none') pts = Math.max(5, pts); // a correct answer on screen never reads "+0"
      sc.carry += raw - pts;
    }
    this.score += pts;
    return pts;
  }

  /** Evaluate a finished challenge: bonuses, adaptation, profile. early: it ended at an interruption (no bonus). */
  completeChallenge(challenge, result, { early = false } = {}) {
    const { bonus, perfect } = early ? { bonus: 0, perfect: false } : challengeBonus(result, this.mode.scoreMult);
    this.score += bonus;
    result.points += bonus;
    const diff = this.dm.update(result.skill, result, this.rated ? this.mode.adapt : 'none');
    const rec = this.profile.recordChallenge(result, { rate: this.rated });

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
    this.persistUnlocks(unlockedNow.map((T) => T.meta.id));

    this.activeMs += (result.duration || 0) + OVERHEAD_MS;
    this.current = null;
    this.rerolls = 0;
    this.recentSkills.push(result.skill);
    this.recentTypes.push(result.type);
    this.index += 1;
    const summary = {
      ...result,
      bonus,
      perfect,
      early,
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

  /** Play time so far, pauses excluded (monotonic clock). */
  playedMs() {
    return Math.max(0, Math.round((this.pausedAt ?? clock()) - this.t0 - this.pausedMs));
  }

  summarize() {
    const h = this.history;
    const trials = h.reduce((s, x) => s + x.trials, 0);
    const correct = h.reduce((s, x) => s + x.correct, 0);
    // the same per-challenge accuracy the summary cards and the timeline show, weighted by length
    const accuracy = trials ? h.reduce((s, x) => s + x.accuracy * x.trials, 0) / trials : 0;
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
      accuracy,
      avgReactionRt: reactionRts.length ? mean(reactionRts) : null,
      bestStreak: this.bestStreak,
      durationMs: this.playedMs(),
      skills: Object.values(skills),
      events: this.events,
      perfects: h.filter((x) => x.perfect).length,
      history: h,
      dailyNumber: this.daily?.number,
      typeId: this.practiceType,
    };
    return summary;
  }

  /**
   * What recordSession() needs, small enough to store on every pause: if Android kills the app in
   * the background, the challenges already played are recorded as a finished session on next start.
   */
  pendingRecord() {
    if (!this.history.length) return null;
    const { mode, score, challenges, accuracy, avgReactionRt, bestStreak, durationMs, dailyNumber, typeId } = this.summarize();
    return { mode, score, challenges, accuracy, avgReactionRt, bestStreak, durationMs, dailyNumber, typeId };
  }

  finish() {
    this.resumeClock();
    const h = this.history;
    const summary = this.summarize();
    const { isRecord, prevBest } = this.profile.recordSession(summary);
    summary.isRecord = isRecord && h.length > 0 && !this.practiceType;
    summary.prevBest = prevBest;
    const today = this.profile.todayStats();
    summary.recommendBreak = today.playMs > 25 * 60_000 || today.sessions >= 4;
    return summary;
  }
}
