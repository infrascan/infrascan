# @infrascan/sdk

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