---
title: Getting Started
---

Infrascan is a set of open-source tools to help you make sense of your cloud infrastructure.

![Example Infrastructure map of an AWS Account](/img/infrastructure-diagram.png)

This repo contains the Infrascan SDK, Config, and CLI, as well as private packages used during development.

## Design (wip)

To simplify adding support for additional services, the logic for scanning any one service is encapsulated in a Scanner. Each Scanner implements a `ServiceModule` interface which allows the SDK to create clients for the service, pull state, and generate graph elements.

The standard structure over every scanner also allows the majority of the code to be generated based on a simple config file. The codegen project can be found in the private [@infrascan/codegen package](./aws-scanners/codegen).

## Packages

| Name                                                                                                     | Version | Description                                                                              |
| :------------------------------------------------------------------------------------------------------- | :------ | :--------------------------------------------------------------------------------------- |
| [@infrascan/aws](@infrascan/aws/README.md)                                                               | -       | A convenience package to register all AWS Scanners with an instance of the Infrascan SDK |
| [@infrascan/cli](@infrascan/cli/README.md)                                                               | -       | Thin command line wrapper around the infrascan sdk                                       |
| [@infrascan/core](@infrascan/core/README.md)                                                             | -       | Core library for use in service scanners and the SDK.                                    |
| [@infrascan/cytoscape-serializer](@infrascan/cytoscape-serializer/README.md)                             | -       | A graph serializer which produces nodes and edges compatible with Cytoscape.js           |
| [@infrascan/fs-connector](@infrascan/fs-connector/README.md)                                             | 0.2.3   | Connector for the Infrascan SDK to read and write state to the local filesystem          |
| [@infrascan/s3-connector](@infrascan/s3-connector/README.md)                                             | -       | Connector for the Infrascan SDK to read and write state to an S3 bucket                  |
| [@infrascan/sdk](@infrascan/sdk/README.md)                                                               | 0.4.1   | Tool to generate a system map by connecting to your AWS account.                         |
| [@infrascan/shared-types](@infrascan/shared-types/README.md)                                             | 0.5.0   | Shared types for multiple infrascan packages                                             |
| [@infrascan/aws-api-gateway-scanner](@infrascan/aws-api-gateway-scanner/README.md)                       | 0.3.1   | Infrascan scanner definition for AWS Api Gateway                                         |
| [@infrascan/aws-autoscaling-scanner](@infrascan/aws-autoscaling-scanner/README.md)                       | 0.2.6   | Infrascan scanner definition for AWS Autoscaling                                         |
| [@infrascan/aws-cloudfront-scanner](@infrascan/aws-cloudfront-scanner/README.md)                         | 0.3.1   | Infrascan scanner definition for AWS Cloudfront                                          |
| [@infrascan/aws-cloudwatch-logs-scanner](@infrascan/aws-cloudwatch-logs-scanner/README.md)               | 0.3.1   | Infrascan scanner definition for AWS Cloudwatch Logs                                     |
| [@infrascan/aws-dynamodb-scanner](@infrascan/aws-dynamodb-scanner/README.md)                             | 0.3.1   | Infrascan scanner definition for AWS DynamoDB                                            |
| [@infrascan/aws-ec2-scanner](@infrascan/aws-ec2-scanner/README.md)                                       | 0.3.1   | Infrascan scanner definition for AWS EC2                                                 |
| [@infrascan/aws-ecs-scanner](@infrascan/aws-ecs-scanner/README.md)                                       | 0.3.1   | Infrascan scanner definition for AWS ECS                                                 |
| [@infrascan/aws-elastic-load-balancing-scanner](@infrascan/aws-elastic-load-balancing-scanner/README.md) | 0.3.1   | Infrascan scanner definition for AWS Elastic Load Balancing                              |
| [@infrascan/aws-kinesis-scanner](@infrascan/aws-kinesis-scanner/README.md)                               | 0.2.1   | Infrascan scanner definition for AWS Kinesis                                             |
| [@infrascan/aws-lambda-scanner](@infrascan/aws-lambda-scanner/README.md)                                 | 0.3.1   | Infrascan scanner definition for AWS Lambda                                              |
| [@infrascan/aws-rds-scanner](@infrascan/aws-rds-scanner/README.md)                                       | 0.3.1   | Infrascan scanner definition for AWS RDS                                                 |
| [@infrascan/aws-route53-scanner](@infrascan/aws-route53-scanner/README.md)                               | 0.3.1   | Infrascan scanner definition for AWS Route53                                             |
| [@infrascan/aws-s3-scanner](@infrascan/aws-s3-scanner/README.md)                                         | 0.3.1   | Infrascan scanner definition for AWS S3                                                  |
| [@infrascan/aws-sns-scanner](@infrascan/aws-sns-scanner/README.md)                                       | 0.3.1   | Infrascan scanner definition for AWS SNS                                                 |
| [@infrascan/aws-sqs-scanner](@infrascan/aws-sqs-scanner/README.md)                                       | 0.3.1   | Infrascan scanner definition for AWS SQS                                                 |
| [@infrascan/aws-step-function-scanner](@infrascan/aws-step-function-scanner/README.md)                   | 0.2.1   | Infrascan scanner definition for AWS Step Functions                                      |
| [@infrascan/node-reducer-plugin](@infrascan/node-reducer-plugin/README.md)                               | -       | An Infrascan plugin to collapse similar nodes in your Graph down into a single node.     |
