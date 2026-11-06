import type { Random } from "./random";

/**
 * Knobs controlling the shape of the generated responses for one iteration.
 * Each iteration draws a new profile, so a run covers sparse and dense,
 * consistent and inconsistent, healthy and permission-restricted accounts.
 */
export interface FuzzProfile {
  /**
   * Probability that an optional structure member is present.
   */
  presence: number;
  /**
   * Probability that a list or map is empty.
   */
  emptyCollection: number;
  /**
   * Probability that a free-form string is empty.
   */
  emptyString: number;
  /**
   * Probability that an API call fails with a service exception (e.g. missing permissions).
   */
  errorRate: number;
  /**
   * When true, identifiers are drawn from small shared pools so that resources
   * reference each other, which exercises edge and parent resolution.
   */
  pooledIdentifiers: boolean;
}

export function randomProfile(random: Random): FuzzProfile {
  return {
    presence: random.pick([0, 0.15, 0.4, 0.7, 0.9, 1]),
    emptyCollection: random.pick([0, 0.2, 0.5]),
    emptyString: random.pick([0, 0, 0.05]),
    errorRate: random.pick([0, 0, 0.1, 0.4]),
    pooledIdentifiers: random.chance(0.5),
  };
}
