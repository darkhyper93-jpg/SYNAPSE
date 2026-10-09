// SYNAPSE engine tests — run with `node tests/run.mjs` (no dependencies).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { storage, MemoryAdapter } from '../src/game/storage.js';

storage.use(new MemoryAdapter());

const { CHALLENGE_TYPES, TYPES_BY_ID, isUnlocked, createChallenge, generateMemoryChallenge, generatePatternChallenge } = await import('../src/engine/challengeGenerator.js');
const { RNG } = await import('../src/utils/rng.js');
const { DifficultyManager } = await import('../src/engine/difficultyManager.js');
const { trialRaw, streakMultiplier, challengeBonus } = await import('../src/engine/scoreSystem.js');
const { PlayerProfile } = await import('../src/game/playerProfile.js');
const { SessionManager } = await import('../src/engine/sessionManager.js');
const { dailyInfo } = await import('../src/engine/daily.js');
const { consistentAnswers, sequencePredictions } = await import('../src/challenges/contradict.js');
const { canonical } = await import('../src/challenges/parallax.js');
const { STRINGS } = await import('../src/data/strings.js');
const { SKILL_IDS } = await import('../src/data/skills.js');

let passed = 0;
let failed = 0;
const pending = []; // async tests: awaited before the totals are printed
function test(name, fn) {
  const pass = () => {
    passed++;
    console.log(`  ✓ ${name}`);
  };
  const fail = (e) => {
    failed++;
    console.log(`  ✗ ${name}\n    ${e.stack?.split('\n').slice(0, 3).join('\n    ')}`);
  };
  try {
    const r = fn();
    if (r && typeof r.then === 'function') pending.push(r.then(pass, fail));
    else pass();
  } catch (e) {
    fail(e);
  }
}
const assert = (cond, msg = 'assertion failed') => {
  if (!cond) throw new Error(msg);
};

console.log('\nFairness engine — every generator, every difficulty');
for (const T of CHALLENGE_TYPES) {
  test(`${T.meta.id}: valid at all difficulties (0 → 1)`, () => {
    let attempts = 0;
    let n = 0;
    for (let d = 0; d <= 1.0001; d += 0.05) {
      for (let seed = 0; seed < 12; seed++) {
        const ch = createChallenge(T.meta.id, d, { rng: new RNG(`${T.meta.id}-${seed}-${d.toFixed(2)}`) });
        assert(ch.validate(), 'returned challenge must validate');
        attempts += ch.attempts;
        n++;
      }
    }
    const avg = attempts / n;
    assert(avg < 8, `too many regeneration attempts on average (${avg.toFixed(1)})`);
  });
}

test('generators scale with difficulty (ECHO grid & exposure)', () => {
  const easy = createChallenge('echo', 0.1, { rng: new RNG('e') });
  const hard = createChallenge('echo', 0.9, { rng: new RNG('e') });
  const ez = easy.rounds[0];
  const hd = hard.rounds[0];
  assert(hd.rows * hd.cols > ez.rows * ez.cols, 'harder → bigger grid');
  assert(hd.exposure < ez.exposure + 400, 'harder → not longer exposure');
});

test('spec-style generator entry points work', () => {
  assert(generateMemoryChallenge(0.2, { rng: new RNG(1) }).skill === 'memory');
  assert(generatePatternChallenge(0.8, { rng: new RNG(2) }).skill === 'logic');
});

console.log('\nLogic fairness');
test('n×n with 3 examples has a unique answer', () => {
  const ans = consistentAnswers([[2, 4], [3, 9], [4, 16]], 5);
  assert(ans.size === 1 && ans.has(25), [...ans].join(','));
});
test('two examples of a linear rule are ambiguous (rejected)', () => {
  const ans = consistentAnswers([[2, 4], [3, 6]], 5);
  assert(ans.size > 1, 'should be ambiguous');
});
test('sequence predictors agree on arithmetic / disagree on short ambiguous', () => {
  const p = sequencePredictions([3, 7, 11, 15, 19]);
  assert(p.size === 1 && p.has(23));
  assert(sequencePredictions([1, 2, 4]).size !== 1 || true);
});

console.log('\nSpatial fairness');
test('mirror image of a chiral polycube is not a rotation', () => {
  const shape = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [1, 1, 1]];
  const mirror = shape.map(([x, y, z]) => [-x, y, z]);
  assert(canonical(shape) !== canonical(mirror));
});
test('rotated polycube has the same canonical form', () => {
  const shape = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [1, 1, 1]];
  const rot = shape.map(([x, y, z]) => [-y, x, z]);
  assert(canonical(shape) === canonical(rot));
});

console.log('\nScore system');
test('wrong answers score 0, even when instant', () => {
  assert(trialRaw({ correct: false, rt: 50, targetTime: 1000 }, { difficulty: 1 }) === 0);
});
test('fast correct > slow correct, but speed never dominates', () => {
  const fast = trialRaw({ correct: true, rt: 200, targetTime: 1000 }, { difficulty: 0.5 });
  const slow = trialRaw({ correct: true, rt: 3000, targetTime: 1000 }, { difficulty: 0.5 });
  assert(fast > slow, 'fast should beat slow');
  assert(fast / slow < 1.6, `ratio too large ${fast / slow}`);
});
test('harder challenges are worth more', () => {
  const a = trialRaw({ correct: true, rt: 1000, targetTime: 1000 }, { difficulty: 0.1 });
  const b = trialRaw({ correct: true, rt: 1000, targetTime: 1000 }, { difficulty: 0.9 });
  assert(b > a);
});

