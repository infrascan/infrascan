import t from "tap";
import { tryNormalizeDateString } from "./date";

t.test("normalizes a Date instance via toISOString", (tap) => {
  const date = new Date("2026-07-24T12:34:56.000Z");
  tap.equal(tryNormalizeDateString(date), "2026-07-24T12:34:56.000Z");
  tap.end();
});

t.test("normalizes a numeric epoch timestamp", (tap) => {
  const epochMillis = Date.UTC(2026, 6, 24, 12, 34, 56);
  tap.equal(
    tryNormalizeDateString(epochMillis),
    new Date(epochMillis).toISOString(),
  );
  tap.end();
});

t.test("normalizes a parseable date string", (tap) => {
  tap.equal(
    tryNormalizeDateString("2026-07-24T12:34:56.000Z"),
    "2026-07-24T12:34:56.000Z",
  );
  tap.end();
});

t.test("returns null for an invalid date string", (tap) => {
  tap.equal(tryNormalizeDateString("not a date"), null);
  tap.end();
});

t.test("returns null for an invalid Date instance", (tap) => {
  tap.equal(tryNormalizeDateString(new Date(NaN)), null);
  tap.end();
});

t.test("returns null for NaN", (tap) => {
  tap.equal(tryNormalizeDateString(NaN), null);
  tap.end();
});

t.test("returns null for non-date, non-number, non-string inputs", (tap) => {
  tap.equal(tryNormalizeDateString(null), null);
  tap.equal(tryNormalizeDateString(undefined), null);
  tap.equal(tryNormalizeDateString({}), null);
  tap.equal(tryNormalizeDateString([]), null);
  tap.equal(tryNormalizeDateString(true), null);
  tap.end();
});
