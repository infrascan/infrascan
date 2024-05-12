# @infrascan/node-reducer-plugin

## 0.2.0

### Minor Changes

- [#82](https://github.com/infrascan/infrascan/pull/82) [`e28a6d9`](https://github.com/infrascan/infrascan/commit/e28a6d91eb36fa83e9a40a667eb39a15b2a45ccb) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Introduce new readable/writable interface for @infrascan/core graph interface to make types nicer to work with. Previously, the graph returned union types to bridge the Graph's internal model of the state with its exposed API for adding children/parents/edges. This resulted in a lot of properties with signatures like `parent?: Node | string`.

  This has been updated to wrap the Node and Edge types in `Readable` and `Writable` types based on the context they're being used in. This is inspired by the Kysely `Selectable`/`Insertable` pattern. When a Node is `Readable` its edges, parent and children will resolve to other Node objects. When `Writable`, all other Nodes are expected to be referenced using a string type containing their ID.

  Introduce @infrascan/node-reducer-plugin which reduces graph complexity for dynamicially provisioned infrastructure.

### Patch Changes

- Updated dependencies [[`e28a6d9`](https://github.com/infrascan/infrascan/commit/e28a6d91eb36fa83e9a40a667eb39a15b2a45ccb)]:
  - @infrascan/core@0.4.0
