// Player profile: long-term stats, per-skill difficulty and rating, history.
// Ratings are SYNAPSE-internal performance indices (0–100), not IQ or clinical measures.
import { storage } from './storage.js';
import { SKILL_IDS, masteryFor } from '../data/skills.js';
import { clamp } from '../utils/math.js';

const VERSION = 1;
export const INITIAL_DIFFICULTY = 0.25;
const HISTORY_CAP = 200;

const emptySkill = () => ({
  difficulty: INITIAL_DIFFICULTY,
  bestDifficulty: INITIAL_DIFFICULTY,
  rating: 0,
  plays: 0,
  trials: 0,
  correct: 0,
  rtSum: 0,
  rtCount: 0,
  recent: [],
});

const emptyState = () => ({
  version: VERSION,
  createdAt: Date.now(),
  stats: {
    sessions: 0,
    challenges: 0,
    trials: 0,
    correct: 0,
    rtSum: 0,
    rtCount: 0,
    bestRt: null,
    bestStreak: 0,
    totalScore: 0,
    playMs: 0,
  },
  skills: Object.fromEntries(SKILL_IDS.map((s) => [s, emptySkill()])),
  types: {},
  history: [],
  best: { quick: 0, standard: 0, challenge: 0, daily: 0, practice: 0 },
  daily: {},
  days: {},
});

/** Performance index of one challenge (0–100). Mostly "difficulty you can sustain at ~80 %". */
export function performanceIndex(result) {
  const speedAdj = clamp((1 - (result.speedRatio ?? 1)) * 0.05, -0.03, 0.03);
  return clamp(result.difficulty + (result.accuracy - 0.8) * 0.6 + speedAdj, 0, 1) * 100;
}

export class PlayerProfile {
  constructor(state) {
    this.state = state || PlayerProfile.loadState();
  }

  static loadState() {
    const saved = storage.load('profile', null);
    if (!saved || saved.version !== VERSION) return emptyState();
    // Merge with defaults so new fields survive upgrades.
    const base = emptyState();
    const merged = { ...base, ...saved, stats: { ...base.stats, ...saved.stats }, best: { ...base.best, ...saved.best } };
    merged.skills = Object.fromEntries(SKILL_IDS.map((s) => [s, { ...emptySkill(), ...(saved.skills?.[s] || {}) }]));
    return merged;
  }

  save() {
    if (this._saveTimer) {
      const { idle, t } = this._saveTimer;
      if (idle != null) globalThis.cancelIdleCallback?.(idle);
      if (t != null) clearTimeout(t);
      this._saveTimer = null;
    }
    storage.save('profile', this.state);
  }

  /**
   * Coalesced save for mid-session updates: serialising the whole profile right as the summary
   * card animates in costs a visible hitch, so it waits for an idle moment (max ~1s).
   * flush() writes it immediately (app paused / session end).
   */
  saveSoon() {
    if (this._saveTimer) return;
    const g = globalThis;
    this._saveTimer = g.requestIdleCallback ? { idle: g.requestIdleCallback(() => this.save(), { timeout: 1000 }) } : { t: setTimeout(() => this.save(), 300) };
  }

  flush() {
    if (this._saveTimer) this.save();
  }

  reset() {
    this.state = emptyState();
    this.save();
  }

  skill(id) {
    if (!this.state.skills[id]) this.state.skills[id] = emptySkill();
    return this.state.skills[id];
  }

  typeStats(id) {
    if (!this.state.types[id]) this.state.types[id] = { plays: 0, bestPoints: 0 };
    return this.state.types[id];
  }

  rating(id) {
    return this.skill(id).rating;
  }

  mastery(id) {
    return masteryFor(this.rating(id));
  }

  playedSkills() {
    return SKILL_IDS.filter((s) => this.skill(s).plays > 0);
  }

  /** Global SYNAPSE index: mean rating of the skills played so far. */
  globalIndex() {
    const played = this.playedSkills();
    if (!played.length) return 0;
    return Math.round(played.reduce((s, id) => s + this.rating(id), 0) / played.length);
  }

