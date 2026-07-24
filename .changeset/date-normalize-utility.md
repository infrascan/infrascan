---
"@infrascan/core": minor
---

Add `tryNormalizeDateString` and `tryNormalizeDateEpoch`, utilities for normalizing an unknown value into an ISO 8601 date string or a numeric millisecond epoch respectively. Both accept `Date` instances, numbers, and strings, and return `null` for any value that cannot be parsed into a valid date.
