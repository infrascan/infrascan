# @infrascan/sdk

## 0.6.2

### Patch Changes

- [#129](https://github.com/infrascan/infrascan/pull/129) [`ad016a18f6ce5c9a2aac88ae46072300a22e1c1b`](https://github.com/infrascan/infrascan/commit/ad016a18f6ce5c9a2aac88ae46072300a22e1c1b) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Update aws utility dependencies

## 0.6.1

### Patch Changes

- [#125](https://github.com/infrascan/infrascan/pull/125) [`fd7c58d1e968ea031cdcf03064d237de2f2067cd`](https://github.com/infrascan/infrascan/commit/fd7c58d1e968ea031cdcf03064d237de2f2067cd) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Bug fix in IAM role and Route53 edge calculations

## 0.6.0

### Minor Changes

- [#123](https://github.com/infrascan/infrascan/pull/123) [`d05dc6ffe36f6b219964407b63b002520cf89795`](https://github.com/infrascan/infrascan/commit/d05dc6ffe36f6b219964407b63b002520cf89795) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Introduce informational node support

## 0.5.1

### Patch Changes

- [#112](https://github.com/infrascan/infrascan/pull/112) [`12987a0f63ed0388ecacee124e0292852fc1662f`](https://github.com/infrascan/infrascan/commit/12987a0f63ed0388ecacee124e0292852fc1662f) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Support configuring a custom retry strategy. Remove concurrent iam api calls.

## 0.5.0

### Minor Changes

- [#89](https://github.com/infrascan/infrascan/pull/89) [`913867b73a72791c79a69ebfec8bf94331654c1d`](https://github.com/infrascan/infrascan/commit/913867b73a72791c79a69ebfec8bf94331654c1d) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Migrate graph output to a standard schema for easier search/filter

### Patch Changes

- Updated dependencies [[`913867b73a72791c79a69ebfec8bf94331654c1d`](https://github.com/infrascan/infrascan/commit/913867b73a72791c79a69ebfec8bf94331654c1d)]:
  - @infrascan/core@0.5.0

## 0.4.2

### Patch Changes

- [#86](https://github.com/infrascan/infrascan/pull/86) [`d3110c2`](https://github.com/infrascan/infrascan/commit/d3110c2197be872ca72667aad552f33dead5271c) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Bug fixes: correctly invoke on graph complete plugins in sdk, correct Node structure in core and populate additional context in reducer plugin.

- [#84](https://github.com/infrascan/infrascan/pull/84) [`437026c`](https://github.com/infrascan/infrascan/commit/437026cc278ec4b380bcaf3a7a675f3762ce3bea) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Bump aws client sdk versions to remove vulnerable dependency

- Updated dependencies [[`d3110c2`](https://github.com/infrascan/infrascan/commit/d3110c2197be872ca72667aad552f33dead5271c), [`437026c`](https://github.com/infrascan/infrascan/commit/437026cc278ec4b380bcaf3a7a675f3762ce3bea)]:
  - @infrascan/core@0.4.1

## 0.4.1

### Patch Changes

- Updated dependencies [[`e28a6d9`](https://github.com/infrascan/infrascan/commit/e28a6d91eb36fa83e9a40a667eb39a15b2a45ccb)]:
  - @infrascan/core@0.4.0

## 0.4.0

### Minor Changes

- [#77](https://github.com/infrascan/infrascan/pull/77) [`21d4ecf`](https://github.com/infrascan/infrascan/commit/21d4ecf4b7fec31f4ac7b2cc5857aa5d2b725075) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Migrate all packages to consume new graph model

### Patch Changes

- Updated dependencies [[`21d4ecf`](https://github.com/infrascan/infrascan/commit/21d4ecf4b7fec31f4ac7b2cc5857aa5d2b725075)]:
  - @infrascan/core@0.3.0

## 0.3.6

### Patch Changes

- [#69](https://github.com/infrascan/infrascan/pull/69) [`647a680`](https://github.com/infrascan/infrascan/commit/647a680af9efc08107a6f315a0d0aedb630559ec) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Add account prefix to region nodes to avoid cross account conflicts. Use common API for formatting nodes in EC2 to prevent orphaned VPC nodes.

- Updated dependencies [[`647a680`](https://github.com/infrascan/infrascan/commit/647a680af9efc08107a6f315a0d0aedb630559ec)]:
  - @infrascan/core@0.2.3

## 0.3.5

### Patch Changes

- [#62](https://github.com/infrascan/infrascan/pull/62) [`094dba5`](https://github.com/infrascan/infrascan/commit/094dba54698fb5559d7ef123ea6b13ca92edb18f) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Add validation to check that both source and destination nodes exist before inserting a graph edge

## 0.3.4

### Patch Changes

- [#60](https://github.com/infrascan/infrascan/pull/60) [`4e6df74`](https://github.com/infrascan/infrascan/commit/4e6df74b4843c112eec13025da08aa20bc1003d3) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Account for non-list policy statements for IAM API.

## 0.3.3

### Patch Changes

- [#58](https://github.com/infrascan/infrascan/pull/58) [`49ea5e0`](https://github.com/infrascan/infrascan/commit/49ea5e0be9f40c21ef7ea127cb619c2f5770d5f2) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Catch error on iam role scanning

## 0.3.2

### Patch Changes

- [#56](https://github.com/infrascan/infrascan/pull/56) [`4b6911d`](https://github.com/infrascan/infrascan/commit/4b6911d07cfc846389c30317becdf63e95768386) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Update to include support scanner level retry strategies

## 0.3.1

### Patch Changes

- [#52](https://github.com/infrascan/infrascan/pull/52) [`9a82eb5`](https://github.com/infrascan/infrascan/commit/9a82eb5033c64478a4bf379b4e0a6c42767c84e6) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Add default region to scan metadata to ensure region is consistent in both scan and graph

## 0.3.0

### Minor Changes

- [#50](https://github.com/infrascan/infrascan/pull/50) [`dd0ebfe`](https://github.com/infrascan/infrascan/commit/dd0ebfe60b09335cf9ffecc6045b8aff18029d6e) Thanks [@lfarrel6](https://github.com/lfarrel6)! - In cases where the AWS Config ini file didn't define a default region, scans would exit early. This was due to the IAM client not supplying a region in its constructor, which introduced a hard dependency on the config file to provide a default. The same dependency existed when creating credential providers.

  This PR patches the IAM client creation in the SDK, and updates its API to accept a credential provider factory which prevents the SDK from failing in inadequately configured environments.

## 0.2.2

### Patch Changes

- [#41](https://github.com/infrascan/infrascan/pull/41) [`c84fa87`](https://github.com/infrascan/infrascan/commit/c84fa87fa66fef97533ea597f431c8fe135cf1b2) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Update documentation and add missing keywords to package.json

- Updated dependencies [[`c84fa87`](https://github.com/infrascan/infrascan/commit/c84fa87fa66fef97533ea597f431c8fe135cf1b2)]:
  - @infrascan/core@0.2.2

## 0.2.1

### Patch Changes

- [#36](https://github.com/infrascan/infrascan/pull/36) [`f7700f1`](https://github.com/infrascan/infrascan/commit/f7700f11568e413ba2ccefc990fc683bdfdeb01d) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Simplify shared-types package - remove unneeded aws client dependencies. Patch downstream packages.

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
