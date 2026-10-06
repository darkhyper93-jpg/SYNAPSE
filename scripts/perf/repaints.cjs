// Lists which elements are repainted continuously (should be ~0 for compositor-only animations).
const fs = require('node:fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const BASE = process.argv[2] || 'http://localhost:8080';
const URL = process.argv[3] || '?nosw&hq&skipintro';
const PREP = process.argv[4] || '';
(async () => {
  const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, locale: 'es-ES' });
  const page = await ctx.newPage();
  if (PREP !== 'fresh' && !PREP.startsWith('slide')) await page.addInitScript(() => localStorage.setItem('synapse.v1.onboarded', 'true'));
  await page.goto(`${BASE}/${URL}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  if (PREP === 'ready') { await page.tap('.ready-btn'); await page.waitForTimeout(4500); }
  if (PREP.startsWith('slide')) { for (let i = 0; i < Number(PREP.slice(5)); i++) { await page.tap('.onb-next'); await page.waitForTimeout(700); } }
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('LayerTree.enable');
  const layers = new Map();
  cdp.on('LayerTree.layerTreeDidChange', (e) => (e.layers || []).forEach((l) => layers.set(l.layerId, l)));
  const paints = new Map();
  cdp.on('LayerTree.layerPainted', (e) => paints.set(e.layerId, (paints.get(e.layerId) || 0) + 1));
  await page.waitForTimeout(3000);
  const rows = [];
  for (const [id, n] of [...paints.entries()].sort((a, b) => b[1] - a[1])) {
    const l = layers.get(id);
    let desc = '(unknown)';
    if (l?.backendNodeId) {
      try {
        const { node } = await cdp.send('DOM.describeNode', { backendNodeId: l.backendNodeId });
        const attrs = node.attributes || [];
        const cls = attrs[attrs.indexOf('class') + 1];
        desc = `${node.nodeName.toLowerCase()}${attrs.includes('id') ? '#' + attrs[attrs.indexOf('id') + 1] : ''}${attrs.includes('class') ? '.' + cls.split(' ').join('.') : ''}${node.pseudoType ? '::' + node.pseudoType : ''}`;
      } catch { /* detached */ }
    } else if (l) desc = `layer ${l.width}x${l.height}`;
    rows.push(`${String(n).padStart(4)} paints/3s  ${desc}  ${l ? `${Math.round(l.width)}x${Math.round(l.height)}` : ''}`);
  }
  console.log(`layers: ${layers.size}`);
  console.log(rows.slice(0, 25).join('\n'));
  await browser.close();
})();