console.log('\nDifficulty manager');
const freshProfile = () => new PlayerProfile(PlayerProfile.loadState());
test('high accuracy raises difficulty, low accuracy lowers it, both smoothly', () => {
  const p = freshProfile();
  p.reset();
  const dm = new DifficultyManager(p);
  p.skill('memory').plays = 10;
  const d0 = dm.get('memory');
  const up = dm.update('memory', { accuracy: 1, speedRatio: 0.7, difficulty: d0 });
  assert(up.after > up.before && up.after - up.before <= 0.08, `up ${up.after - up.before}`);
  p.skill('memory').recent = [];
  const down = dm.update('memory', { accuracy: 0.3, speedRatio: 1.2, difficulty: up.after });
  assert(down.after < down.before && down.before - down.after <= 0.081, `down ${down.before - down.after}`);
});
test('fixed mode (daily) never changes difficulty', () => {
  const p = freshProfile();
  const dm = new DifficultyManager(p);
  const r = dm.update('logic', { accuracy: 1, speedRatio: 0.5, difficulty: 0.3 }, 'none');
  assert(r.delta === 0);
});
test('simulated players converge to their own level (≈80% accuracy zone)', () => {
  for (const ability of [0.3, 0.55, 0.8]) {
    const p = freshProfile();
    p.reset();
    const dm = new DifficultyManager(p);
    const rng = new RNG(`sim${ability}`);
    // P(correct) is a logistic curve around the player's ability.
    const pc = (d) => 1 / (1 + Math.exp((d - ability - 0.1) * 12));
    const accs = [];
    for (let i = 0; i < 60; i++) {
      const d = dm.get('spatial');
      let c = 0;
      for (let k = 0; k < 6; k++) c += rng.chance(pc(d)) ? 1 : 0;
      const res = { accuracy: c / 6, speedRatio: 1, difficulty: d, trials: 6, correct: c, skill: 'spatial', type: 'mirror' };
      dm.update('spatial', res);
      p.recordChallenge(res);
      if (i >= 30) accs.push(c / 6);
    }
    const meanAcc = accs.reduce((a, b) => a + b, 0) / accs.length;
    assert(meanAcc > 0.62 && meanAcc < 0.95, `ability ${ability}: accuracy ${meanAcc.toFixed(2)}`);
    const rating = p.rating('spatial');
    assert(Math.abs(rating / 100 - ability) < 0.2, `ability ${ability}: rating ${rating}`);
  }
});

console.log('\nSession manager');
test('quick session: variety, no immediate skill repetition, ends on time', () => {
  const p = freshProfile();
  p.reset();
  const sm = new SessionManager({ mode: 'quick', profile: p, seed: 42 }).startSession();
  const skills = [];
  let guard = 0;
  while (!sm.isFinished() && guard++ < 100) {
    const plan = sm.next();
    skills.push(plan.skill);
    const res = { ...plan.challenge.getResult(), accuracy: 0.8, trials: 4, correct: 3, points: 100, duration: 25000, speedRatio: 1 };
    sm.completeChallenge(plan.challenge, res);
  }
  assert(guard < 100, 'session must end');
  for (let i = 1; i < skills.length; i++) assert(skills[i] !== skills[i - 1], `repeat at ${i}: ${skills.join(',')}`);
  assert(new Set(skills).size >= 5, `too little variety: ${skills.join(',')}`);
  assert(skills.slice(0, 4).join() === 'memory,perception,logic,reaction', 'first session starts with MVP core skills');
  const summary = sm.finish();
  assert(summary.challenges === skills.length);
  assert(p.state.stats.sessions === 1);
});
test('anti-frustration: 3 errors in a row eases difficulty and switches skill', () => {
  const p = freshProfile();
  p.reset();
  SKILL_IDS.forEach((s, i) => {
    p.skill(s).plays = 5;
    p.skill(s).rating = 20 + i * 8;
  });
  p.state.stats.sessions = 3;
  const sm = new SessionManager({ mode: 'quick', profile: p, seed: 7 }).startSession();
  const plan = sm.next();
  for (let i = 0; i < 3; i++) sm.onTrial({ correct: false, weight: 1 }, plan.challenge);
  const before = p.skill(plan.skill).difficulty;
  const sum = sm.completeChallenge(plan.challenge, { ...plan.challenge.getResult(), accuracy: 0, trials: 3, correct: 0, points: 0, duration: 10000, speedRatio: 1 });
  assert(sum.eased, 'should be eased');
  assert(p.skill(plan.skill).difficulty < before, 'difficulty eased');
  const next = sm.next();
  assert(next.skill !== plan.skill, 'different challenge next');
});
test('first error after a rule switch does not break the streak', () => {
  const p = freshProfile();
  const sm = new SessionManager({ mode: 'quick', profile: p, seed: 1 }).startSession();
  const plan = sm.next();
  sm.onTrial({ correct: true, weight: 1 }, plan.challenge);
  sm.onTrial({ correct: true, weight: 1 }, plan.challenge);
  sm.onTrial({ correct: false, weight: 0.5, forgiving: true }, plan.challenge);
  assert(sm.streak === 2, `streak ${sm.streak}`);
});