  /** Record a finished challenge. Returns { levelUp, ratingBefore, ratingAfter }. */
  recordChallenge(result) {
    const out = {};
    const apply = (skillId, weight) => {
      const s = this.skill(skillId);
      const before = s.rating;
      const lvlBefore = masteryFor(before).level;
      const perf = performanceIndex(result);
      const alpha = (s.plays < 4 ? 0.5 : 0.22) * weight;
      s.rating = s.plays === 0 && weight === 1 ? perf * 0.9 : before + alpha * (perf - before);
      s.rating = Math.round(clamp(s.rating, 0, 100) * 10) / 10;
      if (weight === 1) {
        s.plays += 1;
        s.trials += result.trials;
        s.correct += result.correct;
        if (result.avgRt) {
          s.rtSum += result.avgRt * result.correct;
          s.rtCount += result.correct;
        }
      }
      const lvlAfter = masteryFor(s.rating).level;
      return { skill: skillId, before, after: s.rating, levelUp: lvlAfter > lvlBefore ? lvlAfter : 0 };
    };
    out.primary = apply(result.skill, 1);
    if (result.secondary) out.secondary = apply(result.secondary, 0.5);

    const st = this.state.stats;
    st.challenges += 1;
    st.trials += result.trials;
    st.correct += result.correct;
    if (result.avgRt && result.reactionLike) {
      st.rtSum += result.avgRt * result.correct;
      st.rtCount += result.correct;
    }
    if (result.bestRt && result.reactionLike) st.bestRt = st.bestRt ? Math.min(st.bestRt, result.bestRt) : result.bestRt;

    const ts = this.typeStats(result.type);
    ts.plays += 1;
    ts.bestPoints = Math.max(ts.bestPoints, result.points || 0);
    return out;
  }

  /** Record a finished session (summary from SessionManager). */
  recordSession(summary) {
    const st = this.state.stats;
    st.sessions += 1;
    st.totalScore += summary.score;
    st.playMs += summary.durationMs;
    st.bestStreak = Math.max(st.bestStreak, summary.bestStreak);
    const prevBest = this.state.best[summary.mode] || 0;
    const isRecord = summary.score > prevBest;
    if (isRecord) this.state.best[summary.mode] = summary.score;

    const day = new Date().toISOString().slice(0, 10);
    const d = (this.state.days[day] ||= { sessions: 0, playMs: 0 });
    d.sessions += 1;
    d.playMs += summary.durationMs;
    // keep last 60 days only
    const days = Object.keys(this.state.days).sort();
    while (days.length > 60) delete this.state.days[days.shift()];

    if (summary.mode === 'daily' && summary.dailyNumber) {
      const prev = this.state.daily[summary.dailyNumber];
      if (!prev || summary.score > prev.score) {
        this.state.daily[summary.dailyNumber] = { score: summary.score, accuracy: summary.accuracy, date: day };
      }
    }

    this.state.history.push({
      t: Date.now(),
      mode: summary.mode,
      score: summary.score,
      accuracy: summary.accuracy,
      avgRt: summary.avgReactionRt,
      index: this.globalIndex(),
      ratings: Object.fromEntries(SKILL_IDS.map((s) => [s, Math.round(this.rating(s))])),
      difficulty: Object.fromEntries(SKILL_IDS.map((s) => [s, Math.round(this.skill(s).difficulty * 100) / 100])),
    });
    if (this.state.history.length > HISTORY_CAP) this.state.history.splice(0, this.state.history.length - HISTORY_CAP);
    this.save();
    return { isRecord, prevBest };
  }

  todayStats() {
    const day = new Date().toISOString().slice(0, 10);
    return this.state.days[day] || { sessions: 0, playMs: 0 };
  }

  accuracy() {
    const st = this.state.stats;
    return st.trials ? st.correct / st.trials : 0;
  }

  avgReactionRt() {
    const st = this.state.stats;
    return st.rtCount ? st.rtSum / st.rtCount : null;
  }
}

export const profile = new PlayerProfile();
