import t from "tap";
import { tryNormalizeDateString, tryNormalizeDateEpoch } from "./date";

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

t.test(
  "tryNormalizeDateEpoch: normalizes a Date instance via getTime",
  (tap) => {
    const date = new Date("2026-07-24T12:34:56.000Z");
    tap.equal(tryNormalizeDateEpoch(date), date.getTime());
    tap.end();
  },
);

t.test(
  "tryNormalizeDateEpoch: passes through a numeric epoch timestamp",
  (tap) => {
    const epochMillis = Date.UTC(2026, 6, 24, 12, 34, 56);
    tap.equal(tryNormalizeDateEpoch(epochMillis), epochMillis);
    tap.end();
  },
);

t.test("tryNormalizeDateEpoch: normalizes a parseable date string", (tap) => {
  tap.equal(
    tryNormalizeDateEpoch("2026-07-24T12:34:56.000Z"),
    Date.UTC(2026, 6, 24, 12, 34, 56),
  );
  tap.end();
});

t.test(
  "tryNormalizeDateEpoch: returns null for an invalid date string",
  (tap) => {
    tap.equal(tryNormalizeDateEpoch("not a date"), null);
    tap.end();
  },
);

t.test(
  "tryNormalizeDateEpoch: returns null for an invalid Date instance",
  (tap) => {
    tap.equal(tryNormalizeDateEpoch(new Date(NaN)), null);
    tap.end();
  },
);

t.test("tryNormalizeDateEpoch: returns null for NaN", (tap) => {
  tap.equal(tryNormalizeDateEpoch(NaN), null);
  tap.end();
});

t.test(
  "tryNormalizeDateEpoch: returns null for non-date, non-number, non-string inputs",
  (tap) => {
    tap.equal(tryNormalizeDateEpoch(null), null);
    tap.equal(tryNormalizeDateEpoch(undefined), null);
    tap.equal(tryNormalizeDateEpoch({}), null);
    tap.equal(tryNormalizeDateEpoch([]), null);
    tap.equal(tryNormalizeDateEpoch(true), null);
    tap.end();
  },
);

// Seconds-vs-milliseconds epoch handling.
const SECONDS = 1700000000; // 2023-11-14T22:13:20Z
const MILLIS = SECONDS * 1000;

t.test(
  "tryNormalizeDateEpoch: scales a seconds-precision numeric epoch to milliseconds",
  (tap) => {
    tap.equal(tryNormalizeDateEpoch(SECONDS), MILLIS);
    tap.end();
  },
);

t.test(
  "tryNormalizeDateEpoch: keeps a millisecond-precision numeric epoch as-is",
  (tap) => {
    tap.equal(tryNormalizeDateEpoch(MILLIS), MILLIS);
    tap.end();
  },
);

t.test(
  "tryNormalizeDateEpoch: parses a seconds-precision numeric string as an epoch",
  (tap) => {
    tap.equal(tryNormalizeDateEpoch(`${SECONDS}`), MILLIS);
    tap.end();
  },
);

t.test(
  "tryNormalizeDateEpoch: parses a millisecond-precision numeric string as an epoch",
  (tap) => {
    tap.equal(tryNormalizeDateEpoch(`${MILLIS}`), MILLIS);
    tap.end();
  },
);

t.test(
  "tryNormalizeDateString: scales a seconds-precision numeric epoch to milliseconds",
  (tap) => {
    tap.equal(tryNormalizeDateString(SECONDS), new Date(MILLIS).toISOString());
    tap.end();
  },
);

t.test(
  "tryNormalizeDateString: treats a bare year string as a calendar year, not an epoch",
  (tap) => {
    // "2024" must parse as the year 2024, not epoch seconds (which would land
    // in 1970). This guards the numeric-string epoch fallback.
    tap.equal(tryNormalizeDateString("2024"), new Date("2024").toISOString());
    tap.end();
  },
);
