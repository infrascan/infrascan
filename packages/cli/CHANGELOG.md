# @infrascan/cli

## 0.7.0

### Minor Changes

- [#123](https://github.com/infrascan/infrascan/pull/123) [`d05dc6ffe36f6b219964407b63b002520cf89795`](https://github.com/infrascan/infrascan/commit/d05dc6ffe36f6b219964407b63b002520cf89795) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Introduce informational node support

### Patch Changes

- Updated dependencies [[`d05dc6ffe36f6b219964407b63b002520cf89795`](https://github.com/infrascan/infrascan/commit/d05dc6ffe36f6b219964407b63b002520cf89795)]:
  - @infrascan/informational-serializer@0.2.0
  - @infrascan/sdk@0.6.0
  - @infrascan/cytoscape-serializer@0.3.4
  - @infrascan/aws@0.5.4

## 0.6.0

### Minor Changes

- [#89](https://github.com/infrascan/infrascan/pull/89) [`913867b73a72791c79a69ebfec8bf94331654c1d`](https://github.com/infrascan/infrascan/commit/913867b73a72791c79a69ebfec8bf94331654c1d) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Update CLI to use new scanners, adopting breaking change in graph output

### Patch Changes

- Updated dependencies [[`913867b73a72791c79a69ebfec8bf94331654c1d`](https://github.com/infrascan/infrascan/commit/913867b73a72791c79a69ebfec8bf94331654c1d)]:
  - @infrascan/cytoscape-serializer@0.3.0
  - @infrascan/fs-connector@0.3.0
  - @infrascan/aws@0.5.0
  - @infrascan/sdk@0.5.0

## 0.5.0

### Minor Changes

- [#86](https://github.com/infrascan/infrascan/pull/86) [`d3110c2`](https://github.com/infrascan/infrascan/commit/d3110c2197be872ca72667aad552f33dead5271c) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Introduce render command to make it easier to open generated graphs in the browser.

### Patch Changes

- [#84](https://github.com/infrascan/infrascan/pull/84) [`437026c`](https://github.com/infrascan/infrascan/commit/437026cc278ec4b380bcaf3a7a675f3762ce3bea) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Bump aws client sdk versions to remove vulnerable dependency

- Updated dependencies [[`d3110c2`](https://github.com/infrascan/infrascan/commit/d3110c2197be872ca72667aad552f33dead5271c), [`437026c`](https://github.com/infrascan/infrascan/commit/437026cc278ec4b380bcaf3a7a675f3762ce3bea)]:
  - @infrascan/sdk@0.4.2
  - @infrascan/cytoscape-serializer@0.2.1

## 0.4.0

### Minor Changes

- [#77](https://github.com/infrascan/infrascan/pull/77) [`21d4ecf`](https://github.com/infrascan/infrascan/commit/21d4ecf4b7fec31f4ac7b2cc5857aa5d2b725075) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Migrate all packages to consume new graph model

### Patch Changes

- Updated dependencies [[`21d4ecf`](https://github.com/infrascan/infrascan/commit/21d4ecf4b7fec31f4ac7b2cc5857aa5d2b725075), [`21d4ecf`](https://github.com/infrascan/infrascan/commit/21d4ecf4b7fec31f4ac7b2cc5857aa5d2b725075)]:
  - @infrascan/cytoscape-serializer@0.2.0
  - @infrascan/sdk@0.4.0
  - @infrascan/aws@0.4.1

## 0.3.1

### Patch Changes

- Updated dependencies [[`1efd3c4`](https://github.com/infrascan/infrascan/commit/1efd3c40e42f824dab57e91269a1cfe83262d27e)]:
  - @infrascan/aws@0.4.0

## 0.3.0

### Minor Changes

- [#52](https://github.com/infrascan/infrascan/pull/52) [`9a82eb5`](https://github.com/infrascan/infrascan/commit/9a82eb5033c64478a4bf379b4e0a6c42767c84e6) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Add support for using the default node credential provider chain when no config given, expose region flag to filter regions to scan

### Patch Changes

- Updated dependencies [[`9a82eb5`](https://github.com/infrascan/infrascan/commit/9a82eb5033c64478a4bf379b4e0a6c42767c84e6)]:
  - @infrascan/sdk@0.3.1

## 0.2.4

### Patch Changes

- [#50](https://github.com/infrascan/infrascan/pull/50) [`dd0ebfe`](https://github.com/infrascan/infrascan/commit/dd0ebfe60b09335cf9ffecc6045b8aff18029d6e) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Update `@infrascan/sdk` dependency to use new credential provider factories. Add dependency on `@smithy/shared-ini-file-loader` to override the default region in `@infrascan/sdk` when there is a local default region set.

- Updated dependencies [[`dd0ebfe`](https://github.com/infrascan/infrascan/commit/dd0ebfe60b09335cf9ffecc6045b8aff18029d6e)]:
  - @infrascan/sdk@0.3.0

## 0.2.3

### Patch Changes

- Updated dependencies [[`4e230a8`](https://github.com/infrascan/infrascan/commit/4e230a8ff973aaabd1fe621262b0bf67dc982156)]:
  - @infrascan/aws@0.3.0

## 0.2.2

### Patch Changes

- [#41](https://github.com/infrascan/infrascan/pull/41) [`c84fa87`](https://github.com/infrascan/infrascan/commit/c84fa87fa66fef97533ea597f431c8fe135cf1b2) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Update documentation and add missing keywords to package.json

- Updated dependencies [[`c84fa87`](https://github.com/infrascan/infrascan/commit/c84fa87fa66fef97533ea597f431c8fe135cf1b2)]:
  - @infrascan/fs-connector@0.2.2
  - @infrascan/aws@0.2.1
  - @infrascan/sdk@0.2.2

## 0.2.1

### Patch Changes

- [#39](https://github.com/infrascan/infrascan/pull/39) [`36cccd6`](https://github.com/infrascan/infrascan/commit/36cccd6b2d87d3969ae1cf9b9a354f6e1b43f757) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Update CLI bin name to infrascan

## 0.2.0

### Minor Changes

- 7d71a0e: Restructure the project into per service scanner modules. Each module must be registered with the SDK for the service to be scanned and graphed.

  The initial implementation for Infrascan used a single config file which defined the scanning approach for every service, and their graph structure. It very quickly became difficult to debug, and reason about. The core logic was also completely untestable in any sane way.

  This release is a rewrite of the entire project. The SDK by default will do nothing. Each individual service's scanner has to be registered into an instance of the SDK for it to be scanned or graphed. This reduces the SDK complexity massively, as it only needs to step through the registered services and call into their APIs.

### Patch Changes

- Updated dependencies [7d71a0e]
  - @infrascan/fs-connector@0.2.0
  - @infrascan/aws@0.2.0
  - @infrascan/sdk@0.2.0
