// Performance harness: emulates a mid-range Android phone (CPU throttled, 412×915 @2.625x)
// and measures frame pacing + main-thread/paint costs per scenario.
// Usage: node scripts/perf/measure.cjs http://localhost:8080 [label] [cpuRate]
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}
const BASE = process.argv[2] || 'http://localhost:8080';
const LABEL = process.argv[3] || 'run';
const RATE = Number(process.argv[4] || 4);
const MEASURE_MS = 6000;

const SCENARIOS = [
  { name: 'onboarding', url: '?nosw&hq', fresh: true, prep: async () => {} },
  { name: 'home', url: '?nosw&hq&skipintro', prep: async () => {} },
  { name: 'intro-card', url: '?nosw&hq&practice=echo&d=0.4', prep: async (p) => p.waitForSelector('.ready-btn') },
  { name: 'trace-motion', url: '?nosw&hq&practice=trace&d=0.8', prep: async (p) => { await p.waitForSelector('.ready-btn'); await p.tap('.ready-btn'); await p.waitForTimeout(4600); } },
  { name: 'focus-stream', url: '?nosw&hq&practice=focus&d=0.8', prep: async (p) => { await p.waitForSelector('.ready-btn'); await p.tap('.ready-btn'); await p.waitForTimeout(4600); } },
  { name: 'results', url: '?nosw&hq&debug&skipintro', prep: async (p) => {
      await p.waitForFunction(() => window.__synapse);
      await p.evaluate(() => window.__synapse.go('results', { summary: { mode: 'quick', score: 14385, challenges: 9, trials: 48, correct: 43, accuracy: 0.9, avgReactionRt: 512, bestStreak: 17, perfects: 3, isRecord: true, prevBest: 12960, recommendBreak: false, skills: [{ skill: 'memory', accuracy: 0.86, diffStart: 0.6, diffEnd: 0.66, challenges: 2 }], history: [{ skill: 'memory', type: 'echo', accuracy: 0.9 }] } }));
      await p.waitForTimeout(2500);
    } },
];

const SUM_EVENTS = ['Paint', 'RasterTask', 'UpdateLayerTree', 'Layout', 'FunctionCall', 'FireAnimationFrame', 'CompositeLayers', 'GPUTask', 'MinorGC', 'MajorGC', 'V8.GC_SCAVENGER', 'Animation', 'PrePaint', 'Layerize', 'Commit', 'ProxyMain::BeginMainFrame::commit'];

async function run() {
  const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
  const results = {};
  for (const sc of SCENARIOS) {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, locale: 'es-ES' });
    const page = await ctx.newPage();
    if (!sc.fresh) await page.addInitScript(() => localStorage.setItem('synapse.v1.onboarded', 'true'));
    await page.goto(`${BASE}/${sc.url}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await sc.prep(page);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
    await cdp.send('Performance.enable');
    const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
    await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8', 'cc', 'gpu'] });
    const frames = await page.evaluate((ms) => new Promise((resolve) => {
      const deltas = [];
      let last = performance.now();
      const t0 = last;
      const step = (ts) => {
        deltas.push(ts - last);
        last = ts;
        if (ts - t0 < ms) requestAnimationFrame(step);
        else resolve(deltas);
      };
      requestAnimationFrame(step);
    }), MEASURE_MS);
    const traceBuf = await browser.stopTracing();
    const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const trace = JSON.parse(traceBuf.toString());
    const sums = {};
    for (const ev of trace.traceEvents || []) {
      if (ev.ph !== 'X' || !ev.dur) continue;
      if (!SUM_EVENTS.includes(ev.name)) continue;
      sums[ev.name] = (sums[ev.name] || 0) + ev.dur / 1000;
    }
    const d = frames.slice(1).sort((a, b) => a - b);
    const avg = d.reduce((s, x) => s + x, 0) / d.length;
    const pct = (p) => d[Math.min(d.length - 1, Math.floor(d.length * p))];
    const secs = MEASURE_MS / 1000;
    results[sc.name] = {
      fps: +(1000 / avg).toFixed(1),
      p95ms: +pct(0.95).toFixed(1),
      jank25: +((d.filter((x) => x > 25).length / d.length) * 100).toFixed(1),
      long50: d.filter((x) => x > 50).length,
      taskMsPerS: +(((m1.TaskDuration - m0.TaskDuration) * 1000) / secs).toFixed(0),
      scriptMsPerS: +(((m1.ScriptDuration - m0.ScriptDuration) * 1000) / secs).toFixed(0),
      styleMsPerS: +(((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000) / secs).toFixed(0),
      styleRecalcs: m1.RecalcStyleCount - m0.RecalcStyleCount,
      layouts: m1.LayoutCount - m0.LayoutCount,
      trace: Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, +(v / secs).toFixed(1)])),
    };
    await ctx.close();
  }
  await browser.close();
  const out = path.join(process.cwd(), `perf-${LABEL}.json`);
  fs.writeFileSync(out, JSON.stringify(results, null, 2));
  for (const [k, v] of Object.entries(results)) {
    console.log(`${k.padEnd(13)} fps=${String(v.fps).padStart(5)} p95=${String(v.p95ms).padStart(5)}ms jank>25=${String(v.jank25).padStart(5)}% long>50=${String(v.long50).padStart(3)} task=${String(v.taskMsPerS).padStart(4)}ms/s script=${String(v.scriptMsPerS).padStart(4)} style=${String(v.styleMsPerS).padStart(3)} recalcs=${String(v.styleRecalcs).padStart(4)} layouts=${v.layouts}`);
    console.log(`              trace ms/s: ${Object.entries(v.trace).sort((a, b) => b[1] - a[1]).map(([n, x]) => `${n}=${x}`).join(' ')}`);
  }
}
run();
