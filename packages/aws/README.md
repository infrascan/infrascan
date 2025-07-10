# @infrascan/aws

A convenience package that bundles and registers all AWS infrastructure scanners with an instance of the Infrascan SDK. This package serves as a single entry point for scanning AWS cloud infrastructure, eliminating the need to individually import and register each AWS service scanner.

## Purpose

The `@infrascan/aws` package simplifies the process of setting up the complete infrascan AWS tool set by:

- **Bundling all AWS scanners**: Provides a single package containing all available AWS service scanners
- **Automatic registration**: Registers all scanners with your Infrascan client in one function call
- **Type exports**: Re-exports TypeScript types from all included scanners for better development experience
- **Simplified dependency management**: Reduces the number of individual scanner packages you need to manage as direct dependencies

## Included AWS Scanners

This package wraps and registers the following AWS service scanners:

- **@infrascan/aws-api-gateway-scanner** - Scans API Gateway resources
- **@infrascan/aws-autoscaling-scanner** - Scans Auto Scaling groups and configurations
- **@infrascan/aws-cloudfront-scanner** - Scans CloudFront distributions
- **@infrascan/aws-cloudwatch-logs-scanner** - Scans CloudWatch log groups
- **@infrascan/aws-dynamodb-scanner** - Scans DynamoDB tables and configurations
- **@infrascan/aws-ec2-scanner** - Scans EC2 instances, security groups, and VPC resources
- **@infrascan/aws-ecs-scanner** - Scans ECS clusters, services, and task definitions
- **@infrascan/aws-elastic-load-balancing-scanner** - Scans Application and Network Load Balancers
- **@infrascan/aws-kinesis-scanner** - Scans Kinesis streams and analytics
- **@infrascan/aws-lambda-scanner** - Scans Lambda functions and configurations
- **@infrascan/aws-rds-scanner** - Scans RDS instances and clusters
- **@infrascan/aws-route53-scanner** - Scans Route 53 hosted zones and records
- **@infrascan/aws-s3-scanner** - Scans S3 buckets and configurations
- **@infrascan/aws-sns-scanner** - Scans SNS topics and subscriptions
- **@infrascan/aws-sqs-scanner** - Scans SQS queues
- **@infrascan/aws-step-function-scanner** - Scans Step Functions state machines

## Usage

```js
import registerAwsScanners from "@infrascan/aws";
import Infrascan from "@infrascan/sdk";

const infrascanClient = new Infrascan();
registerAwsScanners(infrascanClient);

// Now you can scan your AWS infrastructure
const results = await infrascanClient.performScan();
```