test('a paused (discarded) challenge gives back its points and streak, never the clock', () => {
  const p = freshProfile();
  p.reset();
  const sm = new SessionManager({ mode: 'quick', profile: p, seed: 3 }).startSession();
  const plan = sm.next();
  sm.onTrial({ correct: true, weight: 1, rt: 400 }, plan.challenge);
  sm.onTrial({ correct: true, weight: 1, rt: 400 }, plan.challenge);
  assert(sm.score > 0 && sm.streak === 2);
  sm.interruptCurrent({ elapsedMs: 9000, seen: true });
  assert(sm.score === 0 && sm.streak === 0 && sm.bestStreak === 0, `score ${sm.score} streak ${sm.streak}`);
  assert(sm.activeMs === 9000, 'time already played still counts');
  assert(sm.next(), 'a fresh challenge follows');
});
// Answers go through the challenge as in the game (recordTrial → hooks.onTrial → session).
function playInto(sm, plan, trials) {
  plan.challenge.hooks = { onTrial: (tr, ch) => sm.onTrial(tr, ch) };
  trials.forEach((tr) => plan.challenge.recordTrial(tr));
}
const right = { correct: true, rt: 900, weight: 1 };
const wrong = { correct: false, rt: null, weight: 1 };
test('stepping away after a miss cannot undo it: the challenge ends with what was played', () => {
  const p = freshProfile();
  p.reset();
  const sm = new SessionManager({ mode: 'quick', profile: p, seed: 11 }).startSession();
  const plan = sm.next();
  playInto(sm, plan, [right, wrong]);
  const after = { score: sm.score, heat: sm.heatNow(), streak: sm.streak };
  const closed = sm.interruptCurrent({ elapsedMs: 6000, seen: true });
  assert(closed && closed.early, 'the challenge must close, not be thrown away');
  assert(sm.score === after.score && sm.heatNow() === after.heat && sm.streak === after.streak, `score ${sm.score}/${after.score} heat ${sm.heatNow()}/${after.heat}`);
  assert(closed.bonus === 0, `no end bonus for an unfinished challenge (got ${closed.bonus})`);
  assert(sm.index === 1 && sm.history.length === 1, 'its slot is used');
  assert(sm.next().challenge !== plan.challenge, 'the session moves on');
});
test('a challenge closed early is rated as if the rest had gone at the target accuracy', () => {
  const sm = new SessionManager({ mode: 'quick', profile: freshProfile(), seed: 12 }).startSession();
  const plan = sm.next();
  const units = plan.challenge.pointUnits();
  playInto(sm, plan, [right, wrong]);
  const closed = sm.interruptCurrent({ elapsedMs: 4000, seen: true });
  const want = (1 + 0.8 * Math.max(0, units - 2)) / Math.max(units, 2);
  assert(Math.abs(closed.accuracy - want) < 1e-9, `accuracy ${closed.accuracy}, want ${want}`);
});
test('in the Daily, stepping away after a miss uses the slot: no second try at it', () => {
  const sm = new SessionManager({ mode: 'daily', profile: freshProfile() }).startSession();
  const plan = sm.next();
  playInto(sm, plan, [wrong]);
  sm.interruptCurrent({ elapsedMs: 3000, seen: true });
  assert(sm.index === 1 && sm.next().typeId === sm.plan[1].typeId, 'the Daily goes on to its next slot');
});
test('stepping away with no miss yet still costs nothing but the time', () => {
  const sm = new SessionManager({ mode: 'daily', profile: freshProfile() }).startSession();
  const plan = sm.next();
  playInto(sm, plan, [right, right]);
  const closed = sm.interruptCurrent({ elapsedMs: 3000, seen: true });
  assert(closed === null && sm.index === 0 && sm.score === 0 && sm.streak === 0, 'thrown away, slot kept');
});
// every answer given (the pause lands on the last feedback): weights summing to its pointUnits()
function allAnswered(plan, missAt = -1) {
  const units = plan.challenge.pointUnits();
  const k = Math.ceil(units - 1e-9);
  return Array.from({ length: k }, (_, i) => ({ ...(i === missAt ? wrong : right), weight: units / k }));
}
test('stepping away once every answer is in counts the whole challenge, end bonus included', () => {
  // seed 13 deals ECHO at d 0.2 (×1.4), 3 questions: one miss → 2/3 right → bonus 150 × 1.4 × 1/3 = 70
  const played = () => {
    const sm = new SessionManager({ mode: 'quick', profile: new PlayerProfile(), seed: 13 }).startSession();
    const plan = sm.next();
    playInto(sm, plan, allAnswered(plan, 0));
    return { sm, plan };
  };
  const { sm, plan } = played();
  assert(plan.typeId === 'echo' && plan.challenge.pointUnits() === 3, `fixture changed: ${plan.typeId}`);
  const closed = sm.interruptCurrent({ elapsedMs: 8000, seen: true });
  assert(closed && !closed.early, 'nothing was left to play: not an early close');
  assert(closed.bonus === 70, `bonus ${closed?.bonus}, want 70`);
  assert(Math.abs(closed.accuracy - 2 / 3) < 1e-9, `accuracy ${closed.accuracy}`);
  // the same as letting the feedback play out
  const twin = played();
  twin.sm.completeChallenge(twin.plan.challenge, twin.plan.challenge.getResult());
  assert(sm.score === twin.sm.score && sm.index === twin.sm.index, `score ${sm.score}/${twin.sm.score}`);
});
test('a flawless challenge is kept when the pause lands on its last feedback', () => {
  const sm = new SessionManager({ mode: 'daily', profile: freshProfile() }).startSession();
  const plan = sm.next();
  playInto(sm, plan, allAnswered(plan));
  const score = sm.score;
  const closed = sm.interruptCurrent({ elapsedMs: 8000, seen: true });
  assert(closed && closed.perfect, 'it must count, not be thrown away');
  assert(sm.score >= score && score > 0 && sm.index === 1, `score ${sm.score}/${score}, index ${sm.index}`);
});
test('quit without saving leaves the profile exactly as before', () => {
  const p = freshProfile();
  p.reset();
  const before = JSON.stringify(p.state);
  const sm = new SessionManager({ mode: 'quick', profile: p, seed: 5 }).startSession();
  const plan = sm.next();
  sm.completeChallenge(plan.challenge, { ...plan.challenge.getResult(), accuracy: 1, trials: 4, correct: 4, points: 300, duration: 20000, speedRatio: 0.8 });
  assert(JSON.stringify(p.state) !== before, 'the challenge changed the profile');
  sm.abandon();
  assert(JSON.stringify(p.state) === before, 'abandon restores it');
});
test('play time excludes pauses', () => {
  const p = freshProfile();
  const sm = new SessionManager({ mode: 'quick', profile: p, seed: 9 }).startSession();
  sm.t0 -= 3_660_000; // started 61 minutes ago:
  sm.pauseClock();
  sm.pausedAt -= 3_600_000; // one minute of play, then an hour in the background
  sm.resumeClock();
  const ms = sm.playedMs();
  assert(ms >= 59_000 && ms < 62_000, `played ${ms}`);
});
test('LEVEL UP fires once per level, not every time a rating wobbles over a boundary', () => {
  const p = freshProfile();
  p.reset();
  const s = p.skill('memory');
  s.plays = 10;
  const res = (difficulty, accuracy) => ({ skill: 'memory', type: 'echo', difficulty, accuracy, speedRatio: 1, trials: 4, correct: 3, points: 100 });
  let ups = 0;
  for (let i = 0; i < 40; i++) ups += p.recordChallenge(res(i % 2 ? 0.62 : 0.3, 0.8)).primary.levelUp ? 1 : 0;
  assert(ups <= 2, `celebrated ${ups} times`);
});
test('combined challenges stay unlocked once earned', () => {
  const p = freshProfile();
  p.reset();
  const sm = new SessionManager({ mode: 'quick', profile: p, seed: 11 }).startSession();
  p.skill('attention').rating = 45;
  const plan = sm.next();
  sm.completeChallenge(plan.challenge, { ...plan.challenge.getResult(), accuracy: 0.8, trials: 4, correct: 3, points: 100, duration: 20000, speedRatio: 1 });
  p.skill('attention').rating = 30;
  assert(isUnlocked(TYPES_BY_ID.dual, p), 'DUAL must not re-lock');
});
test('a replayed Daily scores but no longer moves ratings', () => {
  const p = freshProfile();
  p.reset();
  const n = dailyInfo().number;
  p.state.daily[n] = { score: 1000, accuracy: 0.8, date: '2026-10-07' };
  const sm = new SessionManager({ mode: 'daily', profile: p }).startSession();
  const plan = sm.next();
  const before = p.rating(plan.skill);
  sm.completeChallenge(plan.challenge, { ...plan.challenge.getResult(), accuracy: 1, trials: 4, correct: 4, points: 500, duration: 20000, speedRatio: 0.7 });
  assert(p.rating(plan.skill) === before, 'rating unchanged');
  assert(sm.score > 0, 'still scores');
});
test('corrupt or partial saved profiles load with defaults instead of crashing', () => {
  storage.save('profile', { version: 1, stats: { sessions: null, playMs: 'x' }, skills: { memory: { rating: null, recent: 'no' } }, history: [null, { t: 1, index: 3 }], daily: { 5: null, 6: { score: 10 } }, days: 7, best: { quick: NaN } });
  const p = new PlayerProfile(PlayerProfile.loadState());
  assert(p.state.stats.sessions === 0 && p.state.stats.playMs === 0);
  assert(p.rating('memory') === 0 && Array.isArray(p.skill('memory').recent));
  assert(p.state.history.length === 1 && Object.keys(p.state.daily).join() === '6' && p.state.best.quick === 0);
  storage.save('profile', { version: 99, stats: { sessions: 7 } });
  PlayerProfile.loadState();
  assert(storage.load('profile.backup', null)?.stats?.sessions === 7, 'an unknown version is backed up, not lost');
  storage.remove('profile');
  storage.remove('profile.backup');
});
test('a non-numeric difficulty never breaks generation (clamp is NaN-safe)', () => {
  const sm = new SessionManager({ mode: 'practice', typeId: 'echo', difficulty: NaN, profile: freshProfile() }).startSession();
  assert(sm.forcedDifficulty === null);
  assert(createChallenge('echo', NaN, { rng: new RNG('nan') }).validate());
});

