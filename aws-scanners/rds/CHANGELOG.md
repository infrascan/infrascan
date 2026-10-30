# @infrascan/aws-rds-scanner

## 0.7.1

### Patch Changes

- [#150](https://github.com/infrascan/infrascan/pull/150) [`903011adc4e3537d903e7b46ad1e84cb20912a9d`](https://github.com/infrascan/infrascan/commit/903011adc4e3537d903e7b46ad1e84cb20912a9d) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Paginate `DescribeDBInstances` using `Marker` so accounts with more than one page of DB instances are fully scanned.

## 0.7.0

### Minor Changes

- [#147](https://github.com/infrascan/infrascan/pull/147) [`ff49a3c37c63ef2eb13ff14a6f084dc48d50adf8`](https://github.com/infrascan/infrascan/commit/ff49a3c37c63ef2eb13ff14a6f084dc48d50adf8) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Scan RDS DB clusters, DB subnet groups, RDS Proxies (and their targets), and Aurora global clusters. Adds DB cluster, proxy and global cluster nodes, plus cluster → member instance, proxy → target cluster/instance, and global cluster → regional cluster edges. Instances that belong to a cluster are now nested under the cluster node (previously their parent referenced the cluster identifier, which didn't match any node), and instances without a `DBName` are labelled with their identifier.

## 0.6.0

### Minor Changes

- [#140](https://github.com/infrascan/infrascan/pull/140) [`165992be8b0f166577002c66d4079308b0bb236a`](https://github.com/infrascan/infrascan/commit/165992be8b0f166577002c66d4079308b0bb236a) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Upgrade @aws-sdk dependencies and standardize versions in pnpm catalog.

### Patch Changes

- Updated dependencies [[`a0aa145035349b9a9a4e82013daedea3f7f45925`](https://github.com/infrascan/infrascan/commit/a0aa145035349b9a9a4e82013daedea3f7f45925), [`165992be8b0f166577002c66d4079308b0bb236a`](https://github.com/infrascan/infrascan/commit/165992be8b0f166577002c66d4079308b0bb236a)]:
  - @infrascan/core@0.7.0

## 0.5.1

### Patch Changes

- Updated dependencies [[`87e6cc3b6f3342902aeab7b3c6e1349865bd8be1`](https://github.com/infrascan/infrascan/commit/87e6cc3b6f3342902aeab7b3c6e1349865bd8be1)]:
  - @infrascan/core@0.6.0

## 0.5.0

### Minor Changes

- [#123](https://github.com/infrascan/infrascan/pull/123) [`d05dc6ffe36f6b219964407b63b002520cf89795`](https://github.com/infrascan/infrascan/commit/d05dc6ffe36f6b219964407b63b002520cf89795) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Introduce informational node support

## 0.4.2

### Patch Changes

- [#107](https://github.com/infrascan/infrascan/pull/107) [`4530ad2554c3b44c4fec85dfe3b2da10440593f6`](https://github.com/infrascan/infrascan/commit/4530ad2554c3b44c4fec85dfe3b2da10440593f6) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Expose types of state produced from graph scans

## 0.4.1

### Patch Changes

- [#96](https://github.com/infrascan/infrascan/pull/96) [`1049c14ce1aa7bde7224a42c27d0e04dac418cbe`](https://github.com/infrascan/infrascan/commit/1049c14ce1aa7bde7224a42c27d0e04dac418cbe) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Add default parent value to $graph attribute for all scanners to correctly nest under region/account

## 0.4.0

### Minor Changes

- [#89](https://github.com/infrascan/infrascan/pull/89) [`913867b73a72791c79a69ebfec8bf94331654c1d`](https://github.com/infrascan/infrascan/commit/913867b73a72791c79a69ebfec8bf94331654c1d) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Migrate graph output to a standard schema for easier search/filter

### Patch Changes

- Updated dependencies [[`913867b73a72791c79a69ebfec8bf94331654c1d`](https://github.com/infrascan/infrascan/commit/913867b73a72791c79a69ebfec8bf94331654c1d)]:
  - @infrascan/core@0.5.0

## 0.3.2

### Patch Changes

- [#86](https://github.com/infrascan/infrascan/pull/86) [`d3110c2`](https://github.com/infrascan/infrascan/commit/d3110c2197be872ca72667aad552f33dead5271c) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Add debug logging to scanner modules. Debug logs can be enabled using the DEBUG environment variable. Service specific logs are namespaced under the service key.

- [#84](https://github.com/infrascan/infrascan/pull/84) [`437026c`](https://github.com/infrascan/infrascan/commit/437026cc278ec4b380bcaf3a7a675f3762ce3bea) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Bump aws client sdk versions to remove vulnerable dependency

- Updated dependencies [[`d3110c2`](https://github.com/infrascan/infrascan/commit/d3110c2197be872ca72667aad552f33dead5271c), [`437026c`](https://github.com/infrascan/infrascan/commit/437026cc278ec4b380bcaf3a7a675f3762ce3bea)]:
  - @infrascan/core@0.4.1

## 0.3.1

### Patch Changes

- Updated dependencies [[`e28a6d9`](https://github.com/infrascan/infrascan/commit/e28a6d91eb36fa83e9a40a667eb39a15b2a45ccb)]:
  - @infrascan/core@0.4.0

## 0.3.0

### Minor Changes

- [#77](https://github.com/infrascan/infrascan/pull/77) [`21d4ecf`](https://github.com/infrascan/infrascan/commit/21d4ecf4b7fec31f4ac7b2cc5857aa5d2b725075) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Migrate all packages to consume new graph model

### Patch Changes

- Updated dependencies [[`21d4ecf`](https://github.com/infrascan/infrascan/commit/21d4ecf4b7fec31f4ac7b2cc5857aa5d2b725075)]:
  - @infrascan/core@0.3.0

## 0.2.4

### Patch Changes

- Updated dependencies [[`647a680`](https://github.com/infrascan/infrascan/commit/647a680af9efc08107a6f315a0d0aedb630559ec)]:
  - @infrascan/core@0.2.3

## 0.2.3

### Patch Changes

- [#56](https://github.com/infrascan/infrascan/pull/56) [`4b6911d`](https://github.com/infrascan/infrascan/commit/4b6911d07cfc846389c30317becdf63e95768386) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Update to include support scanner level retry strategies

## 0.2.2

### Patch Changes

- [#41](https://github.com/infrascan/infrascan/pull/41) [`c84fa87`](https://github.com/infrascan/infrascan/commit/c84fa87fa66fef97533ea597f431c8fe135cf1b2) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Update documentation and add missing keywords to package.json

- Updated dependencies [[`c84fa87`](https://github.com/infrascan/infrascan/commit/c84fa87fa66fef97533ea597f431c8fe135cf1b2)]:
  - @infrascan/core@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [[`f7700f1`](https://github.com/infrascan/infrascan/commit/f7700f11568e413ba2ccefc990fc683bdfdeb01d)]:
  - @infrascan/core@0.2.1

## 0.2.0

### Minor Changes

- 7d71a0e: Restructure the project into per service scanner modules. Each module must be registered with the SDK for the service to be scanned and graphed.

  The initial implementation for Infrascan used a single config file which defined the scanning approach for every service, and their graph structure. It very quickly became difficult to debug, and reason about. The core logic was also completely untestable in any sane way.

  This release is a rewrite of the entire project. The SDK by default will do nothing. Each individual service's scanner has to be registered into an instance of the SDK for it to be scanned or graphed. This reduces the SDK complexity massively, as it only needs to step through the registered services and call into their APIs.

### Patch Changes

- Updated dependencies [7d71a0e]
  - @infrascan/core@0.2.0
