// Ablation: disable one visual feature at a time on a screen and measure frame rate.
const fs = require('node:fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const BASE = process.argv[2] || 'http://localhost:8080';
const URL = process.argv[3] || '?nosw&hq&skipintro';
const RATE = Number(process.argv[4] || 4);
const VARIANTS = JSON.parse(process.env.VARIANTS || 'null') || {
  baseline: '',
  'no-logo-anims': '.logo *,.logo *::before{animation:none!important}',
  'no-play-anims': '.play-btn *,.play-btn *::before{animation:none!important}',
  'all-css-anims-off': '*,*::before,*::after{animation:none!important}',
};
(async () => {
  const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
  for (const [name, css] of Object.entries(VARIANTS)) {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, locale: 'es-ES' });
    const page = await ctx.newPage();
    await page.addInitScript(() => localStorage.setItem('synapse.v1.onboarded', 'true'));
    await page.goto(`${BASE}/${URL}`, { waitUntil: 'networkidle' });
    if (css) await page.addStyleTag({ content: css });
    await page.waitForTimeout(1500);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
    const d = await page.evaluate(() => new Promise((res) => { const a = []; let l = performance.now(); const t0 = l; const f = (t) => { a.push(t - l); l = t; if (t - t0 < 6000) requestAnimationFrame(f); else res(a); }; requestAnimationFrame(f); }));
    const xs = d.slice(1);
    const avg = xs.reduce((s, x) => s + x, 0) / xs.length;
    console.log(`${name.padEnd(22)} fps=${(1000 / avg).toFixed(1).padStart(5)}  frames=${xs.length}`);
    await ctx.close();
  }
  await browser.close();
})();