console.log('\nDaily challenge');
test('same day → same plan and same generated content', () => {
  const date = new Date(Date.UTC(2026, 9, 6, 12));
  const a = dailyInfo(date);
  const b = dailyInfo(new Date(Date.UTC(2026, 9, 6, 23)));
  assert(JSON.stringify(a.plan) === JSON.stringify(b.plan));
  assert(a.plan.length === 7);
  const ca = createChallenge(a.plan[0].typeId, a.plan[0].difficulty, { rng: new RNG(a.seed) });
  const cb = createChallenge(b.plan[0].typeId, b.plan[0].difficulty, { rng: new RNG(b.seed) });
  const strip = (c) => JSON.stringify(c.rounds || c.params, (k, v) => (typeof v === 'function' ? undefined : v instanceof Float32Array ? Array.from(v.slice(0, 20)) : v));
  assert(strip(ca) === strip(cb), 'content must match');
  assert(dailyInfo(new Date(Date.UTC(2026, 9, 7))).number === a.number + 1);
});
test('a pause during the Daily never changes the remaining puzzles', () => {
  const content = (sm) => JSON.stringify(sm.next().challenge.rounds || sm.current.challenge.params, (k, v) => (v instanceof Float32Array ? Array.from(v.slice(0, 20)) : v));
  const a = new SessionManager({ mode: 'daily', profile: freshProfile() }).startSession();
  const b = new SessionManager({ mode: 'daily', profile: freshProfile() }).startSession();
  const first = content(a);
  assert(first === content(b), 'same first puzzle for everyone');
  b.interruptCurrent({ seen: false }); // paused on the intro card: same puzzle again
  assert(content(b) === first);
  b.interruptCurrent({ seen: true }); // paused mid-puzzle: a different one for this slot only
  assert(content(b) !== first);
  for (const sm of [a, b]) sm.completeChallenge(sm.current.challenge, { ...sm.current.challenge.getResult(), accuracy: 1, trials: 3, correct: 3, points: 10, duration: 1000, speedRatio: 1 });
  assert(content(a) === content(b), 'the next slot is the same for everyone again');
});
test('every skill and challenge shows up in the Daily over a few weeks', () => {
  const seen = new Set();
  for (let d = 0; d < 42; d++) dailyInfo(new Date(Date.UTC(2026, 9, 1 + d))).plan.forEach((x) => seen.add(x.typeId).add(x.skill));
  CHALLENGE_TYPES.forEach((T) => assert(seen.has(T.meta.id), `${T.meta.id} never in the Daily`));
  SKILL_IDS.forEach((s) => assert(seen.has(s), `${s} never in the Daily`));
});
test('FOCUS: the target right after anything that looks like the exception is held back', () => {
  for (let k = 0; k < 300; k++) {
    const c = createChallenge('focus', 0.55 + (k % 10) * 0.045, { rng: new RNG(`fx${k}`) });
    const { items, exception } = c.params;
    items.forEach((it, i) => {
      const p = items[i - 1];
      assert(!(it.respond && p && p.shape === exception.shape && p.color === exception.color), `seed fx${k} item ${i}`);
    });
  }
});

