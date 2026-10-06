// Lists CSS animations that Chromium could NOT run on the compositor (and why).
const fs = require('node:fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const BASE = process.argv[2] || 'http://localhost:8080';
const URL = process.argv[3] || '?nosw&hq&skipintro';
(async () => {
  const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem('synapse.v1.onboarded', 'true'));
  await browser.startTracing(page, { categories: ['devtools.timeline', 'blink.animations', 'disabled-by-default-devtools.timeline'] });
  await page.goto(`${BASE}/${URL}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const buf = await browser.stopTracing();
  const tr = JSON.parse(buf.toString());
  const out = new Map();
  for (const ev of tr.traceEvents) {
    const d = ev.args?.data;
    if (ev.name === 'Animation' && d && (d.compositeFailed || d.unsupportedProperties)) {
      const key = `${d.name || '?'} node=${d.nodeName || ''} | failed=${d.compositeFailed} | props=${(d.unsupportedProperties || []).join(',')}`;
      out.set(key, (out.get(key) || 0) + 1);
    }
  }
  console.log([...out.entries()].map(([k, n]) => `${n}x ${k}`).join('\n') || 'no non-composited animations reported');
  await browser.close();
})();
