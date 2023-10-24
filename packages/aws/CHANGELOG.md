# @infrascan/aws

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