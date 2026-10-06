// Captures Play Store screenshots (phone 1080×1920, tablet 1600×2560) with a demo profile.
// Dev-only: needs Playwright + a local server (`npm start`), e.g. `node scripts/store-screenshots.cjs http://localhost:8080`
const path = require('node:path');
const fs = require('node:fs');
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}
const BASE = process.argv[2] || 'http://localhost:8080';
const LANG = process.argv[3] || 'es';
const OUT = path.join(__dirname, '..', 'store', 'screenshots', LANG);
fs.mkdirSync(OUT, { recursive: true });

// Builds a believable progress history by simulating sessions with the real engine.
async function seed(page) {
  await page.evaluate(async (lang) => {
    localStorage.clear();
    localStorage.setItem('synapse.v1.onboarded', 'true');
    localStorage.setItem('synapse.v1.settings', JSON.stringify({ lang, reducedMotion: false, haptics: true, sound: false }));
    const { PlayerProfile } = await import('./src/game/playerProfile.js');
    const { DifficultyManager } = await import('./src/engine/difficultyManager.js');
    const { SKILL_IDS } = await import('./src/data/skills.js');
    const { typesForSkill } = await import('./src/engine/challengeGenerator.js');
    const p = new PlayerProfile();
    p.reset();
    const dm = new DifficultyManager(p);
    const base = { memory: 0.62, perception: 0.7, logic: 0.55, reaction: 0.74, attention: 0.6, spatial: 0.42, decision: 0.57, flexibility: 0.5 };
    let seed = 3;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let s = 0; s < 14; s++) {
      let score = 0, trials = 0, correct = 0, best = 0, streak = 0;
      for (let k = 0; k < 11; k++) {
        const skill = SKILL_IDS[(k + s) % SKILL_IDS.length];
        const ability = base[skill] + s * 0.012;
        const d = dm.get(skill);
        const pc = 1 / (1 + Math.exp((d - ability - 0.1) * 12));
        let c = 0;
        for (let i = 0; i < 5; i++) if (rnd() < pc) { c++; streak++; best = Math.max(best, streak); } else streak = 0;
        const type = typesForSkill(skill).filter((T) => !T.meta.minRating)[0].meta.id;
        const reactionLike = skill === 'reaction' || skill === 'attention' || skill === 'flexibility';
        const res = { type, skill, difficulty: d, accuracy: c / 5, trials: 5, correct: c, speedRatio: 0.9, avgRt: reactionLike ? 620 - s * 12 + rnd() * 60 : 2400, bestRt: 380 - s * 4, reactionLike, points: Math.round(c * 160 * (1 + 2 * d)) };
        dm.update(skill, res);
        p.recordChallenge(res);
        const ts = p.typeStats(type);
        ts.bestStars = Math.max(ts.bestStars || 0, c / 5 >= 0.9 ? 3 : c / 5 >= 0.7 ? 2 : 1);
        score += res.points;
        trials += 5;
        correct += c;
      }
      p.recordSession({ mode: s % 5 === 4 ? 'daily' : 'quick', score, durationMs: 330000, bestStreak: best, accuracy: correct / trials, avgReactionRt: 640 - s * 14, dailyNumber: s % 5 === 4 ? 270 + s : undefined });
    }
    p.save();
  }, LANG);
}

async function capture(ctxOpts, prefix, shots) {
  const browser = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' } : {});
  const ctx = await browser.newContext({ ...ctxOpts, locale: LANG === 'es' ? 'es-ES' : 'en-US', isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?nosw&skipintro`, { waitUntil: 'networkidle' });
  await seed(page);
  let n = 1;
  for (const [name, fn] of shots) {
    await fn(page);
    await page.screenshot({ path: path.join(OUT, `${prefix}-${String(n++).padStart(2, '0')}-${name}.png`) });
  }
  await browser.close();
}

const open = (q) => async (page) => {
  await page.goto(`${BASE}/?nosw&hq&debug&${q}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
};

const shots = [
  ['home', open('skipintro')],
  ['intro', async (page) => { await open('practice=parallax&d=0.55')(page); await page.waitForTimeout(800); }],
  ['trace', async (page) => { await open('practice=trace&d=0.9')(page); await page.tap('.ready-btn'); await page.waitForTimeout(4300); }],
  ['mirror', async (page) => { await open('practice=mirror&d=0.85')(page); await page.tap('.ready-btn'); await page.waitForTimeout(5300); }],
  ['echo', async (page) => { await open('practice=echo&d=0.7')(page); await page.tap('.ready-btn'); await page.waitForTimeout(4600); }],
  ['levelup', async (page) => {
    await open('skipintro')(page);
    page.evaluate(() => window.__synapse.fx.celebrate({ kicker: document.documentElement.lang === 'es' ? 'SUBES DE NIVEL' : 'LEVEL UP', title: document.documentElement.lang === 'es' ? 'MEMORIA' : 'MEMORY', subtitle: document.documentElement.lang === 'es' ? 'Nivel 4 · Experto' : 'Level 4 · Expert', color: '#b07bff', duration: 8000 })).catch(() => {});
    await page.waitForTimeout(900);
  }],
  ['results', async (page) => {
    await open('skipintro')(page);
    await page.evaluate(() => {
      const skills = [['memory', 0.86, 0.6, 0.66], ['logic', 0.8, 0.52, 0.57], ['reaction', 0.92, 0.74, 0.8], ['spatial', 0.75, 0.44, 0.47], ['attention', 0.9, 0.6, 0.65]];
      const history = skills.concat(skills.slice(0, 4)).map(([skill, acc], i) => ({ skill, type: { memory: 'echo', logic: 'contradict', reaction: 'spark', spatial: 'parallax', attention: 'focus' }[skill], accuracy: Math.min(1, acc + (i % 3) * 0.05) }));
      window.__synapse.go('results', { summary: { mode: 'quick', score: 14385, challenges: 9, trials: 48, correct: 43, accuracy: 0.9, avgReactionRt: 512, bestStreak: 17, perfects: 3, isRecord: true, prevBest: 12960, recommendBreak: false, skills: skills.map(([skill, acc, d0, d1]) => ({ skill, accuracy: acc, diffStart: d0, diffEnd: d1, challenges: 2 })), history } });
    });
    await page.waitForTimeout(2600);
  }],
  ['profile', async (page) => { await open('skipintro')(page); await page.evaluate(() => window.__synapse.go('profile')); await page.waitForTimeout(1500); }],
];

(async () => {
  await capture({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3 }, 'phone', shots);
  await capture({ viewport: { width: 800, height: 1280 }, deviceScaleFactor: 2 }, 'tablet', shots.filter(([n]) => ['home', 'mirror', 'results', 'profile'].includes(n)));
  console.log('screenshots in', OUT);
})();
