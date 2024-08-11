---
"@infrascan/aws-elastic-load-balancing-scanner": patch
"@infrascan/aws-cloudwatch-logs-scanner": patch
"@infrascan/aws-step-function-scanner": patch
"@infrascan/aws-api-gateway-scanner": patch
"@infrascan/aws-autoscaling-scanner": patch
"@infrascan/aws-cloudfront-scanner": patch
"@infrascan/aws-dynamodb-scanner": patch
"@infrascan/aws-kinesis-scanner": patch
"@infrascan/aws-route53-scanner": patch
"@infrascan/aws-lambda-scanner": patch
"@infrascan/aws-ec2-scanner": patch
"@infrascan/aws-ecs-scanner": patch
"@infrascan/aws-rds-scanner": patch
"@infrascan/aws-sns-scanner": patch
"@infrascan/aws-sqs-scanner": patch
"@infrascan/aws-s3-scanner": patch
---

Add debug logging to scanner modules. Debug logs can be enabled using the DEBUG environment variable. Service specific logs are namespaced under the service key.
