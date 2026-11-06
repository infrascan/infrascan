/**
 * Seeded pseudo-random number generator.
 *
 * Uses the Park–Miller "minimal standard" Lehmer generator: each step is
 * `state = state * 48271 mod (2^31 - 1)`. The largest intermediate product is
 * below 2^47, so plain floating point arithmetic is exact and no bitwise
 * tricks are needed. It is not cryptographically secure, it only needs to be
 * fast and reproducible from a seed.
 */
const MODULUS = 2147483647; // 2^31 - 1, prime
const MULTIPLIER = 48271;

/**
 * Map an arbitrary integer onto the generator's valid state range [1, MODULUS - 1].
 */
export function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) {
    throw new RangeError(`Seed must be a finite number, received ${seed}`);
  }
  const wrapped = ((Math.trunc(seed) % MODULUS) + MODULUS) % MODULUS;
  return wrapped === 0 ? 1 : wrapped;
}

/**
 * Derive an independent seed for one iteration of a run, so any iteration can be
 * replayed on its own given the run's seed.
 */
export function deriveSeed(baseSeed: number, iteration: number): number {
  // Two distinct primes keep neighbouring (seed, iteration) pairs well apart.
  return normalizeSeed(
    normalizeSeed(baseSeed) * 7919 + (iteration + 1) * 104729,
  );
}

export class Random {
  private state: number;

  constructor(seed: number) {
    this.state = normalizeSeed(seed);
    // Discard the first output, which is strongly correlated with small seeds.
    this.next();
  }

  /**
   * A float in the range [0, 1).
   */
  next(): number {
    this.state = (this.state * MULTIPLIER) % MODULUS;
    return (this.state - 1) / (MODULUS - 1);
  }

  /**
   * An integer in the range [0, max).
   */
  int(max: number): number {
    return Math.floor(this.next() * max);
  }

  /**
   * True with the given probability.
   */
  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(values: readonly T[]): T {
    if (values.length === 0) {
      throw new RangeError("Cannot pick from an empty list");
    }
    return values[this.int(values.length)];
  }

  /**
   * A short lowercase alphanumeric token, for building identifiers.
   */
  token(length = 8): string {
    const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
    let out = "";
    for (let i = 0; i < length; i += 1) {
      out += alphabet[this.int(alphabet.length)];
    }
    return out;
  }
}
