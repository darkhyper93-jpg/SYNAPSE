// Lightweight SVG charts: radar (skills), line (evolution), sparkline.
import { SKILLS } from '../data/skills.js';

let gid = 0;

/** Radar chart. values: [{ id, label, value(0-100), color }] */
export function radarChart(values, { size = 320, showLabels = true, max = 100 } = {}) {
  const id = `rg${++gid}`;
  const n = values.length;
  const cx = size / 2;
  const cy = size / 2;
  const R = size * (showLabels ? 0.34 : 0.44);
  const pt = (i, r) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  };
  const ring = (k) => values.map((_, i) => pt(i, R * k).map((v) => v.toFixed(1)).join(',')).join(' ');
  const rings = [0.25, 0.5, 0.75, 1].map((k) => `<polygon points="${ring(k)}" class="radar-ring"/>`).join('');
  const axes = values.map((_, i) => {
    const [x, y] = pt(i, R);
    return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="radar-axis"/>`;
  }).join('');
  const poly = values.map((v, i) => pt(i, R * Math.max(0.04, Math.min(1, v.value / max))).map((x) => x.toFixed(1)).join(',')).join(' ');
  const dots = values.map((v, i) => {
    const [x, y] = pt(i, R * Math.max(0.04, Math.min(1, v.value / max)));
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${size / 70}" fill="${v.color}" class="radar-dot" style="--i:${i}"/>`;
  }).join('');
  const labels = showLabels
    ? values.map((v, i) => {
        const [x, y] = pt(i, R + size * 0.1);
        return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="radar-label" fill="${v.color}" text-anchor="middle" dominant-baseline="middle">${v.label}<tspan x="${x.toFixed(1)}" dy="1.25em" class="radar-val">${Math.round(v.value)}</tspan></text>`;
      }).join('')
    : '';
  const stops = values.map((v, i) => `<stop offset="${(i / Math.max(1, n - 1)) * 100}%" stop-color="${v.color}"/>`).join('');
  return `<svg class="radar" viewBox="0 0 ${size} ${size}" role="img">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient></defs>
    ${rings}${axes}
    <polygon points="${poly}" fill="url(#${id})" class="radar-shape"/>
    <polygon points="${poly}" fill="none" stroke="url(#${id})" class="radar-stroke"/>
    ${dots}${labels}
  </svg>`;
}

/** Smooth path through points (Catmull-Rom → Bezier). */
function smoothPath(pts) {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : '';
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

/**
 * Line chart. series: [{ label, color, values: number[] }]
 * opts: { width, height, min, max, format, invert (lower is better) }
 */
export function lineChart(series, { width = 560, height = 200, min, max, format = (v) => Math.round(v), xLabels = [] } = {}) {
  const all = series.flatMap((s) => s.values).filter((v) => v != null);
  if (!all.length) return '';
  const lo = min ?? Math.min(...all);
  const hi = max ?? Math.max(...all);
  const span = hi - lo || 1;
  const padL = 36;
  const padR = 12;
  const padT = 14;
  const padB = 24;
  const len = Math.max(...series.map((s) => s.values.length));
  const X = (i) => padL + (len <= 1 ? (width - padL - padR) / 2 : (i / (len - 1)) * (width - padL - padR));
  const Y = (v) => padT + (1 - (v - lo) / span) * (height - padT - padB);
  const grid = [0, 0.5, 1]
    .map((k) => {
      const v = lo + span * k;
      const y = Y(v);
      return `<line x1="${padL}" x2="${width - padR}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" class="chart-grid"/><text x="${padL - 6}" y="${y.toFixed(1)}" class="chart-tick" text-anchor="end" dominant-baseline="middle">${format(v)}</text>`;
    })
    .join('');
  const paths = series
    .map((s) => {
      const id = `lg${++gid}`;
      const pts = s.values.map((v, i) => (v == null ? null : [X(i), Y(v)])).filter(Boolean);
      if (!pts.length) return '';
      const line = smoothPath(pts);
      const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${height - padB} L${pts[0][0].toFixed(1)},${height - padB} Z`;
      const last = pts[pts.length - 1];
      return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${s.color}" stop-opacity=".35"/><stop offset="100%" stop-color="${s.color}" stop-opacity="0"/></linearGradient></defs>
        ${series.length === 1 ? `<path d="${area}" fill="url(#${id})"/>` : ''}
        <path d="${line}" fill="none" stroke="${s.color}" class="chart-line"/>
        ${pts.length <= 30 ? pts.map((p) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.6" fill="${s.color}" class="chart-dot"/>`).join('') : ''}
        <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="5" fill="${s.color}" class="chart-last"/>`;
    })
    .join('');
  const xl = xLabels.length
    ? `<text x="${padL}" y="${height - 6}" class="chart-tick">${xLabels[0]}</text><text x="${width - padR}" y="${height - 6}" class="chart-tick" text-anchor="end">${xLabels[1]}</text>`
    : '';
  return `<svg class="line-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img">${grid}${paths}${xl}</svg>`;
}

export function sparkline(values, color, { width = 120, height = 34 } = {}) {
  const v = values.filter((x) => x != null);
  if (v.length < 2) return `<svg class="spark" viewBox="0 0 ${width} ${height}"><line x1="0" x2="${width}" y1="${height / 2}" y2="${height / 2}" stroke="${color}" stroke-opacity=".3" stroke-dasharray="3 4"/></svg>`;
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const span = hi - lo || 1;
  const pts = v.map((x, i) => [2 + (i / (v.length - 1)) * (width - 4), 3 + (1 - (x - lo) / span) * (height - 6)]);
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${width} ${height}"><path d="${smoothPath(pts)}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/><circle cx="${last[0]}" cy="${last[1]}" r="3" fill="${color}"/></svg>`;
}

export const skillColor = (id) => SKILLS[id]?.color || '#fff';
