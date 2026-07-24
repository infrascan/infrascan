---
"@infrascan/core": minor
---

Add `tryNormalizeDateString`, a utility for normalizing an unknown value into an ISO 8601 date string. It accepts `Date` instances, numbers, and strings, and returns `null` for any value that cannot be parsed into a valid date.
