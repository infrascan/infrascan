---
"@infrascan/aws-step-function-scanner": minor
---

Add edges from state machines to the resources their `Task` states invoke. The ASL definition returned by `DescribeStateMachine` is walked recursively (including `Parallel` branches and `Map` `Iterator`/`ItemProcessor` states) and edges are generated for the optimized Lambda, SNS, SQS, DynamoDB, ECS, Step Functions and EventBridge integrations, legacy Lambda ARN resources, and AWS SDK integrations for scanned services (Lambda, SNS, SQS, DynamoDB, Step Functions, ECS, EventBridge, S3, Kinesis). Targets are normalised to the ARNs used as node ids by the other scanners; dynamic JSONPath (`.$`) and JSONata (`{% %}`) values are skipped, edges are deduplicated, and unparseable definitions are ignored.
