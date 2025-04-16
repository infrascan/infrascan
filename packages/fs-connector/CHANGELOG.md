# @infrascan/fs-connector

## 0.3.0

### Minor Changes

- [#89](https://github.com/infrascan/infrascan/pull/89) [`913867b73a72791c79a69ebfec8bf94331654c1d`](https://github.com/infrascan/infrascan/commit/913867b73a72791c79a69ebfec8bf94331654c1d) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Migrate graph output to a standard schema for easier search/filter

## 0.2.3

### Patch Changes

- [#54](https://github.com/infrascan/infrascan/pull/54) [`e96ff3a`](https://github.com/infrascan/infrascan/commit/e96ff3a0abbf4442cd24384745e6511307e9f9f9) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Include typings

## 0.2.2

### Patch Changes

- [#41](https://github.com/infrascan/infrascan/pull/41) [`c84fa87`](https://github.com/infrascan/infrascan/commit/c84fa87fa66fef97533ea597f431c8fe135cf1b2) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Update documentation and add missing keywords to package.json

## 0.2.1

### Patch Changes

- [#36](https://github.com/infrascan/infrascan/pull/36) [`f7700f1`](https://github.com/infrascan/infrascan/commit/f7700f11568e413ba2ccefc990fc683bdfdeb01d) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Simplify shared-types package - remove unneeded aws client dependencies. Patch downstream packages.

## 0.2.0

### Minor Changes

- 7d71a0e: Restructure the project into per service scanner modules. Each module must be registered with the SDK for the service to be scanned and graphed.

  The initial implementation for Infrascan used a single config file which defined the scanning approach for every service, and their graph structure. It very quickly became difficult to debug, and reason about. The core logic was also completely untestable in any sane way.

  This release is a rewrite of the entire project. The SDK by default will do nothing. Each individual service's scanner has to be registered into an instance of the SDK for it to be scanned or graphed. This reduces the SDK complexity massively, as it only needs to step through the registered services and call into their APIs.
