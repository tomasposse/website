export const WORDS = ["design", "is", "how", "it", "works"];

export type Swatch = { bg: string; fg: string };

export const SWATCHES: Swatch[] = [
  { bg: "#0a0a0a", fg: "#ffffff" },
  { bg: "#ff2e20", fg: "#0a0a0a" },
  { bg: "#f0c2f7", fg: "#0a0a0a" },
  { bg: "#22e58b", fg: "#0a0a0a" },
  { bg: "#7c4dff", fg: "#ffffff" },
  { bg: "#ffe14d", fg: "#0a0a0a" },
  { bg: "#18b6ff", fg: "#0a0a0a" },
  { bg: "#ff7a1a", fg: "#0a0a0a" },
  { bg: "#ff4fa3", fg: "#0a0a0a" },
];

export function randomSwatch(exclude?: Swatch): Swatch {
  if (SWATCHES.length < 2 || !exclude) {
    return SWATCHES[(Math.random() * SWATCHES.length) | 0];
  }
  let s = exclude;
  while (s === exclude) s = SWATCHES[(Math.random() * SWATCHES.length) | 0];
  return s;
}

export function randomSwatchAvoiding(used: Swatch[]): Swatch {
  const free = SWATCHES.filter((s) => !used.includes(s));
  const pool = free.length > 0 ? free : SWATCHES;
  return pool[(Math.random() * pool.length) | 0];
}

export const INITIAL: Swatch[] = [
  SWATCHES[0],
  SWATCHES[1],
  SWATCHES[2],
  SWATCHES[3],
  SWATCHES[4],
];

/**
 * Active palette for a given variation (0..1).
 * 1 = full clash (all swatches), lower = fewer, calmer colors.
 */
export function paletteFor(variation: number): Swatch[] {
  const v = Math.max(0, Math.min(1, variation));
  // Always 2 minimum (dark + one colour); spread the rest evenly.
  const count = Math.max(2, Math.round((SWATCHES.length - 1) * v) + 1);
  const indices = new Set<number>([0]); // keep the dark swatch
  for (let i = 0; i < count - 1; i++) {
    indices.add(1 + Math.round((i * (SWATCHES.length - 1)) / Math.max(1, count - 1)));
  }
  return [...indices].sort((a, b) => a - b).map((i) => SWATCHES[i]);
}
