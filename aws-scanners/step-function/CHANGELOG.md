# @infrascan/aws-step-function-scanner

## 0.5.0

### Minor Changes

- [#140](https://github.com/infrascan/infrascan/pull/140) [`165992be8b0f166577002c66d4079308b0bb236a`](https://github.com/infrascan/infrascan/commit/165992be8b0f166577002c66d4079308b0bb236a) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Upgrade @aws-sdk dependencies and standardize versions in pnpm catalog.

### Patch Changes

- [#138](https://github.com/infrascan/infrascan/pull/138) [`a0aa145035349b9a9a4e82013daedea3f7f45925`](https://github.com/infrascan/infrascan/commit/a0aa145035349b9a9a4e82013daedea3f7f45925) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Normalize timestamp fields in entity ETLs to a numeric millisecond epoch with `tryNormalizeDateEpoch`. With the `Serialized` lifecycle type now typing rehydrated state honestly (persisted `Date` fields are ISO strings at ETL time), these sites are updated to normalize at runtime rather than assume a live `Date` — a belt-and-suspenders pairing with the compile-time type, since TypeScript does not enforce types at runtime. This also fixes the graphing crash where `Date`-typed fields (e.g. ec2 launch template `CreateTime`, lambda `StartingPositionTimestamp`) had `toISOString()` called on what was actually a string. Timestamp node properties (`audit.createdAt`, dynamodb throughput/archive dates, lambda `startingPositionTimestamp`) are now numeric epochs; the sqs scanner already computed an epoch and now emits it as a number rather than a string.

- Updated dependencies [[`a0aa145035349b9a9a4e82013daedea3f7f45925`](https://github.com/infrascan/infrascan/commit/a0aa145035349b9a9a4e82013daedea3f7f45925), [`165992be8b0f166577002c66d4079308b0bb236a`](https://github.com/infrascan/infrascan/commit/165992be8b0f166577002c66d4079308b0bb236a)]:
  - @infrascan/core@0.7.0

## 0.4.1

### Patch Changes

- Updated dependencies [[`87e6cc3b6f3342902aeab7b3c6e1349865bd8be1`](https://github.com/infrascan/infrascan/commit/87e6cc3b6f3342902aeab7b3c6e1349865bd8be1)]:
  - @infrascan/core@0.6.0

## 0.4.0

### Minor Changes

- [#123](https://github.com/infrascan/infrascan/pull/123) [`d05dc6ffe36f6b219964407b63b002520cf89795`](https://github.com/infrascan/infrascan/commit/d05dc6ffe36f6b219964407b63b002520cf89795) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Introduce informational node support

## 0.3.3

### Patch Changes

- [#107](https://github.com/infrascan/infrascan/pull/107) [`4530ad2554c3b44c4fec85dfe3b2da10440593f6`](https://github.com/infrascan/infrascan/commit/4530ad2554c3b44c4fec85dfe3b2da10440593f6) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Expose types of state produced from graph scans

## 0.3.2

### Patch Changes

- [#96](https://github.com/infrascan/infrascan/pull/96) [`1049c14ce1aa7bde7224a42c27d0e04dac418cbe`](https://github.com/infrascan/infrascan/commit/1049c14ce1aa7bde7224a42c27d0e04dac418cbe) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Add default parent value to $graph attribute for all scanners to correctly nest under region/account

## 0.3.1

### Patch Changes

- [#93](https://github.com/infrascan/infrascan/pull/93) [`ea1ef2cd0bce9e2ebc839a1520a4a1f138273f00`](https://github.com/infrascan/infrascan/commit/ea1ef2cd0bce9e2ebc839a1520a4a1f138273f00) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Correct service name in selector

## 0.3.0

### Minor Changes

- [#89](https://github.com/infrascan/infrascan/pull/89) [`913867b73a72791c79a69ebfec8bf94331654c1d`](https://github.com/infrascan/infrascan/commit/913867b73a72791c79a69ebfec8bf94331654c1d) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Migrate graph output to a standard schema for easier search/filter

### Patch Changes

- Updated dependencies [[`913867b73a72791c79a69ebfec8bf94331654c1d`](https://github.com/infrascan/infrascan/commit/913867b73a72791c79a69ebfec8bf94331654c1d)]:
  - @infrascan/core@0.5.0

## 0.2.2

### Patch Changes

- [#86](https://github.com/infrascan/infrascan/pull/86) [`d3110c2`](https://github.com/infrascan/infrascan/commit/d3110c2197be872ca72667aad552f33dead5271c) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Add debug logging to scanner modules. Debug logs can be enabled using the DEBUG environment variable. Service specific logs are namespaced under the service key.

- [#84](https://github.com/infrascan/infrascan/pull/84) [`437026c`](https://github.com/infrascan/infrascan/commit/437026cc278ec4b380bcaf3a7a675f3762ce3bea) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Bump aws client sdk versions to remove vulnerable dependency

- Updated dependencies [[`d3110c2`](https://github.com/infrascan/infrascan/commit/d3110c2197be872ca72667aad552f33dead5271c), [`437026c`](https://github.com/infrascan/infrascan/commit/437026cc278ec4b380bcaf3a7a675f3762ce3bea)]:
  - @infrascan/core@0.4.1

## 0.2.1

### Patch Changes

- Updated dependencies [[`e28a6d9`](https://github.com/infrascan/infrascan/commit/e28a6d91eb36fa83e9a40a667eb39a15b2a45ccb)]:
  - @infrascan/core@0.4.0

## 0.2.0

### Minor Changes

- [#77](https://github.com/infrascan/infrascan/pull/77) [`21d4ecf`](https://github.com/infrascan/infrascan/commit/21d4ecf4b7fec31f4ac7b2cc5857aa5d2b725075) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Migrate all packages to consume new graph model

### Patch Changes

- Updated dependencies [[`21d4ecf`](https://github.com/infrascan/infrascan/commit/21d4ecf4b7fec31f4ac7b2cc5857aa5d2b725075)]:
  - @infrascan/core@0.3.0

## 0.1.0

### Minor Changes

- [#71](https://github.com/infrascan/infrascan/pull/71) [`38dd5d3`](https://github.com/infrascan/infrascan/commit/38dd5d3bb7de174dfda4830ae59befec622ad669) Thanks [@lfarrel6](https://github.com/lfarrel6)! - First release - introduce basic support for scanning step functions.
