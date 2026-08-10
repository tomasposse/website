// Deterministic + PERIODIC noise. Everything is periodic with period P, so the
// toroidal world repeats seamlessly in every direction without any seam, snap,
// or reseeding as the camera flies.

export function hash2(x: number, z: number) {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

// Periodic 2D value noise: lattice indices wrap in the range [0, P).
export function valueNoiseP(x: number, z: number, P: number) {
  const xi = mod(Math.floor(x), P), zi = mod(Math.floor(z), P);
  const xf = x - Math.floor(x), zf = z - Math.floor(z);
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const x1 = mod(xi, P), x2 = mod(xi + 1, P), z1 = mod(zi, P), z2 = mod(zi + 1, P);
  const a = hash2(x1, z1), b = hash2(x2, z1), c = hash2(x1, z2), d = hash2(x2, z2);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function mod(n: number, m: number) { return ((n % m) + m) % m; }

// Periodic fBm (default period 60 cells).
export function fbm(x: number, z: number, octaves = 4, P = 60) {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoiseP(x * freq, z * freq, P * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

// xorshift PRNG so a location always regenerates identically.
export function seededRandom(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export function chunkSeed(cx: number, cz: number) {
  return (Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ 0x9e3779b9) >>> 0;
}