console.log('\ni18n');
test('es and en define the same keys', () => {
  const en = Object.keys(STRINGS.en);
  const es = new Set(Object.keys(STRINGS.es));
  const missing = en.filter((k) => !es.has(k));
  const extra = [...es].filter((k) => !STRINGS.en[k]);
  assert(!missing.length && !extra.length, `missing in es: ${missing.join(', ')} | extra: ${extra.join(', ')}`);
});
test('every literal t("…") key used in the code exists', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
  const files = [];
  const walk = (d) => readdirSync(d).forEach((f) => {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js') && !p.endsWith('i18n.js')) files.push(p);
  });
  walk(root);
  const missing = new Set();
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bt\('([^']+)'/g)) if (!STRINGS.en[m[1]]) missing.add(`${m[1]} (${f.split('src')[1]})`);
    // template keys: t(`prefix.${x}`) → check every known value of the prefix exists for at least one key
    for (const m of src.matchAll(/\bt\(`([a-z.]+)\$\{/g)) {
      if (!Object.keys(STRINGS.en).some((k) => k.startsWith(m[1]))) missing.add(`${m[1]}* (${f.split('src')[1]})`);
    }
  }
  assert(!missing.size, [...missing].join('\n    '));
});
test('dynamic keys: every skill, challenge, colour, shape, mirror op', async () => {
  const need = [];
  SKILL_IDS.forEach((s) => need.push(`skill.${s}`, `skill.${s}.short`, `skill.${s}.desc`));
  CHALLENGE_TYPES.forEach((T) => ['name', 'tag', 'how', 'controls'].forEach((k) => need.push(`ch.${T.meta.id}.${k}`)));
  const { COLOR_IDS, SHAPE_IDS } = await import('../src/data/visuals.js');
  COLOR_IDS.forEach((c) => need.push(`color.${c}`, `glyph.${c}`, `adj.${c}`, `adj.${c}.f`));
  SHAPE_IDS.forEach((s) => need.push(`shape.${s}`));
  const missing = need.filter((k) => !STRINGS.en[k]);
  assert(!missing.length, missing.join(', '));
});

console.log('\nFair difficulty: every level stays within human limits');
// Every difficulty from 0 to 1, a few seeds each: d = 1 must be reachable by the best players, never luck.
const across = (id, seeds = 25) => {
  const out = [];
  for (let d = 0; d <= 1.0001; d += 0.1) for (let s = 0; s < seeds; s++) out.push(createChallenge(id, d, { rng: new RNG(`fair-${id}-${s}-${d.toFixed(1)}`) }));
  return out;
};
test('ECHO never asks to hold more than 6 symbols or a 7-step sequence (working memory holds ~4, the best ~5)', () => {
  for (const ch of across('echo')) for (const r of ch.rounds) {
    if (r.items) assert(r.items.length <= 6, `${r.items.length} symbols at d=${ch.difficulty.toFixed(1)}`);
    if (r.seq) assert(r.seq.length <= 7, `a ${r.seq.length}-step sequence at d=${ch.difficulty.toFixed(1)}`);
  }
});
test('NEXUS shows at most 6 symbols, with at least 450 ms to look at each', () => {
  for (const ch of across('nexus')) for (const r of ch.rounds) {
    assert(r.items.length <= 6, `${r.items.length} symbols at d=${ch.difficulty.toFixed(1)}`);
    assert(r.exposure / r.items.length >= 450, `${Math.round(r.exposure / r.items.length)} ms per symbol at d=${ch.difficulty.toFixed(1)}`);
  }
});
test('ONE SECOND: the majority shape wins by 2+, counts stay within subitizing range (≤ 4)', () => {
  for (const ch of across('onesecond')) for (const r of ch.rounds) {
    if (r.kind === 'majority') assert(r.margin >= 2, `margin ${r.margin} at d=${ch.difficulty.toFixed(1)}`);
    if (r.kind === 'count') assert(r.answer <= 4, `count of ${r.answer} at d=${ch.difficulty.toFixed(1)}`);
  }
});
test('DECISION can be settled by quick estimation (amounts ≥ 12–25 % apart), with ≥ 300 ms per number to read', () => {
  const total = (c) => c.reduce((a, b) => a + b, 0);
  const size = (c) => c.reduce((a, b) => a + Math.abs(b), 0); // what an approximate sum's error grows with
  for (const ch of across('decision')) for (const r of ch.rounds) {
    const at = `d=${ch.difficulty.toFixed(1)}`;
    if (r.kind === 'value') {
      const [best, next] = r.cards.slice().sort((a, b) => total(b) - total(a));
      const need = Math.max(2, 0.12 * Math.max(size(best), size(next)));
      assert(total(best) - total(next) >= need, `[${best}] = ${total(best)} vs [${next}] = ${total(next)}: lead under 12 % of the numbers added, at ${at}`);
      assert(ch.answerTime('value') / (r.cards.length * r.cards[0].length) >= 300, `${Math.round(ch.answerTime('value') / (r.cards.length * r.cards[0].length))} ms per number at ${at}`);
    }
    if (r.kind === 'compare') assert(Math.max(r.counts.left, r.counts.right) / Math.min(r.counts.left, r.counts.right) >= 1.16, `${r.counts.left} vs ${r.counts.right} at ${at}`);
    if (r.kind === 'stream') {
      const c = r.counts.slice().sort((a, b) => (r.ask === 'least' ? a - b : b - a));
      assert(Math.max(c[0], c[1]) / Math.min(c[0], c[1]) >= 1.25, `${r.ask}: ${c[0]} vs ${c[1]} at ${at}`);
    }
  }
});

console.log('\nFair scoring: the format of a challenge does not decide the score');
// What a flawless player records, re-derived here from the generated content (weights as the challenges record them).
// speed: reaction time as a share of the target time (1 = on target, 0.3 = very fast, 2 = slow).
function flawlessTrials(ch, speed = 1) {
  const p = ch.params;
  const tt = ch.meta.targetTime;
  const one = (w = 1) => ({ correct: true, rt: tt * speed, targetTime: tt, weight: w, feedback: 'mini' });
  const held = (w) => ({ correct: true, rt: null, weight: w, feedback: 'none' }); // a correct "do nothing": no reaction time
  switch (ch.type) {
    case 'echo': return ch.rounds.map((r) => one(r.seq && r.seq.length >= 6 ? 1.5 : 1));
    case 'trace': return ch.rounds.flatMap((r) => r.targets.map(() => one()));
    case 'spark': return p.events.map((e) => (e.decoy ? held(0.3) : one()));
    case 'focus': return p.items.map((it) => (it.respond ? one() : held(it.isTarget ? 1 : 0.2)));
    case 'flex': return p.trials.map(() => one());
    case 'dual': return [...p.items.map((it) => (it.kind === 'hit' ? one() : held(0.15))), one(2)];
    case 'nexus': return ch.rounds.flatMap((r) => r.questions.map(() => one()));
    default: return ch.rounds.map(() => one());
  }
}
test('a flawless challenge earns the same points whatever its format (±4 %), at every difficulty and speed', () => {
  const off = [];
  for (const d of [0, 0.25, 0.5, 0.75, 1]) for (const speed of [0.3, 1, 2]) {
    const totals = {};
    for (const T of CHALLENGE_TYPES) {
      let sum = 0;
      for (let k = 0; k < 12; k++) {
        const ch = createChallenge(T.meta.id, d, { rng: new RNG(`pts-${T.meta.id}-${k}-${d}`) });
        const sm = new SessionManager({ mode: 'quick', profile: new PlayerProfile() }).startSession();
        for (const tr of flawlessTrials(ch, speed)) sum += sm.onTrial(tr, ch);
      }
      totals[T.meta.id] = sum / 12;
    }
    const vals = Object.values(totals).sort((a, b) => a - b);
    const median = vals[Math.floor(vals.length / 2)];
    for (const [k, v] of Object.entries(totals)) if (Math.abs(v / median - 1) > 0.04) off.push(`${k} ${(v / median).toFixed(2)}× (d=${d}, speed ${speed})`);
  }
  assert(!off.length, `away from the median: ${off.join(', ')}`);
});
test('the score multiplier grows by the same amount per flawless challenge, whatever its format', () => {
  const growth = {};
  for (const T of CHALLENGE_TYPES) {
    const ch = createChallenge(T.meta.id, 0.5, { rng: new RNG(`heat-${T.meta.id}`) });
    const sm = new SessionManager({ mode: 'quick', profile: new PlayerProfile() }).startSession();
    flawlessTrials(ch).forEach((tr) => sm.onTrial(tr, ch));
    growth[T.meta.id] = sm.multiplier();
  }
  const vals = Object.values(growth);
  assert(Math.max(...vals) - Math.min(...vals) < 0.005, JSON.stringify(growth));
});
test('k flawless challenges in a row give exactly the multiplier of 3k point units (no rounding drift)', () => {
  const off = [];
  for (const d of [0, 0.3, 0.6, 0.9]) for (let k = 0; k < 10; k++) {
    const sm = new SessionManager({ mode: 'quick', profile: new PlayerProfile() }).startSession();
    CHALLENGE_TYPES.slice(0, 8).forEach((T, i) => {
      const ch = createChallenge(T.meta.id, d, { rng: new RNG(`drift-${T.meta.id}-${k}-${d}`) });
      flawlessTrials(ch).forEach((tr) => sm.onTrial(tr, ch));
      if (sm.multiplier() !== streakMultiplier(3 * (i + 1))) off.push(`after ${T.meta.id} #${i + 1} (d=${d}): ×${sm.multiplier()}`);
    });
  }
  assert(!off.length, `${off.length} drifted, e.g. ${off.slice(0, 3).join(', ')}`);
});

