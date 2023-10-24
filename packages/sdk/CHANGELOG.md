# @infrascan/sdk

## 0.2.1

### Patch Changes

- [#32](https://github.com/infrascan/infrascan/pull/32) [`a58495d`](https://github.com/infrascan/infrascan/commit/a58495d306bee7cdd4a4c27f1a43e296336be29d) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Simplify shared-types package - remove unneeded aws client dependencies. Patch downstream packages.

- Updated dependencies [[`a58495d`](https://github.com/infrascan/infrascan/commit/a58495d306bee7cdd4a4c27f1a43e296336be29d)]:
  - @infrascan/core@0.2.1

## 0.2.0

### Minor Changes

- 7d71a0e: Restructure the project into per service scanner modules. Each module must be registered with the SDK for the service to be scanned and graphed.

  The initial implementation for Infrascan used a single config file which defined the scanning approach for every service, and their graph structure. It very quickly became difficult to debug, and reason about. The core logic was also completely untestable in any sane way.

  This release is a rewrite of the entire project. The SDK by default will do nothing. Each individual service's scanner has to be registered into an instance of the SDK for it to be scanned or graphed. This reduces the SDK complexity massively, as it only needs to step through the registered services and call into their APIs.

### Patch Changes

- Updated dependencies [7d71a0e]
  - @infrascan/core@0.2.0