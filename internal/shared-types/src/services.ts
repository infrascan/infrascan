import * as S3 from "@aws-sdk/client-s3";
import * as CloudFront from "@aws-sdk/client-cloudfront";
import * as Route53 from "@aws-sdk/client-route-53";

import * as ApiGatewayV2 from "@aws-sdk/client-apigatewayv2";
import * as AutoScaling from "@aws-sdk/client-auto-scaling";
import * as CloudWatchLogs from "@aws-sdk/client-cloudwatch-logs";
import * as DynamoDB from "@aws-sdk/client-dynamodb";
import * as EC2 from "@aws-sdk/client-ec2";
import * as ECS from "@aws-sdk/client-ecs";
import * as ElasticLoadBalancingV2 from "@aws-sdk/client-elastic-load-balancing-v2";
import * as Lambda from "@aws-sdk/client-lambda";
import * as RDS from "@aws-sdk/client-rds";
import * as SNS from "@aws-sdk/client-sns";
import * as SQS from "@aws-sdk/client-sqs";

/**
 * Clients for Global Services
 */
export const GlobalServiceClients = {
  S3,
  CloudFront,
  Route53,
};

/**
 * Clients for Regional Services
 */
export const RegionalServiceClients = {
  ApiGatewayV2,
  AutoScaling,
  CloudWatchLogs,
  DynamoDB,
  EC2,
  ECS,
  ElasticLoadBalancingV2,
  Lambda,
  RDS,
  SNS,
  SQS,
};

/**
 * Clients for every service
 */
export const ServiceClients = {
  ...GlobalServiceClients,
  ...RegionalServiceClients,
};

/**
 * Type for Global Services
 */
export type GlobalService = keyof typeof GlobalServiceClients;

/**
 * Type for Regional Services
 */
export type RegionalService = keyof typeof RegionalServiceClients;

/**
 * Type for any support service
 */
export type Service = GlobalService | RegionalService;