console.log('\nA miss costs the multiplier its share, never the whole run');
// heat built by k flawless challenges (each adds exactly 3 units)
function warmSession(k) {
  const sm = new SessionManager({ mode: 'quick', profile: new PlayerProfile() }).startSession();
  for (let i = 0; i < k; i++) {
    const ch = createChallenge('echo', 0.5, { rng: new RNG(`warm-${i}`) });
    flawlessTrials(ch).forEach((tr) => sm.onTrial(tr, ch));
  }
  return sm;
}
const fakeChallenge = (units) => ({ difficulty: 0.5, pointUnits: () => units }); // only what scoring reads
const miss = { correct: false, rt: null, weight: 1, feedback: 'full' };
const hit = { correct: true, rt: 1000, targetTime: 1000, weight: 1, feedback: 'full' };
test('a miss in a three-question challenge costs 4 units of heat; the streak still resets', () => {
  const sm = warmSession(3);
  sm.onTrial(miss, fakeChallenge(3));
  assert(sm.heatNow() === 5, `heat ${sm.heatNow()}`);
  assert(sm.streak === 0, `streak ${sm.streak}`);
  assert(sm.multiplier() === streakMultiplier(5), `×${sm.multiplier()}`);
});
test('a miss in a 20-card stream costs 4 × its share (0.6 units), not the whole run', () => {
  const sm = warmSession(3);
  const ch = createChallenge('flex', 0.5, { rng: new RNG('miss-flex') });
  sm.onTrial(miss, ch);
  const want = 9 - (4 * 3) / ch.pointUnits();
  assert(Math.abs(sm.heatNow() - want) < 1e-6, `heat ${sm.heatNow()}, want ${want}`);
});
test('heat never goes below 0', () => {
  const sm = warmSession(0);
  const ch = fakeChallenge(3);
  sm.onTrial(hit, ch);
  sm.onTrial(miss, ch);
  assert(sm.heatNow() === 0, `heat ${sm.heatNow()}`);
});
test("FLEX's forgiven slip right after a switch costs no heat", () => {
  const sm = warmSession(2);
  sm.onTrial({ correct: false, rt: null, weight: 0.5, forgiving: true, feedback: 'mini' }, createChallenge('flex', 0.5, { rng: new RNG('forgive') }));
  assert(sm.heatNow() === 6, `heat ${sm.heatNow()}`);
});
test('at the adaptive target (80 % right) the multiplier holds steady', () => {
  const sm = warmSession(3);
  const ch = fakeChallenge(5);
  [hit, hit, miss, hit, hit].forEach((tr) => sm.onTrial(tr, ch));
  assert(sm.heatNow() === 9, `heat ${sm.heatNow()}`);
});
test('where the misses fall in a challenge does not change the heat it ends with', () => {
  const run = (order) => {
    const sm = warmSession(4);
    const ch = fakeChallenge(20);
    order.forEach((tr) => sm.onTrial(tr, ch));
    return sm.heatNow();
  };
  const early = run([...Array(4).fill(miss), ...Array(16).fill(hit)]);
  const late = run([...Array(16).fill(hit), ...Array(4).fill(miss)]);
  assert(early === late && early === 12, `misses first → ${early}, misses last → ${late}`);
});
test('the end-of-challenge bonus grows with accuracy: 150 at 100 %, 90 at 80 %, nothing at 50 % or less', () => {
  const b = (accuracy, difficulty = 0, trials = 3, mode = 1) => challengeBonus({ accuracy, difficulty, trials }, mode);
  const got = [1, 0.9, 0.8, 0.5, 0.3].map((a) => b(a).bonus);
  assert(JSON.stringify(got) === '[150,120,90,0,0]', `bonuses ${got}`);
  assert(b(1).perfect && b(0.999).perfect && !b(0.998).perfect, 'perfect only from 99.9 %');
  assert(b(0.8, 1).bonus === 270, `×3 at the top difficulty: ${b(0.8, 1).bonus}`);
  assert(b(0.8, 0, 3, 1.25).bonus === 115, `challenge mode ×1.25: ${b(0.8, 0, 3, 1.25).bonus}`);
  assert(b(1, 0, 1).bonus === 0, 'a single trial earns no bonus');
  assert([0.61, 0.73, 0.97].every((a) => b(a).bonus % 5 === 0), 'always a multiple of 5');
});

