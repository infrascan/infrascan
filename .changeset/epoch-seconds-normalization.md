---
"@infrascan/core": minor
---

Make `tryNormalizeDateEpoch`/`tryNormalizeDateString` robust to seconds-precision epochs. `new Date(number)` always assumes milliseconds, so a seconds value like `1700000000` would resolve to 1970; such values are now detected by magnitude and scaled to milliseconds. Purely numeric strings (e.g. `"1700000000"`), which `new Date` cannot parse, are now also accepted as epochs, while formatted date strings — including bare years like `"2024"` — continue to parse as calendar dates. The returned epoch is therefore always valid relative to the Unix epoch in milliseconds.
