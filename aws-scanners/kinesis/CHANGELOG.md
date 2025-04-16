# @infrascan/aws-kinesis-scanner

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

## 0.1.2

### Patch Changes

- Updated dependencies [[`647a680`](https://github.com/infrascan/infrascan/commit/647a680af9efc08107a6f315a0d0aedb630559ec)]:
  - @infrascan/core@0.2.3

## 0.1.1

### Patch Changes

- [#56](https://github.com/infrascan/infrascan/pull/56) [`4b6911d`](https://github.com/infrascan/infrascan/commit/4b6911d07cfc846389c30317becdf63e95768386) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Update to include support scanner level retry strategies

## 0.1.0

### Minor Changes

- [#43](https://github.com/infrascan/infrascan/pull/43) [`c1184a4`](https://github.com/infrascan/infrascan/commit/c1184a4ed53aa0850321e2414e147a8606f7e837) Thanks [@lfarrel6](https://github.com/lfarrel6)! - First release - pull state from ListStreams and ListStreamCommands.
