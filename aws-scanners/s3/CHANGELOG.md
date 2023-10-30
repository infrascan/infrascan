# @infrascan/aws-s3-scanner

## 0.2.4

### Patch Changes

- [#52](https://github.com/infrascan/infrascan/pull/52) [`9a82eb5`](https://github.com/infrascan/infrascan/commit/9a82eb5033c64478a4bf379b4e0a6c42767c84e6) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Remove log line from error mapping middleware

## 0.2.3

### Patch Changes

- [#47](https://github.com/infrascan/infrascan/pull/47) [`74365b6`](https://github.com/infrascan/infrascan/commit/74365b6835af817e60a9a06aac94b782236fa8bf) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Add middleware to silence not found errors when scanning s3 bucket tag sets and website configs

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
