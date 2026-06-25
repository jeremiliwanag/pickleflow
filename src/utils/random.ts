// ============================================
// SEEDED PSEUDO-RANDOM NUMBER GENERATOR
// Used for tiebreaking in the scheduler
// Same seed = same result every time (reproducible)
// ============================================

export function mulberry32(seed: number) {
  return function (): number {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Generate a seed from current timestamp
export function generateSeed(): number {
  return Date.now();
}

// Pick a random item from an array using seeded random
export function seededPick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

// Shuffle array using seeded random (Fisher-Yates)
export function seededShuffle<T>(arr: T[], rng: () => number): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}