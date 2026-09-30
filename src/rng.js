// Seeded RNG (mulberry32). All gameplay randomness goes through this so a
// seed + the same inputs always replays identically. The generator state lives
// in a plain object ({ s }) so it serialises with the rest of the save.

export function makeRng(holder) {
  const next = () => {
    let t = (holder.s = (holder.s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    next,
    float: (a, b) => a + next() * (b - a),
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    sample(arr, n) {
      return rng.shuffle(arr).slice(0, n);
    },
    weighted(entries) {
      // entries: [[item, weight], ...]
      const total = entries.reduce((s, e) => s + e[1], 0);
      let r = next() * total;
      for (const [item, w] of entries) {
        if ((r -= w) < 0) return item;
      }
      return entries[entries.length - 1][0];
    },
  };
  return rng;
}

export function seedHolder(seed) {
  return { s: (seed >>> 0) ^ 0x9e3779b9 };
}

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
