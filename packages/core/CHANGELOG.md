# @infrascan/core

## 0.5.0

### Minor Changes

- [#89](https://github.com/infrascan/infrascan/pull/89) [`913867b73a72791c79a69ebfec8bf94331654c1d`](https://github.com/infrascan/infrascan/commit/913867b73a72791c79a69ebfec8bf94331654c1d) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Migrate graph output to a standard schema for easier search/filter

## 0.4.1

### Patch Changes

- [#86](https://github.com/infrascan/infrascan/pull/86) [`d3110c2`](https://github.com/infrascan/infrascan/commit/d3110c2197be872ca72667aad552f33dead5271c) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Bug fixes: correctly invoke on graph complete plugins in sdk, correct Node structure in core and populate additional context in reducer plugin.

- [#84](https://github.com/infrascan/infrascan/pull/84) [`437026c`](https://github.com/infrascan/infrascan/commit/437026cc278ec4b380bcaf3a7a675f3762ce3bea) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Bump aws client sdk versions to remove vulnerable dependency

## 0.4.0

### Minor Changes

- [#82](https://github.com/infrascan/infrascan/pull/82) [`e28a6d9`](https://github.com/infrascan/infrascan/commit/e28a6d91eb36fa83e9a40a667eb39a15b2a45ccb) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Introduce new readable/writable interface for @infrascan/core graph interface to make types nicer to work with. Previously, the graph returned union types to bridge the Graph's internal model of the state with its exposed API for adding children/parents/edges. This resulted in a lot of properties with signatures like `parent?: Node | string`.

  This has been updated to wrap the Node and Edge types in `Readable` and `Writable` types based on the context they're being used in. This is inspired by the Kysely `Selectable`/`Insertable` pattern. When a Node is `Readable` its edges, parent and children will resolve to other Node objects. When `Writable`, all other Nodes are expected to be referenced using a string type containing their ID.

  Introduce @infrascan/node-reducer-plugin which reduces graph complexity for dynamicially provisioned infrastructure.

## 0.3.0

### Minor Changes

- [#77](https://github.com/infrascan/infrascan/pull/77) [`21d4ecf`](https://github.com/infrascan/infrascan/commit/21d4ecf4b7fec31f4ac7b2cc5857aa5d2b725075) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Add in-memory graph model to decouple the infrascan packages from a single graphing library, and to make graph manipulation easier

## 0.2.3

### Patch Changes

- [#69](https://github.com/infrascan/infrascan/pull/69) [`647a680`](https://github.com/infrascan/infrascan/commit/647a680af9efc08107a6f315a0d0aedb630559ec) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Add account prefix to region nodes to avoid cross account conflicts. Use common API for formatting nodes in EC2 to prevent orphaned VPC nodes.

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
