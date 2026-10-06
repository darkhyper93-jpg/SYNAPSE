// The eight cognitive skills SYNAPSE tracks. Colours drive the whole UI identity.

export const SKILLS = {
  memory: { id: 'memory', color: '#b07bff', glow: 'rgba(176,123,255,.55)', icon: 'M' },
  perception: { id: 'perception', color: '#2ee6ff', glow: 'rgba(46,230,255,.55)', icon: 'P' },
  logic: { id: 'logic', color: '#ffc53d', glow: 'rgba(255,197,61,.55)', icon: 'L' },
  reaction: { id: 'reaction', color: '#ff5470', glow: 'rgba(255,84,112,.55)', icon: 'R' },
  attention: { id: 'attention', color: '#9dff4a', glow: 'rgba(157,255,74,.5)', icon: 'A' },
  spatial: { id: 'spatial', color: '#4d8dff', glow: 'rgba(77,141,255,.55)', icon: 'S' },
  decision: { id: 'decision', color: '#ff4fd8', glow: 'rgba(255,79,216,.55)', icon: 'D' },
  flexibility: { id: 'flexibility', color: '#34f5c5', glow: 'rgba(52,245,197,.5)', icon: 'F' },
};

export const SKILL_IDS = Object.keys(SKILLS);

// MVP core skills: first session guarantees these appear early.
export const CORE_SKILLS = ['memory', 'perception', 'logic', 'reaction'];

// Mastery: earned only through demonstrated performance (rating), never by grinding.
export const MASTERY = [
  { level: 1, min: 0, key: 'beginner' },
  { level: 2, min: 20, key: 'intermediate' },
  { level: 3, min: 40, key: 'advanced' },
  { level: 4, min: 60, key: 'expert' },
  { level: 5, min: 80, key: 'elite' },
];

export function masteryFor(rating = 0) {
  let m = MASTERY[0];
  for (const lvl of MASTERY) if (rating >= lvl.min) m = lvl;
  const next = MASTERY[m.level] || null;
  const progress = next ? (rating - m.min) / (next.min - m.min) : 1;
  return { ...m, next, progress: Math.max(0, Math.min(1, progress)) };
}
