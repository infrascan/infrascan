export type GlobalClient = "S3" | "CloudFront" | "Route53";

export * as S3 from "@aws-sdk/client-s3";
export * as CloudFront from "@aws-sdk/client-cloudfront";
export * as Route53 from "@aws-sdk/client-route-53";
export * as ApiGatewayV2 from "@aws-sdk/client-apigatewayv2";
export * as AutoScaling from "@aws-sdk/client-auto-scaling";
export * as CloudWatchLogs from "@aws-sdk/client-cloudwatch-logs";
export * as DynamoDB from "@aws-sdk/client-dynamodb";
export * as EC2 from "@aws-sdk/client-ec2";
export * as ECS from "@aws-sdk/client-ecs";
export * as ElasticLoadBalancingV2 from "@aws-sdk/client-elastic-load-balancing-v2";
export * as Lambda from "@aws-sdk/client-lambda";
export * as RDS from "@aws-sdk/client-rds";
export * as SNS from "@aws-sdk/client-sns";
export * as SQS from "@aws-sdk/client-sqs";
