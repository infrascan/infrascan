/**
 * Models the lifecycle transform that a value undergoes when scanner state is
 * persisted and rehydrated.
 *
 * State is written to storage with `JSON.stringify` and read back with a bare
 * `JSON.parse` (no date reviver) by the connectors. As a result, any value the
 * AWS SDK types as a `Date` is actually an ISO 8601 **string** by the time an
 * entity ETL runs against the rehydrated state — while the declared type still
 * claims `Date`.
 *
 * `Serialized<T>` mirrors that transform at the type level: a `Date` becomes the
 * `string` it serializes to, recursing through arrays and object properties.
 * Optionality is preserved, so `CreateTime?: Date` becomes `CreateTime?: string`
 * and a `Date | undefined` union becomes `string | undefined`.
 *
 * Applying this at the entity boundary turns the reported runtime crash
 * (`someDate?.toISOString()` on a value that is really a string) into a compile
 * error, since `string` has no `toISOString` method.
 *
 * Scope: this intentionally only models the `Date -> string` collapse, which is
 * the transform that affects scanner state. It is not a general-purpose
 * `Jsonify` — it does not drop function/`undefined`-valued properties, honour
 * arbitrary `toJSON` implementations, or collapse `Map`/`Set`, none of which
 * appear in the state shapes it is applied to.
 */
export type Serialized<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Serialized<U>[]
    : T extends readonly (infer U)[]
      ? readonly Serialized<U>[]
      : T extends object
        ? { [K in keyof T]: Serialized<T[K]> }
        : T;
