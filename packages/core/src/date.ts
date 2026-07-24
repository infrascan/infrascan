/**
 * Attempts to coerce an arbitrary value into a valid `Date` instance.
 *
 * - A `Date` instance is returned as-is (when valid).
 * - A `number` or `string` is passed to the `Date` constructor.
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

  if (typeof input === "number" || typeof input === "string") {
    const parsed = new Date(input);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

/**
 * Attempts to normalize an arbitrary value into an ISO 8601 date string.
 *
 * - A `Date` instance is normalized via {@link Date.toISOString}.
 * - A `number` or `string` is first parsed into a `Date` instance, then
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
 * - A `number` or `string` is first parsed into a `Date` instance, then
 *   normalized via {@link Date.getTime}.
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
