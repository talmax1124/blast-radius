/**
 * Seeded draws for the game simulator. Every run with the same seed plays the same million games,
 * so a ticket can be re-priced and compared without the noise of a new sample.
 */

export type Rng = {
  /** Uniform on [0, 1). */
  next: () => number;
  normal: () => number;
  gamma: (shape: number, scale: number) => number;
  poisson: (lambda: number) => number;
  binomial: (n: number, p: number) => number;
  /** Count with extra spread. `dispersion` is the gamma shape: lower is wilder, Infinity is plain Poisson. */
  negBinomial: (mean: number, dispersion: number) => number;
  /** Positive draw with this mean and coefficient of variation. */
  lognormal: (mean: number, cv: number) => number;
};

/** xoshiro128** seeded through splitmix32. Fast, 2^128 period, and good enough for a million games. */
export function makeRng(seed = 7): Rng {
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  let s3 = 0;
  let x = seed >>> 0;
  const split = () => {
    x = (x + 0x9e3779b9) >>> 0;
    let z = x;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  s0 = split();
  s1 = split();
  s2 = split();
  s3 = split();
  const next = () => {
    const result = Math.imul(rotl(Math.imul(s1, 5), 7), 9) >>> 0;
    const t = s1 << 9;
    s2 ^= s0;
    s3 ^= s1;
    s1 ^= s2;
    s0 ^= s3;
    s2 ^= t;
    s3 = rotl(s3, 11);
    return result / 4294967296;
  };

  let spare: number | null = null;
  const normal = () => {
    if (spare != null) {
      const v = spare;
      spare = null;
      return v;
    }
    let u = 0;
    let v = 0;
    let r = 0;
    do {
      u = next() * 2 - 1;
      v = next() * 2 - 1;
      r = u * u + v * v;
    } while (r >= 1 || r === 0);
    const f = Math.sqrt((-2 * Math.log(r)) / r);
    spare = v * f;
    return u * f;
  };

  // Marsaglia and Tsang. Shapes under 1 are boosted by a uniform power.
  const gamma = (shape: number, scale: number): number => {
    if (!(shape > 0) || !(scale > 0)) return 0;
    if (shape < 1) return gamma(shape + 1, scale) * Math.pow(next() || 1e-12, 1 / shape);
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let z = 0;
      let v = 0;
      do {
        z = normal();
        v = 1 + c * z;
      } while (v <= 0);
      v = v * v * v;
      const u = next();
      if (u < 1 - 0.0331 * z ** 4 || Math.log(u) < 0.5 * z * z + d * (1 - v + Math.log(v))) return d * v * scale;
    }
  };

  const poisson = (lambda: number): number => {
    if (!(lambda > 0)) return 0;
    if (lambda < 30) {
      const limit = Math.exp(-lambda);
      let k = 0;
      let p = next();
      while (p > limit) {
        k += 1;
        p *= next();
      }
      return k;
    }
    // Large means: normal with a continuity correction. Error is well under a tenth of a count.
    return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normal()));
  };

  const binomial = (n: number, p: number): number => {
    if (n <= 0 || !(p > 0)) return 0;
    if (p >= 1) return n;
    if (n * p < 12 || n * (1 - p) < 12) {
      // Waiting times between successes. Cost grows with the number of successes, not with n.
      const flip = p > 0.5;
      const q = flip ? 1 - p : p;
      const logq = Math.log(1 - q);
      let k = 0;
      let i = 0;
      for (;;) {
        i += Math.floor(Math.log(next() || 1e-12) / logq) + 1;
        if (i > n) break;
        k += 1;
      }
      return flip ? n - k : k;
    }
    const mean = n * p;
    const sd = Math.sqrt(mean * (1 - p));
    return Math.min(n, Math.max(0, Math.round(mean + sd * normal())));
  };

  const negBinomial = (mean: number, dispersion: number): number => {
    if (!(mean > 0)) return 0;
    if (!Number.isFinite(dispersion)) return poisson(mean);
    return poisson(gamma(dispersion, mean / dispersion));
  };

  const lognormal = (mean: number, cv: number): number => {
    if (!(mean > 0)) return 0;
    const s2 = Math.log(1 + cv * cv);
    return Math.exp(Math.log(mean) - s2 / 2 + Math.sqrt(s2) * normal());
  };

  return { next, normal, gamma, poisson, binomial, negBinomial, lognormal };
}

function rotl(v: number, k: number): number {
  return ((v << k) | (v >>> (32 - k))) >>> 0;
}
