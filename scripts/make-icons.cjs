// Generates every icon / splash / store graphic from one vector design.
// Dev-only (needs Playwright + Chromium): `npm run icons`
const fs = require('node:fs');
const path = require('node:path');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}

const ROOT = path.join(__dirname, '..');
const RES = path.join(ROOT, 'android/app/src/main/res');
const font = (f) => fs.readFileSync(path.join(ROOT, 'assets/fonts', f)).toString('base64');
const FONTS = `
@font-face{font-family:SG;font-weight:700;src:url(data:font/woff2;base64,${font('space-grotesk-latin-700-normal.woff2')}) format('woff2')}
@font-face{font-family:SG;font-weight:500;src:url(data:font/woff2;base64,${font('space-grotesk-latin-500-normal.woff2')}) format('woff2')}`;

// The neuron mark (same paths as the in-game logo), in a 64×64 box.
const MARK = (stroke = 'url(#g)', fill = 'url(#g)', sw = 3.2) => `
  <g fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 46 L24 30 L40 38 L54 16"/><path d="M24 30 L30 12 M40 38 L46 54"/>
  </g>
  <g fill="${fill}">
    <circle cx="10" cy="46" r="5.2"/><circle cx="24" cy="30" r="5.8"/><circle cx="40" cy="38" r="5.2"/>
    <circle cx="54" cy="16" r="5.8"/><circle cx="30" cy="12" r="3.6"/><circle cx="46" cy="54" r="3.6"/>
  </g>`;
const DEFS = `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff4fd8"/><stop offset=".5" stop-color="#b07bff"/><stop offset="1" stop-color="#2ee6ff"/></linearGradient>
    <radialGradient id="bg" cx="50%" cy="38%" r="78%"><stop offset="0" stop-color="#2a1a6e"/><stop offset=".5" stop-color="#0c0e2a"/><stop offset="1" stop-color="#05060f"/></radialGradient>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#b07bff" stop-opacity=".55"/><stop offset="1" stop-color="#b07bff" stop-opacity="0"/></radialGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>`;

/** Mark centred in a W×H canvas, spanning `span` px. */
const markAt = (W, H, span, opts = {}) => {
  const s = span / 54;
  return `<g transform="translate(${W / 2} ${H / 2}) scale(${s}) translate(-32 -33)" filter="${opts.glow === false ? '' : 'url(#glow)'}">${MARK(opts.stroke, opts.fill)}</g>`;
};

const svg = (W, H, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${DEFS}${body}</svg>`;

const fullIcon = (S, markScale = 0.62, rounded = 0) => svg(S, S, `
  <rect width="${S}" height="${S}" rx="${rounded}" fill="url(#bg)"/>
  <circle cx="${S / 2}" cy="${S / 2}" r="${S * 0.42}" fill="url(#halo)"/>
  <circle cx="${S / 2}" cy="${S / 2}" r="${S * 0.4}" fill="none" stroke="url(#g)" stroke-opacity=".28" stroke-width="${S * 0.012}"/>
  ${markAt(S, S, S * markScale)}`);

const roundIcon = (S) => svg(S, S, `
  <clipPath id="c"><circle cx="${S / 2}" cy="${S / 2}" r="${S / 2}"/></clipPath>
  <g clip-path="url(#c)"><rect width="${S}" height="${S}" fill="url(#bg)"/><circle cx="${S / 2}" cy="${S / 2}" r="${S * 0.42}" fill="url(#halo)"/></g>
  ${markAt(S, S, S * 0.56)}`);

// Adaptive icon layers: 108dp canvas, safe zone ≈ 66dp.
const foreground = (S) => svg(S, S, markAt(S, S, S * 0.5));
const monochrome = (S) => svg(S, S, markAt(S, S, S * 0.5, { stroke: '#fff', fill: '#fff', glow: false }));

const splash = (W, H) => {
  const m = Math.min(W, H);
  return svg(W, H, `
    <rect width="${W}" height="${H}" fill="#05060f"/>
    <circle cx="${W / 2}" cy="${H / 2 - m * 0.06}" r="${m * 0.42}" fill="url(#halo)" opacity=".7"/>
    ${markAt(W, H - m * 0.12, m * 0.26)}
    <text x="${W / 2}" y="${H / 2 + m * 0.2}" text-anchor="middle" font-family="SG" font-weight="700" font-size="${m * 0.085}" letter-spacing="${m * 0.012}" fill="url(#g)">SYNAPSE</text>`);
};

const feature = (W = 1024, H = 500) => {
  // decorative neural network
  let net = '';
  const pts = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 46; i++) pts.push([rnd() * W, rnd() * H]);
  const cols = ['#b07bff', '#2ee6ff', '#ff4fd8', '#ffc53d', '#34f5c5'];
  pts.forEach((a, i) => pts.slice(i + 1).forEach((b) => {
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (d < 150) net += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#96a5ff" stroke-opacity="${(0.28 * (1 - d / 150)).toFixed(2)}"/>`;
  }));
  pts.forEach((p, i) => (net += `<circle cx="${p[0]}" cy="${p[1]}" r="${2 + (i % 3)}" fill="${cols[i % cols.length]}" opacity=".85"/>`));
  return svg(W, H, `
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    ${net}
    <rect width="${W}" height="${H}" fill="#05060f" opacity=".35"/>
    <circle cx="${W / 2}" cy="${H / 2}" r="230" fill="url(#halo)"/>
    <g transform="translate(-292 -18)">${markAt(W, H, 128)}</g>
    <text x="${W / 2 + 78}" y="${H / 2 + 20}" text-anchor="middle" font-family="SG" font-weight="700" font-size="96" letter-spacing="9" fill="url(#g)">SYNAPSE</text>
    <text x="${W / 2}" y="${H / 2 + 112}" text-anchor="middle" font-family="SG" font-weight="500" font-size="28" letter-spacing="9" fill="#c9cff5">THE GAME LEARNS HOW YOU PLAY</text>`);
};