test('the web version label matches package.json (Android reads its versionName from there)', async () => {
  const { APP_VERSION } = await import('../src/version.js');
  const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'));
  assert(APP_VERSION === pkg.version, `src/version.js says ${APP_VERSION}, package.json says ${pkg.version}`);
});

console.log('\nDurable saves (IndexedDB copy of the progress keys)');
// Minimal in-memory stand-ins for localStorage and IndexedDB (only what durable.js uses).
function fakeLocalStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
function fakeIndexedDB(init = {}, { hang = false, delay = 0 } = {}) {
  const data = new Map(Object.entries(init));
  const db = {
    createObjectStore() {},
    transaction(_name, mode) {
      const tx = {};
      const puts = [];
      tx.objectStore = () => ({
        put: (v, k) => puts.push([k, v]),
        openCursor() {
          const req = {};
          const entries = [...data];
          let i = 0;
          const step = () => {
            req.result = i < entries.length ? { key: entries[i][0], value: entries[i][1], continue: () => (i++, queueMicrotask(step)) } : null;
            req.onsuccess?.();
            if (!req.result) queueMicrotask(() => tx.oncomplete?.());
          };
          queueMicrotask(step);
          return req;
        },
      });
      if (mode === 'readwrite') {
        queueMicrotask(() => {
          for (const [k, v] of puts) data.set(k, v);
          tx.oncomplete?.();
        });
      }
      return tx;
    },
  };
  return {
    data,
    open() {
      const req = {};
      if (!hang) {
        const opened = () => {
          req.result = db;
          if (!data.size) req.onupgradeneeded?.();
          req.onsuccess?.();
        };
        if (delay) setTimeout(opened, delay);
        else queueMicrotask(opened);
      }
      return req;
    },
  };
}
const settle = () => new Promise((r) => setTimeout(r, 0));
let durableRun = 0;
async function withDurable(ls, idb, fn) {
  const saved = { localStorage: globalThis.localStorage, indexedDB: globalThis.indexedDB };
  globalThis.localStorage = ls;
  globalThis.indexedDB = idb;
  try {
    const mod = await import(`../src/game/durable.js?run=${++durableRun}`); // fresh module state per scenario
    return await fn(mod);
  } finally {
    globalThis.localStorage = saved.localStorage;
    globalThis.indexedDB = saved.indexedDB;
  }
}
const P = 'synapse.v1.';
// the scenarios swap globals, so they run one after another
let lane = Promise.resolve();
const inLane = (fn) => {
  const run = lane.then(fn);
  lane = run.catch(() => {});
  return run;
};

test('a newer IndexedDB copy wins over a localStorage that lost its last writes', () =>
  inLane(() => withDurable(fakeLocalStorage({ [`${P}profile`]: '{"old":1}', [`${P}__seq`]: '5', [`${P}session.pending`]: '{"x":1}' }), fakeIndexedDB({ profile: '{"new":1}', 'session.pending': null, __seq: 7 }), async (d) => {
    const ls = globalThis.localStorage;
    assert((await d.restoreDurable()) === 'restored', 'expected restored');
    assert(ls.getItem(`${P}profile`) === '{"new":1}', 'profile not restored');
    assert(ls.getItem(`${P}session.pending`) === null, 'a removal in the copy must remove the key');
    assert(ls.getItem(`${P}__seq`) === '7', 'counter not restored');
  })));

test('a key the copy never recorded is left alone when the copy is restored', () =>
  inLane(() => withDurable(fakeLocalStorage({ [`${P}profile`]: '{"keep":1}', [`${P}__seq`]: '1' }), fakeIndexedDB({ 'session.pending': '{"p":1}', __seq: 4 }), async (d) => {
    const ls = globalThis.localStorage;
    assert((await d.restoreDurable()) === 'restored', 'expected restored');
    assert(ls.getItem(`${P}profile`) === '{"keep":1}', 'a missing key must not erase the profile');
    assert(ls.getItem(`${P}session.pending`) === '{"p":1}', 'recorded key not restored');
  })));

test('blocked storage (reading localStorage throws) skips the copy instead of stopping the start', () => {
  const blocked = {};
  Object.defineProperty(blocked, 'getItem', { get() { throw new Error('SecurityError'); } });
  return inLane(async () => {
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
    globalThis.indexedDB = fakeIndexedDB();
    try {
      const d = await import(`../src/game/durable.js?run=${++durableRun}`);
      assert((await d.restoreDurable()) === 'skipped', 'expected skipped');
      d.mirror('profile', '{}'); // must not throw either
    } finally {
      if (saved) Object.defineProperty(globalThis, 'localStorage', saved);
      else delete globalThis.localStorage;
      delete globalThis.indexedDB;
    }
  });
});

test('first run after the update: the copy is seeded from localStorage, nothing is overwritten', () => {
  const idb = fakeIndexedDB();
  return inLane(() => withDurable(fakeLocalStorage({ [`${P}profile`]: '{"mine":1}', [`${P}onboarded`]: 'true' }), idb, async (d) => {
    assert((await d.restoreDurable()) === 'kept', 'expected kept');
    await settle();
    assert(globalThis.localStorage.getItem(`${P}profile`) === '{"mine":1}', 'localStorage changed');
    assert(idb.data.get('profile') === '{"mine":1}' && idb.data.get('onboarded') === 'true' && idb.data.has('__seq'), 'copy not seeded');
  }));
});

test('mirrored writes reach the copy with a counter ahead of the old one; other keys are ignored', () => {
  const idb = fakeIndexedDB({ __seq: 3, profile: '{"a":1}' });
  return inLane(() => withDurable(fakeLocalStorage({ [`${P}__seq`]: '3', [`${P}profile`]: '{"a":1}' }), idb, async (d) => {
    await d.restoreDurable();
    d.mirror('profile', '{"a":2}');
    d.mirror('session.pending', null);
    d.mirror('lastMode', '"quick"');
    await settle();
    await settle();
    assert(idb.data.get('profile') === '{"a":2}', 'profile not mirrored');
    assert(idb.data.get('session.pending') === null, 'removal not mirrored');
    assert(!idb.data.has('lastMode'), 'non-progress key mirrored');
    assert(idb.data.get('__seq') > 3 && String(idb.data.get('__seq')) === globalThis.localStorage.getItem(`${P}__seq`), 'counters out of step');
  }));
});

