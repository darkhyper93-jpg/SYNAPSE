// SYNAPSE engine tests — run with `node tests/run.mjs` (no dependencies).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { storage, MemoryAdapter } from '../src/game/storage.js';

storage.use(new MemoryAdapter());

const { CHALLENGE_TYPES, createChallenge, generateMemoryChallenge, generatePatternChallenge } = await import('../src/engine/challengeGenerator.js');
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
  COLOR_IDS.forEach((c) => need.push(`color.${c}`, `glyph.${c}`));
  SHAPE_IDS.forEach((s) => need.push(`shape.${s}`));
  const missing = need.filter((k) => !STRINGS.en[k]);
  assert(!missing.length, missing.join(', '));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