async function render(page, markup, file, W, H, transparent = false) {
  await page.setViewportSize({ width: W, height: H });
  await page.setContent(`<!doctype html><html><head><style>${FONTS}html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${markup}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, omitBackground: transparent, clip: { x: 0, y: 0, width: W, height: H } });
}

(async () => {
  const browser = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' } : {});
  const page = await browser.newPage();
  const out = [];
  const r = async (m, f, W, H, tr) => {
    await render(page, m, f, W, H, tr);
    out.push(path.relative(ROOT, f));
  };

  // Web / PWA
  await r(fullIcon(192), path.join(ROOT, 'assets/icons/icon-192.png'), 192, 192);
  await r(fullIcon(512), path.join(ROOT, 'assets/icons/icon-512.png'), 512, 512);
  await r(fullIcon(512, 0.46), path.join(ROOT, 'assets/icons/maskable-512.png'), 512, 512);
  // Play Store
  await r(fullIcon(512), path.join(ROOT, 'store/icon-512.png'), 512, 512);
  await r(feature(), path.join(ROOT, 'store/feature-graphic.png'), 1024, 500);

  // Android launcher icons
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(dens)) {
    const legacy = Math.round(48 * k);
    const layer = Math.round(108 * k);
    await r(fullIcon(legacy, 0.62, legacy * 0.2), path.join(RES, `mipmap-${d}/ic_launcher.png`), legacy, legacy, true);
    await r(roundIcon(legacy), path.join(RES, `mipmap-${d}/ic_launcher_round.png`), legacy, legacy, true);
    await r(foreground(layer), path.join(RES, `mipmap-${d}/ic_launcher_foreground.png`), layer, layer, true);
    await r(monochrome(layer), path.join(RES, `mipmap-${d}/ic_launcher_monochrome.png`), layer, layer, true);
  }

  // Splash screens (same sizes as the Capacitor template)
  const splashes = {
    drawable: [480, 320],
    'drawable-land-mdpi': [480, 320], 'drawable-land-hdpi': [800, 480], 'drawable-land-xhdpi': [1280, 720],
    'drawable-land-xxhdpi': [1600, 960], 'drawable-land-xxxhdpi': [1920, 1280],
    'drawable-port-mdpi': [320, 480], 'drawable-port-hdpi': [480, 800], 'drawable-port-xhdpi': [720, 1280],
    'drawable-port-xxhdpi': [960, 1600], 'drawable-port-xxxhdpi': [1280, 1920],
  };
  for (const [dir, [W, H]] of Object.entries(splashes)) await r(splash(W, H), path.join(RES, dir, 'splash.png'), W, H);

  await browser.close();
  console.log(`Generated ${out.length} images`);
})();
