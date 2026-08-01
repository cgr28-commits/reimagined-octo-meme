/** Mulberry32 — small deterministic PRNG from a numeric seed. */
export function createSeededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromDate(date = new Date()) {
  const iso = date.toISOString().slice(0, 10);
  let hash = 2166136261;
  for (const char of iso) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function sampleRoutes(routes, count, seed) {
  const random = createSeededRandom(seed);
  const copy = [...routes];

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy.slice(0, Math.min(count, copy.length));
}
