# @infrascan/aws-ecs-scanner

## 0.5.2

### Patch Changes

- [#117](https://github.com/infrascan/infrascan/pull/117) [`431121af5eb8a01099f778914dbf6aadd37958b1`](https://github.com/infrascan/infrascan/commit/431121af5eb8a01099f778914dbf6aadd37958b1) Thanks [@lfarrel6](https://github.com/lfarrel6)! - **Note: potentially breaking**

  Move load balancer type under ecs service object as it is not a truly generic load balancer type.

  Previously configured load balancers for an ECS Service would be tracked on the service node at the top level (i.e. `node.loadBalancer`).
  The `loadBalancer` value contained ECS specific information, and was not linked with the LB in front of the service outside of a target group arn.

  To correct this, the `loadBalancer` property is now under the ecs service object (i.e. `node.ecs.service.loadBalancer`).

## 0.5.1

### Patch Changes

- [#107](https://github.com/infrascan/infrascan/pull/107) [`4530ad2554c3b44c4fec85dfe3b2da10440593f6`](https://github.com/infrascan/infrascan/commit/4530ad2554c3b44c4fec85dfe3b2da10440593f6) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Expose types of state produced from graph scans

## 0.5.0

### Minor Changes

- [#101](https://github.com/infrascan/infrascan/pull/101) [`316320a39bfd64a9feab735d83c054031abf2cf0`](https://github.com/infrascan/infrascan/commit/316320a39bfd64a9feab735d83c054031abf2cf0) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Update ECS Task scans to more appropriately label the task nodes, and correct their parent assignment. This release also captures context from the ECS task's attached network interface.

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

## 0.2.5

### Patch Changes

- Updated dependencies [[`647a680`](https://github.com/infrascan/infrascan/commit/647a680af9efc08107a6f315a0d0aedb630559ec)]:
  - @infrascan/core@0.2.3

## 0.2.4

### Patch Changes

- [#56](https://github.com/infrascan/infrascan/pull/56) [`4b6911d`](https://github.com/infrascan/infrascan/commit/4b6911d07cfc846389c30317becdf63e95768386) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Update to include support scanner level retry strategies

## 0.2.3

### Patch Changes

- [#49](https://github.com/infrascan/infrascan/pull/49) [`c70ad53`](https://github.com/infrascan/infrascan/commit/c70ad53f573a5cf5f600d3f9866f36b3ec6239a0) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Update ECS Scanner to filter out empty lists when pulling parameters.

  Remove unused key in shared-types scanner definitions.

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
