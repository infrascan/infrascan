import type { IAM } from "@aws-sdk/client-iam";
import type { S3 } from "@aws-sdk/client-s3";
import type { CloudFront } from "@aws-sdk/client-cloudfront";
import type { Route53 } from "@aws-sdk/client-route-53";
import type { SQS } from "@aws-sdk/client-sqs";
import type { SNS } from "@aws-sdk/client-sns";
import type { Lambda } from "@aws-sdk/client-lambda";
import type { CloudWatchLogs } from "@aws-sdk/client-cloudwatch-logs";
import type { EC2 } from "@aws-sdk/client-ec2";
import type { AutoScaling } from "@aws-sdk/client-auto-scaling";
import type { APIGateway } from "@aws-sdk/client-api-gateway";
import type { RDS } from "@aws-sdk/client-rds";
import type { ElasticLoadBalancingV2 } from "@aws-sdk/client-elastic-load-balancing-v2";
import type { DynamoDB } from "@aws-sdk/client-dynamodb";
import type { ECS } from "@aws-sdk/client-ecs";

export type SupportedServices = {
  s3: S3;
  cloudfront: CloudFront;
  "route-53": Route53;
  sqs: SQS;
  sns: SNS;
  lambda: Lambda;
  "cloudwatch-logs": CloudWatchLogs;
  ec2: EC2;
  "auto-scaling": AutoScaling;
  "api-gateway": APIGateway;
  rds: RDS;
  "elastic-load-balancing-v2": ElasticLoadBalancingV2;
  dynamodb: DynamoDB;
  ecs: ECS;
  iam: IAM;
};
export type ServiceClients = SupportedServices[keyof SupportedServices];

import type { RegionInputConfig } from "@aws-sdk/config-resolver";
import type { RetryInputConfig } from "@aws-sdk/middleware-retry";
import type { HostHeaderInputConfig } from "@aws-sdk/middleware-host-header";
import type { UserAgentInputConfig } from "@aws-sdk/middleware-user-agent";
import type { AwsAuthInputConfig } from "@aws-sdk/middleware-signing";

export type BaseServiceConfig = RegionInputConfig &
  RetryInputConfig &
  HostHeaderInputConfig &
  AwsAuthInputConfig &
  UserAgentInputConfig;

/**
 * Helper function for performing a dynamic import to get an instance of a given AWS client
 * @param service: key of the service to import. Must be a SupportedService key.
 * @param clientKey: key of the client interface within the imported AWS service.
 * @param config: config object for the AWS client.
 * @returns an instance of the AWS client.
 */
export async function dynamicClient<K extends keyof SupportedServices>(
  service: K,
  clientKey: string,
  config: BaseServiceConfig
): Promise<SupportedServices[K]> {
  const dynamicService = await import(`@aws-sdk/client-${service}`);
  return new dynamicService[clientKey](config);
}
