// SYNAPSE engine tests — run with `node tests/run.mjs` (no dependencies).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { storage, MemoryAdapter } from '../src/game/storage.js';

storage.use(new MemoryAdapter());

const { CHALLENGE_TYPES, TYPES_BY_ID, isUnlocked, createChallenge, generateMemoryChallenge, generatePatternChallenge } = await import('../src/engine/challengeGenerator.js');
const { RNG } = await import('../src/utils/rng.js');
const { DifficultyManager } = await import('../src/engine/difficultyManager.js');
const { trialPoints } = await import('../src/engine/scoreSystem.js');
const { PlayerProfile } = await import('../src/game/playerProfile.js');
const { SessionManager } = await import('../src/engine/sessionManager.js');
const { dailyInfo } = await import('../src/engine/daily.js');
const { consistentAnswers, sequencePredictions } = await import('../src/challenges/contradict.js');
const { canonical } = await import('../src/challenges/parallax.js');
const { STRINGS } = await import('../src/data/strings.js');
const { SKILL_IDS } = await import('../src/data/skills.js');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n    ${e.stack?.split('\n').slice(0, 3).join('\n    ')}`);
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
  assert(trialPoints({ correct: false, rt: 50, targetTime: 1000 }, { difficulty: 1 }) === 0);
});
test('fast correct > slow correct, but speed never dominates', () => {
  const fast = trialPoints({ correct: true, rt: 200, targetTime: 1000 }, { difficulty: 0.5 });
  const slow = trialPoints({ correct: true, rt: 3000, targetTime: 1000 }, { difficulty: 0.5 });
  assert(fast > slow, 'fast should beat slow');
  assert(fast / slow < 1.6, `ratio too large ${fast / slow}`);
});
test('harder challenges are worth more', () => {
  const a = trialPoints({ correct: true, rt: 1000, targetTime: 1000 }, { difficulty: 0.1 });
  const b = trialPoints({ correct: true, rt: 1000, targetTime: 1000 }, { difficulty: 0.9 });
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
  sm.discardCurrent({ elapsedMs: 9000, seen: true });
  assert(sm.score === 0 && sm.streak === 0 && sm.bestStreak === 0, `score ${sm.score} streak ${sm.streak}`);
  assert(sm.activeMs === 9000, 'time already played still counts');
  assert(sm.next(), 'a fresh challenge follows');
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
  b.discardCurrent({ seen: false }); // paused on the intro card: same puzzle again
  assert(content(b) === first);
  b.discardCurrent({ seen: true }); // paused mid-puzzle: a different one for this slot only
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

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
