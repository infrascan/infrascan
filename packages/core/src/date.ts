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
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input.toISOString();
  }

  if (typeof input === "number" || typeof input === "string") {
    const parsed = new Date(input);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  return null;
}
