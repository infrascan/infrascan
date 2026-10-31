# @infrascan/aws

## 0.6.2

### Patch Changes

- Updated dependencies [[`fae33ebe215aba1b5fec4601b8a66dad59475eab`](https://github.com/infrascan/infrascan/commit/fae33ebe215aba1b5fec4601b8a66dad59475eab)]:
  - @infrascan/aws-ec2-scanner@0.9.0

## 0.6.1

### Patch Changes

- Updated dependencies [[`b7f13a2fcba7a8030314db014497917adbc53616`](https://github.com/infrascan/infrascan/commit/b7f13a2fcba7a8030314db014497917adbc53616), [`ff49a3c37c63ef2eb13ff14a6f084dc48d50adf8`](https://github.com/infrascan/infrascan/commit/ff49a3c37c63ef2eb13ff14a6f084dc48d50adf8), [`ba77f16ffff6b1d773ec0eb0f95921d65e61e018`](https://github.com/infrascan/infrascan/commit/ba77f16ffff6b1d773ec0eb0f95921d65e61e018)]:
  - @infrascan/aws-autoscaling-scanner@0.5.0
  - @infrascan/aws-rds-scanner@0.7.0
  - @infrascan/aws-step-function-scanner@0.6.0

## 0.6.0

### Minor Changes

- [#141](https://github.com/infrascan/infrascan/pull/141) [`57b4130ed9b1679dc209e1c1c0c10f2d4f3b06fb`](https://github.com/infrascan/infrascan/commit/57b4130ed9b1679dc209e1c1c0c10f2d4f3b06fb) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Add an EventBridge scanner. It graphs event buses, rules and API destinations, with edges from each bus to its rules, from each rule to its targets and target dead-letter queues, and from each bus to its dead-letter queue. The scanner is registered in `@infrascan/aws`.

### Patch Changes

- Updated dependencies [[`57b4130ed9b1679dc209e1c1c0c10f2d4f3b06fb`](https://github.com/infrascan/infrascan/commit/57b4130ed9b1679dc209e1c1c0c10f2d4f3b06fb), [`a0aa145035349b9a9a4e82013daedea3f7f45925`](https://github.com/infrascan/infrascan/commit/a0aa145035349b9a9a4e82013daedea3f7f45925), [`165992be8b0f166577002c66d4079308b0bb236a`](https://github.com/infrascan/infrascan/commit/165992be8b0f166577002c66d4079308b0bb236a)]:
  - @infrascan/aws-eventbridge-scanner@0.2.0
  - @infrascan/aws-cloudwatch-logs-scanner@0.6.0
  - @infrascan/aws-dynamodb-scanner@0.6.0
  - @infrascan/aws-ec2-scanner@0.8.0
  - @infrascan/aws-ecs-scanner@0.7.0
  - @infrascan/aws-elastic-load-balancing-scanner@0.6.0
  - @infrascan/aws-kinesis-scanner@0.5.0
  - @infrascan/aws-lambda-scanner@0.7.0
  - @infrascan/aws-s3-scanner@0.6.0
  - @infrascan/aws-sqs-scanner@0.6.0
  - @infrascan/aws-step-function-scanner@0.5.0
  - @infrascan/aws-api-gateway-scanner@0.6.0
  - @infrascan/aws-autoscaling-scanner@0.4.0
  - @infrascan/aws-cloudfront-scanner@0.6.0
  - @infrascan/aws-route53-scanner@0.7.0
  - @infrascan/aws-rds-scanner@0.6.0
  - @infrascan/aws-sns-scanner@0.6.0

## 0.5.7

### Patch Changes

- Updated dependencies [[`11172ebb203f5be8a4b370f45b68a6d84de32b52`](https://github.com/infrascan/infrascan/commit/11172ebb203f5be8a4b370f45b68a6d84de32b52)]:
  - @infrascan/aws-lambda-scanner@0.6.0

## 0.5.6

### Patch Changes

- Updated dependencies [[`ae9bfbc219dad11f38c4449f0e2478f3e8585878`](https://github.com/infrascan/infrascan/commit/ae9bfbc219dad11f38c4449f0e2478f3e8585878)]:
  - @infrascan/aws-ec2-scanner@0.7.0

## 0.5.5

### Patch Changes

- Updated dependencies [[`dd08208963705f2211ea1db16983bb4034ee5446`](https://github.com/infrascan/infrascan/commit/dd08208963705f2211ea1db16983bb4034ee5446)]:
  - @infrascan/aws-ec2-scanner@0.6.0

## 0.5.4

### Patch Changes

- Updated dependencies [[`d05dc6ffe36f6b219964407b63b002520cf89795`](https://github.com/infrascan/infrascan/commit/d05dc6ffe36f6b219964407b63b002520cf89795)]:
  - @infrascan/aws-elastic-load-balancing-scanner@0.5.0
  - @infrascan/aws-cloudwatch-logs-scanner@0.5.0
  - @infrascan/aws-step-function-scanner@0.4.0
  - @infrascan/aws-api-gateway-scanner@0.5.0
  - @infrascan/aws-cloudfront-scanner@0.5.0
  - @infrascan/aws-dynamodb-scanner@0.5.0
  - @infrascan/aws-kinesis-scanner@0.4.0
  - @infrascan/aws-route53-scanner@0.6.0
  - @infrascan/aws-lambda-scanner@0.5.0
  - @infrascan/aws-ec2-scanner@0.5.0
  - @infrascan/aws-ecs-scanner@0.6.0
  - @infrascan/aws-rds-scanner@0.5.0
  - @infrascan/aws-sns-scanner@0.5.0
  - @infrascan/aws-sqs-scanner@0.5.0
  - @infrascan/aws-s3-scanner@0.5.0

## 0.5.3

### Patch Changes

- Updated dependencies [[`431121af5eb8a01099f778914dbf6aadd37958b1`](https://github.com/infrascan/infrascan/commit/431121af5eb8a01099f778914dbf6aadd37958b1), [`431121af5eb8a01099f778914dbf6aadd37958b1`](https://github.com/infrascan/infrascan/commit/431121af5eb8a01099f778914dbf6aadd37958b1)]:
  - @infrascan/aws-ecs-scanner@0.5.2
  - @infrascan/aws-route53-scanner@0.5.0

## 0.5.2

### Patch Changes

- [#107](https://github.com/infrascan/infrascan/pull/107) [`4530ad2554c3b44c4fec85dfe3b2da10440593f6`](https://github.com/infrascan/infrascan/commit/4530ad2554c3b44c4fec85dfe3b2da10440593f6) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Expose types of state produced from graph scans

- Updated dependencies [[`4530ad2554c3b44c4fec85dfe3b2da10440593f6`](https://github.com/infrascan/infrascan/commit/4530ad2554c3b44c4fec85dfe3b2da10440593f6)]:
  - @infrascan/aws-elastic-load-balancing-scanner@0.4.2
  - @infrascan/aws-cloudwatch-logs-scanner@0.4.2
  - @infrascan/aws-step-function-scanner@0.3.3
  - @infrascan/aws-api-gateway-scanner@0.4.2
  - @infrascan/aws-autoscaling-scanner@0.3.1
  - @infrascan/aws-cloudfront-scanner@0.4.2
  - @infrascan/aws-dynamodb-scanner@0.4.2
  - @infrascan/aws-kinesis-scanner@0.3.3
  - @infrascan/aws-route53-scanner@0.4.2
  - @infrascan/aws-lambda-scanner@0.4.2
  - @infrascan/aws-ec2-scanner@0.4.1
  - @infrascan/aws-ecs-scanner@0.5.1
  - @infrascan/aws-rds-scanner@0.4.2
  - @infrascan/aws-sns-scanner@0.4.2
  - @infrascan/aws-sqs-scanner@0.4.3
  - @infrascan/aws-s3-scanner@0.4.2

## 0.5.1

### Patch Changes

- Updated dependencies [[`316320a39bfd64a9feab735d83c054031abf2cf0`](https://github.com/infrascan/infrascan/commit/316320a39bfd64a9feab735d83c054031abf2cf0)]:
  - @infrascan/aws-ecs-scanner@0.5.0

## 0.5.0

### Minor Changes

- [#89](https://github.com/infrascan/infrascan/pull/89) [`913867b73a72791c79a69ebfec8bf94331654c1d`](https://github.com/infrascan/infrascan/commit/913867b73a72791c79a69ebfec8bf94331654c1d) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Migrate graph output to a standard schema for easier search/filter

### Patch Changes

- Updated dependencies [[`913867b73a72791c79a69ebfec8bf94331654c1d`](https://github.com/infrascan/infrascan/commit/913867b73a72791c79a69ebfec8bf94331654c1d)]:
  - @infrascan/aws-elastic-load-balancing-scanner@0.4.0
  - @infrascan/aws-cloudwatch-logs-scanner@0.4.0
  - @infrascan/aws-step-function-scanner@0.3.0
  - @infrascan/aws-api-gateway-scanner@0.4.0
  - @infrascan/aws-autoscaling-scanner@0.3.0
  - @infrascan/aws-cloudfront-scanner@0.4.0
  - @infrascan/aws-dynamodb-scanner@0.4.0
  - @infrascan/aws-kinesis-scanner@0.3.0
  - @infrascan/aws-route53-scanner@0.4.0
  - @infrascan/aws-lambda-scanner@0.4.0
  - @infrascan/aws-ec2-scanner@0.4.0
  - @infrascan/aws-ecs-scanner@0.4.0
  - @infrascan/aws-rds-scanner@0.4.0
  - @infrascan/aws-sns-scanner@0.4.0
  - @infrascan/aws-sqs-scanner@0.4.0
  - @infrascan/aws-s3-scanner@0.4.0

## 0.4.1

### Patch Changes

- Updated dependencies [[`21d4ecf`](https://github.com/infrascan/infrascan/commit/21d4ecf4b7fec31f4ac7b2cc5857aa5d2b725075)]:
  - @infrascan/aws-elastic-load-balancing-scanner@0.3.0
  - @infrascan/aws-cloudwatch-logs-scanner@0.3.0
  - @infrascan/aws-step-function-scanner@0.2.0
  - @infrascan/aws-api-gateway-scanner@0.3.0
  - @infrascan/aws-cloudfront-scanner@0.3.0
  - @infrascan/aws-dynamodb-scanner@0.3.0
  - @infrascan/aws-kinesis-scanner@0.2.0
  - @infrascan/aws-route53-scanner@0.3.0
  - @infrascan/aws-lambda-scanner@0.3.0
  - @infrascan/aws-ec2-scanner@0.3.0
  - @infrascan/aws-ecs-scanner@0.3.0
  - @infrascan/aws-rds-scanner@0.3.0
  - @infrascan/aws-sns-scanner@0.3.0
  - @infrascan/aws-sqs-scanner@0.3.0
  - @infrascan/aws-s3-scanner@0.3.0
  - @infrascan/aws-autoscaling-scanner@0.2.5

## 0.4.0

### Minor Changes

- [#73](https://github.com/infrascan/infrascan/pull/73) [`1efd3c4`](https://github.com/infrascan/infrascan/commit/1efd3c40e42f824dab57e91269a1cfe83262d27e) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Add step functions scanner to @infrascan/aws

## 0.3.0

### Minor Changes

- [#45](https://github.com/infrascan/infrascan/pull/45) [`4e230a8`](https://github.com/infrascan/infrascan/commit/4e230a8ff973aaabd1fe621262b0bf67dc982156) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Add Kinesis Scanner to @infrascan/aws package

## 0.2.1

### Patch Changes

- [#41](https://github.com/infrascan/infrascan/pull/41) [`c84fa87`](https://github.com/infrascan/infrascan/commit/c84fa87fa66fef97533ea597f431c8fe135cf1b2) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Update documentation and add missing keywords to package.json

- Updated dependencies [[`c84fa87`](https://github.com/infrascan/infrascan/commit/c84fa87fa66fef97533ea597f431c8fe135cf1b2)]:
  - @infrascan/aws-elastic-load-balancing-scanner@0.2.2
  - @infrascan/aws-cloudwatch-logs-scanner@0.2.2
  - @infrascan/aws-api-gateway-scanner@0.2.2
  - @infrascan/aws-autoscaling-scanner@0.2.2
  - @infrascan/aws-cloudfront-scanner@0.2.2
  - @infrascan/aws-dynamodb-scanner@0.2.2
  - @infrascan/aws-route53-scanner@0.2.2
  - @infrascan/aws-lambda-scanner@0.2.2
  - @infrascan/aws-ec2-scanner@0.2.2
  - @infrascan/aws-ecs-scanner@0.2.2
  - @infrascan/aws-rds-scanner@0.2.2
  - @infrascan/aws-sns-scanner@0.2.2
  - @infrascan/aws-sqs-scanner@0.2.2
  - @infrascan/aws-s3-scanner@0.2.2

## 0.2.0

### Minor Changes

- 7d71a0e: Restructure the project into per service scanner modules. Each module must be registered with the SDK for the service to be scanned and graphed.

  The initial implementation for Infrascan used a single config file which defined the scanning approach for every service, and their graph structure. It very quickly became difficult to debug, and reason about. The core logic was also completely untestable in any sane way.

  This release is a rewrite of the entire project. The SDK by default will do nothing. Each individual service's scanner has to be registered into an instance of the SDK for it to be scanned or graphed. This reduces the SDK complexity massively, as it only needs to step through the registered services and call into their APIs.

### Patch Changes

- Updated dependencies [7d71a0e]
  - @infrascan/aws-elastic-load-balancing-scanner@0.2.0
  - @infrascan/aws-cloudwatch-logs-scanner@0.2.0
  - @infrascan/aws-api-gateway-scanner@0.2.0
  - @infrascan/aws-autoscaling-scanner@0.2.0
  - @infrascan/aws-cloudfront-scanner@0.2.0
  - @infrascan/aws-dynamodb-scanner@0.2.0
  - @infrascan/aws-route53-scanner@0.2.0
  - @infrascan/aws-lambda-scanner@0.2.0
  - @infrascan/aws-ec2-scanner@0.2.0
  - @infrascan/aws-ecs-scanner@0.2.0
  - @infrascan/aws-rds-scanner@0.2.0
  - @infrascan/aws-sns-scanner@0.2.0
  - @infrascan/aws-sqs-scanner@0.2.0
  - @infrascan/aws-s3-scanner@0.2.0
