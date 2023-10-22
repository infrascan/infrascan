---
"@infrascan/aws-elastic-load-balancing-scanner": minor
"@infrascan/aws-cloudwatch-logs-scanner": minor
"@infrascan/aws-api-gateway-scanner": minor
"@infrascan/aws-autoscaling-scanner": minor
"@infrascan/aws-cloudfront-scanner": minor
"@infrascan/aws-dynamodb-scanner": minor
"@infrascan/shared-types": minor
"@infrascan/fs-connector": minor
"@infrascan/aws-route53-scanner": minor
"@infrascan/aws-lambda-scanner": minor
"@infrascan/aws-ec2-scanner": minor
"@infrascan/aws-ecs-scanner": minor
"@infrascan/aws-rds-scanner": minor
"@infrascan/aws-sns-scanner": minor
"@infrascan/aws-sqs-scanner": minor
"@infrascan/aws-s3-scanner": minor
"@infrascan/core": minor
"@infrascan/aws": minor
"@infrascan/cli": minor
"@infrascan/sdk": minor
---

Restructure the project into per service scanner modules. Each module must be registered with the SDK for the service to be scanned and graphed.

The initial implementation for Infrascan used a single config file which defined the scanning approach for every service, and their graph structure. It very quickly became difficult to debug, and reason about. The core logic was also completely untestable in any sane way.

This release is a rewrite of the entire project. The SDK by default will do nothing. Each individual service's scanner has to be registered into an instance of the SDK for it to be scanned or graphed. This reduces the SDK complexity massively, as it only needs to step through the registered services and call into their APIs.