# @infrascan/aws-ecs-scanner

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