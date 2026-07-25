---
"@infrascan/shared-types": minor
---

Add a `Serialized<T>` lifecycle type that models the JSON persistence round-trip scanner state undergoes, collapsing `Date` fields to the ISO `string` they deserialize as. It is applied at the entity boundary (`getState`, `translate`, and `components`), so entity ETLs see timestamp fields with their true post-rehydration type. This turns the class of "`someDate?.toISOString()` on a value that is actually a string" runtime crashes into compile errors.

`Audit.createdAt` is now typed `number | null` (previously `string | Date`) to match the numeric millisecond epoch the ETLs now produce.

Note for scanner authors: this makes the compiler flag every ETL site that treats a persisted `Date` field as a live `Date`. Those sites should be updated to normalize the value (e.g. via the `tryNormalizeDateString`/`tryNormalizeDateEpoch` helpers in `@infrascan/core`).
