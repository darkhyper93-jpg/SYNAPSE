// Shape + colour vocabulary shared by every challenge, rendered as inline SVG.

export const COLORS = {
  red: { hex: '#ff4d6d', family: 'warm' },
  orange: { hex: '#ff9f1c', family: 'warm' },
  yellow: { hex: '#ffe14d', family: 'yellow' },
  green: { hex: '#3dff7a', family: 'green' },
  cyan: { hex: '#2ee6ff', family: 'cool' },
  blue: { hex: '#4d7cff', family: 'cool' },
  violet: { hex: '#a35bff', family: 'purple' },
  pink: { hex: '#ff5cd6', family: 'purple' },
};
export const COLOR_IDS = Object.keys(COLORS);
// Highly distinct colours, used when difficulty does not allow similar hues.
export const DISTINCT_COLORS = ['red', 'blue', 'yellow', 'green', 'violet'];
// Colours that are hard to tell apart; only used at high difficulty.
export const SIMILAR_COLOR_SETS = [
  ['red', 'orange', 'pink'],
  ['blue', 'violet', 'cyan'],
  ['green', 'cyan', 'yellow'],
];

// family = visual family. Low difficulty never shows two shapes of the same family.
export const SHAPES = {
  circle: { family: 'round' },
  hexagon: { family: 'round' },
  octagon: { family: 'round' },
  square: { family: 'box' },
  squircle: { family: 'box' },
  diamond: { family: 'diamond' },
  triangle: { family: 'tri' },
  triangleDown: { family: 'tri' },
  star: { family: 'star' },
  star6: { family: 'star' },
  cross: { family: 'cross' },
  ring: { family: 'ring' },
};
export const SHAPE_IDS = Object.keys(SHAPES);
// One representative per family — clearly distinct symbols.
export const BASIC_SHAPES = ['circle', 'square', 'triangle', 'diamond', 'star', 'cross', 'ring', 'hexagon'];
export const SIMILAR_SHAPE_SETS = [
  ['circle', 'hexagon', 'octagon'],
  ['square', 'squircle', 'diamond'],
  ['triangle', 'triangleDown'],
  ['star', 'star6', 'cross'],
];

function polar(cx, cy, r, angleDeg) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function regular(n, r, offset = 0) {
  return Array.from({ length: n }, (_, i) => polar(50, 50, r, offset + (360 / n) * i))
    .map((p) => p.map((v) => v.toFixed(1)).join(','))
    .join(' ');
}
function starPts(n, r1, r2) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) pts.push(polar(50, 52, i % 2 ? r2 : r1, (180 / n) * i));
  return pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ');
}

const GEOMETRY = {
  circle: () => '<circle cx="50" cy="50" r="38"/>',
  ring: () => '<circle cx="50" cy="50" r="31" fill="none" stroke-width="15" data-ring="1"/>',
  square: () => '<rect x="15" y="15" width="70" height="70" rx="5"/>',
  squircle: () => '<rect x="14" y="14" width="72" height="72" rx="24"/>',
  diamond: () => '<polygon points="50,7 93,50 50,93 7,50"/>',
  triangle: () => '<polygon points="50,9 93,86 7,86"/>',
  triangleDown: () => '<polygon points="7,14 93,14 50,91"/>',
  hexagon: () => `<polygon points="${regular(6, 41, 30)}"/>`,
  octagon: () => `<polygon points="${regular(8, 41, 22.5)}"/>`,
  star: () => `<polygon points="${starPts(5, 45, 19)}"/>`,
  star6: () => `<polygon points="${starPts(6, 44, 24)}"/>`,
  cross: () => '<polygon points="37,10 63,10 63,37 90,37 90,63 63,63 63,90 37,90 37,63 10,63 10,37 37,37"/>',
};

/**
 * Inline SVG for a shape.
 * @param {string} shape
 * @param {string} color colour id or hex
 * @param {{glyph?: string, rotate?: number, cls?: string}} opts
 */
export function shapeSVG(shape, color, opts = {}) {
  const hex = COLORS[color]?.hex || color;
  const geom = (GEOMETRY[shape] || GEOMETRY.circle)();
  const ringStroke = geom.includes('data-ring') ? ` stroke="${hex}"` : ` fill="${hex}" stroke="rgba(255,255,255,.35)" stroke-width="2"`;
  const rot = opts.rotate ? ` transform="rotate(${opts.rotate} 50 50)"` : '';
  const glyph = opts.glyph
    ? `<text x="50" y="57" text-anchor="middle" font-size="24" font-weight="800" font-family="JetBrains Mono, monospace" fill="#05060f" stroke="rgba(255,255,255,.7)" stroke-width="0.6" paint-order="stroke">${opts.glyph}</text>`
    : '';
  return `<svg class="shape ${opts.cls || ''}" viewBox="0 0 100 100" aria-hidden="true" style="--c:${hex}"><g${ringStroke}${rot}>${geom}</g>${glyph}</svg>`;
}

/** A coloured chip used for colour answer buttons. */
export function colorChip(color) {
  const hex = COLORS[color]?.hex || color;
  return `<span class="color-chip" style="--c:${hex}"></span>`;
}

/** Pick `n` shapes respecting the fairness rule for the given difficulty. */
export function pickShapes(rng, n, difficulty, { allowSimilar = difficulty >= 0.6 } = {}) {
  if (!allowSimilar) {
    return rng.sample(BASIC_SHAPES, Math.min(n, BASIC_SHAPES.length));
  }
  // Mix a similar-looking group with others.
  const group = rng.pick(SIMILAR_SHAPE_SETS);
  const rest = rng.shuffle(SHAPE_IDS.filter((s) => !group.includes(s)));
  return rng.shuffle([...group, ...rest].slice(0, n));
}

export function pickColors(rng, n, difficulty, { allowSimilar = difficulty >= 0.65 } = {}) {
  if (!allowSimilar) {
    const base = n <= DISTINCT_COLORS.length ? DISTINCT_COLORS : COLOR_IDS;
    return rng.sample(base, Math.min(n, base.length));
  }
  const group = rng.pick(SIMILAR_COLOR_SETS);
  const rest = rng.shuffle(COLOR_IDS.filter((c) => !group.includes(c)));
  return rng.shuffle([...group, ...rest].slice(0, n));
}
