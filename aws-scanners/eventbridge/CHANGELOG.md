# @infrascan/aws-eventbridge-scanner

## 0.2.0

### Minor Changes

- [#141](https://github.com/infrascan/infrascan/pull/141) [`57b4130ed9b1679dc209e1c1c0c10f2d4f3b06fb`](https://github.com/infrascan/infrascan/commit/57b4130ed9b1679dc209e1c1c0c10f2d4f3b06fb) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Add an EventBridge scanner. It graphs event buses, rules and API destinations, with edges from each bus to its rules, from each rule to its targets and target dead-letter queues, and from each bus to its dead-letter queue. The scanner is registered in `@infrascan/aws`.

### Patch Changes

- Updated dependencies [[`a0aa145035349b9a9a4e82013daedea3f7f45925`](https://github.com/infrascan/infrascan/commit/a0aa145035349b9a9a4e82013daedea3f7f45925), [`165992be8b0f166577002c66d4079308b0bb236a`](https://github.com/infrascan/infrascan/commit/165992be8b0f166577002c66d4079308b0bb236a)]:
  - @infrascan/core@0.7.0
