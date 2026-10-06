// Seeded pseudo-random generator (mulberry32) with helpers.
// Every generator receives an RNG so that Daily challenges are reproducible.

export function hashString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export class RNG {
  constructor(seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0) {
    this.state = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
  }

  next() {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  range(min, max) {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max] (inclusive). */
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  chance(p) {
    return this.next() < p;
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Weighted pick: items = [{ weight, ...}] or (arr, weightFn). */
  weighted(arr, weightFn = (x) => x.weight) {
    const total = arr.reduce((s, x) => s + Math.max(0, weightFn(x)), 0);
    if (total <= 0) return this.pick(arr);
    let r = this.next() * total;
    for (const x of arr) {
      r -= Math.max(0, weightFn(x));
      if (r <= 0) return x;
    }
    return arr[arr.length - 1];
  }

  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  sample(arr, n) {
    return this.shuffle(arr).slice(0, n);
  }

  /** Derive an independent child generator (advances this one; deterministic for seeded streams). */
  fork(label = '') {
    return new RNG(hashString(`${this.next()}:${label}`));
  }
}