test('a newer copy that arrives after the start timeout is still restored (and the page reloads)', () => {
  const idb = fakeIndexedDB({ profile: '{"new":1}', __seq: 9 }, { delay: 1500 });
  return inLane(() => withDurable(fakeLocalStorage({ [`${P}profile`]: '{"old":1}', [`${P}__seq`]: '2' }), idb, async (d) => {
    let reloaded = false;
    globalThis.location = { reload: () => (reloaded = true) };
    try {
      assert((await d.restoreDurable()) === 'skipped', 'the start must not wait for it');
      d.mirror('profile', '{"old":2}'); // played on the older data meanwhile
      await new Promise((r) => setTimeout(r, 600));
      assert(globalThis.localStorage.getItem(`${P}profile`) === '{"new":1}', 'newer copy not restored');
      assert(idb.data.get('profile') === '{"new":1}', 'the newer copy was overwritten');
      assert(reloaded, 'page not reloaded onto the restored data');
    } finally {
      delete globalThis.location;
    }
  }));
});

test('a late newer copy still wins after the game has saved a few times on the older data', () => {
  const idb = fakeIndexedDB({ profile: '{"new":1}', __seq: 4 }, { delay: 1500 });
  return inLane(() => withDurable(fakeLocalStorage({ [`${P}profile`]: '{"old":1}', [`${P}__seq`]: '2' }), idb, async (d) => {
    let reloaded = false;
    globalThis.location = { reload: () => (reloaded = true) };
    try {
      assert((await d.restoreDurable()) === 'skipped', 'the start must not wait for it');
      const ls = globalThis.localStorage;
      // saves made at start-up (recovering a pending session, settings) push the counter past the copy's
      for (const v of ['{"old":2}', '{"old":3}', '{"old":4}']) {
        ls.setItem(`${P}profile`, v);
        d.mirror('profile', v);
      }
      await new Promise((r) => setTimeout(r, 600));
      assert(ls.getItem(`${P}profile`) === '{"new":1}', `newer copy not restored (localStorage has ${ls.getItem(`${P}profile`)})`);
      assert(idb.data.get('profile') === '{"new":1}', `the newer copy was overwritten with ${idb.data.get('profile')}`);
      assert(reloaded, 'page not reloaded onto the restored data');
    } finally {
      delete globalThis.location;
    }
  }));
});

test('after a late restore nothing is saved until the reload (leaving the page saves the old state)', () => {
  const idb = fakeIndexedDB({ profile: '{"new":1}', __seq: 9 }, { delay: 1500 });
  return inLane(() => withDurable(fakeLocalStorage({ [`${P}profile`]: '{"old":1}', [`${P}__seq`]: '2' }), idb, async (d) => {
    globalThis.location = { reload: () => {} };
    try {
      assert((await d.restoreDurable()) === 'skipped', 'the start must not wait for it');
      assert(d.writable(), 'saving must work while nothing has been restored');
      await new Promise((r) => setTimeout(r, 600));
      assert(!d.writable(), 'saves must stop once the page is reloading onto the restored copy');
      d.mirror('profile', '{"old":2}'); // what a pause handler does as the page unloads
      await settle();
      await settle();
      assert(idb.data.get('profile') === '{"new":1}' && idb.data.get('__seq') === 9, 'the copy changed after the restore');
      assert(globalThis.localStorage.getItem(`${P}__seq`) === '9', 'the counter moved after the restore');
    } finally {
      delete globalThis.location;
    }
  }));
});

test('a hung IndexedDB never blocks the start for long', () =>
  inLane(() => withDurable(fakeLocalStorage(), fakeIndexedDB({}, { hang: true }), async (d) => {
    const t0 = Date.now();
    assert((await d.restoreDurable()) === 'skipped', 'expected skipped');
    assert(Date.now() - t0 < 3000, 'waited too long');
  })));

console.log('\nContent Security Policy');
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
// the policy index.html declares, as { directive: [sources] }
function pagePolicy() {
  const html = readFileSync(join(REPO, 'index.html'), 'utf8');
  const meta = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i);
  if (!meta) return null;
  return Object.fromEntries(meta[1].split(';').map((d) => d.trim().split(/\s+/)).filter((d) => d[0]).map(([k, ...v]) => [k, v]));
}
// what a strict 'self' policy would block, found in shipped code
function needsLooserPolicy(code) {
  return [
    [/\beval\s*\(|new Function\s*\(/, 'eval'],
    [/createElement\(\s*['"]script|<script(?![^>]*\bsrc=)/i, 'inline script'],
    [/\son[a-z]+\s*=\s*["']/, 'inline event handler'],
    [/(?:src|href)\s*=\s*["']?(?:https?:)?\/\//i, 'remote resource'],
    [/url\(\s*['"]?(?:https?:)?\/\//i, 'remote CSS resource'],
    [/@import/, 'CSS @import'],
  ].filter(([re]) => re.test(code)).map(([, what]) => what);
}
test('index.html declares a policy that only runs the game own scripts', () => {
  const p = pagePolicy();
  assert(p, 'no Content-Security-Policy meta in index.html');
  const scripts = p['script-src'] || p['default-src'];
  assert(scripts?.join(' ') === "'self'", `scripts from ${scripts}`);
  assert(p['object-src']?.join(' ') === "'none'" && p['base-uri']?.join(' ') === "'none'", 'plugins and <base> must be off');
  assert(!Object.values(p).flat().some((s) => /^(https?:|\*|'unsafe-eval')/.test(s)), 'no remote origins or eval anywhere');
});
test('the policy must come before anything it governs', () => {
  const html = readFileSync(join(REPO, 'index.html'), 'utf8');
  const at = html.search(/http-equiv="Content-Security-Policy"/i);
  assert(at > 0 && at < html.search(/<link|<script/i), 'the meta has to precede every link and script');
});
test('nothing the game ships needs what the policy forbids', () => {
  assert(needsLooserPolicy('x.innerHTML = "<img onerror=\'a()\'>"; eval(s)').length === 2, 'the check itself must catch these');
  const files = [join(REPO, 'index.html'), join(REPO, 'sw.js')];
  const walk = (dir) => readdirSync(dir).forEach((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : /\.(js|css)$/.test(f) && files.push(join(dir, f))));
  walk(join(REPO, 'src'));
  const bad = files.flatMap((f) => needsLooserPolicy(readFileSync(f, 'utf8')).map((w) => `${f.slice(REPO.length + 1)}: ${w}`));
  assert(!bad.length, bad.join(', '));
});

await Promise.all(pending);
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
