/**
 * Timestamps whose absolute magnitude is below this bound are interpreted as
 * seconds since the Unix epoch rather than milliseconds, and scaled up.
 *
 * `1e11` milliseconds is 1973-03-03, whereas `1e11` seconds is the year 5138 —
 * so any numeric epoch below this bound is far more plausibly a seconds-
 * precision value than a millisecond one. Real-world timestamps sit well clear
 * of the boundary in both directions: the current era is ~1.7e9 in seconds and
 * ~1.7e12 in milliseconds.
 */
const SECONDS_EPOCH_UPPER_BOUND = 1e11;

/**
 * Coerces a numeric epoch into milliseconds, scaling up values that appear to
 * be expressed in seconds. Returns `null` for non-finite input.
 */
function epochToMillis(value: number): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.abs(value) < SECONDS_EPOCH_UPPER_BOUND ? value * 1000 : value;
}

/**
 * Builds a valid `Date` from an epoch in milliseconds, or `null` if the epoch
 * does not represent a valid date.
 */
function dateFromMillis(millis: number): Date | null {
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Attempts to coerce an arbitrary value into a valid `Date` instance.
 *
 * - A `Date` instance is returned as-is (when valid).
 * - A `number` is treated as a Unix epoch. Because `new Date(number)` always
 *   assumes milliseconds, seconds-precision values (e.g. `1700000000`) would
 *   otherwise resolve to 1970; they are detected by magnitude and scaled to
 *   milliseconds so the result is a valid epoch.
 * - A `string` is first parsed as a formatted date (ISO 8601, RFC, a bare year,
 *   etc.). If that fails but the string is purely numeric, it is treated as a
 *   Unix epoch with the same seconds-vs-milliseconds handling as a `number`.
 * - Anything else returns `null`.
 *
 * An input which cannot be parsed into a valid date (e.g. an unparseable
 * string, `NaN`, or an invalid `Date`) also returns `null`.
 *
 * @param input The value to coerce.
 * @returns A valid `Date` instance, or `null`.
 */
function tryParseDate(input: unknown): Date | null {
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }

  if (typeof input === "number") {
    const millis = epochToMillis(input);
    return millis != null ? dateFromMillis(millis) : null;
  }

  if (typeof input === "string") {
    const asFormattedDate = new Date(input);
    if (!Number.isNaN(asFormattedDate.getTime())) {
      return asFormattedDate;
    }

    // `new Date` cannot parse a bare numeric string (e.g. "1700000000"), so
    // fall back to treating it as a Unix epoch.
    const trimmed = input.trim();
    if (/^[+-]?\d+(\.\d+)?$/.test(trimmed)) {
      const millis = epochToMillis(Number(trimmed));
      return millis != null ? dateFromMillis(millis) : null;
    }

    return null;
  }

  return null;
}

/**
 * Attempts to normalize an arbitrary value into an ISO 8601 date string.
 *
 * - A `Date` instance is normalized via {@link Date.toISOString}.
 * - A `number` or `string` is first parsed into a `Date` instance (see
 *   {@link tryParseDate} for the seconds-vs-milliseconds epoch handling), then
 *   normalized via {@link Date.toISOString}.
 * - Anything else (or a value which cannot be parsed into a valid date)
 *   returns `null`.
 *
 * @param input The value to normalize.
 * @returns The ISO 8601 representation of the date, or `null`.
 */
export function tryNormalizeDateString(input: unknown): string | null {
  const date = tryParseDate(input);
  return date != null ? date.toISOString() : null;
}

/**
 * Attempts to normalize an arbitrary value into a numeric Unix epoch
 * timestamp, in milliseconds.
 *
 * - A `Date` instance is normalized via {@link Date.getTime}.
 * - A `number` or `string` is first parsed into a `Date` instance (see
 *   {@link tryParseDate} for the seconds-vs-milliseconds epoch handling), then
 *   normalized via {@link Date.getTime}. Seconds-precision epochs are scaled up
 *   so the returned value is always milliseconds relative to the Unix epoch.
 * - Anything else (or a value which cannot be parsed into a valid date)
 *   returns `null`.
 *
 * @param input The value to normalize.
 * @returns The epoch timestamp in milliseconds, or `null`.
 */
export function tryNormalizeDateEpoch(input: unknown): number | null {
  const date = tryParseDate(input);
  return date != null ? date.getTime() : null;
}
