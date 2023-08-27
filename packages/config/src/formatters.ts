/* eslint-disable import/first */
/**
 * Generic Formatting Utilities
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
function optJSONParse(text?: string): any | undefined {
  if (text == null) {
    return undefined;
  }
  return JSON.parse(text);
}

function simpleLookupFactory<T, K extends keyof T>(key: K): (value: T) => T[K] {
  return (value: T) => value[key];
}

/**
 * S3 Formatters
 */

import type { ListBucketsOutput } from "@aws-sdk/client-s3";

export const S3 = {
  listBuckets: simpleLookupFactory<ListBucketsOutput, "Buckets">("Buckets"),
};

/**
 * Cloudfront Formatters
 */

import type {
  DistributionSummary,
  ListDistributionsResult,
} from "@aws-sdk/client-cloudfront";

export type CloudfrontDistributionSummary = {
  _infrascanLabel?: string;
} & DistributionSummary;

function formatCloudfrontListDistributions({
  DistributionList,
}: ListDistributionsResult): CloudfrontDistributionSummary[] | undefined {
  return DistributionList?.Items?.map((distribution) => {
    const distributionQuantity = distribution?.Aliases?.Quantity ?? 0;
    /* eslint-disable @typescript-eslint/naming-convention */
    const _infrascanLabel =
      distributionQuantity > 0
        ? distribution?.Aliases?.Items?.[0]
        : distribution.DomainName;
    return {
      ...distribution,
      _infrascanLabel,
    };
  }).filter((distributionItem) => distributionItem != null);
}

export const CloudFront = {
  listDistributions: formatCloudfrontListDistributions,
};

/**
 * Route53 Formatters
 */

import type {
  ListHostedZonesByNameResponse,
  ListResourceRecordSetsResponse,
} from "@aws-sdk/client-route-53";

export const Route53 = {
  listHostedZonesByName: simpleLookupFactory<
    ListHostedZonesByNameResponse,
    "HostedZones"
  >("HostedZones"),
  listResourceRecordSets: simpleLookupFactory<
    ListResourceRecordSetsResponse,
    "ResourceRecordSets"
  >("ResourceRecordSets"),
};

/**
 * SQS Formatters
 */

import type {
  ListQueuesResult,
  ListQueueTagsResult,
  GetQueueAttributesResult,
} from "@aws-sdk/client-sqs";

export type SQSQueue = {
  QueueUrl: string;
  Name?: string;
};
export function formatSQSListQueues({
  QueueUrls,
}: ListQueuesResult): SQSQueue[] | undefined {
  return QueueUrls?.map((queueUrl: string) => ({
    QueueUrl: queueUrl,
    Name: queueUrl.split("/").pop(),
  }));
}

type SQSAttributes = {
  QueueArn?: string;
  Policy?: string;
  RedrivePolicy?: string;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  [Key: string]: any;
};

function formatSQSGetQueueAttributes({ Attributes }: GetQueueAttributesResult) {
  const { QueueArn, Policy, RedrivePolicy, ...remainingAttributes } =
    Attributes as SQSAttributes;
  return {
    QueueArn,
    QueueName: QueueArn?.split(":").pop(),
    Policy: optJSONParse(Policy),
    RedrivePolicy: optJSONParse(RedrivePolicy),
    ...remainingAttributes,
  };
}

export const SQS = {
  listQueues: formatSQSListQueues,
  listQueueTags: simpleLookupFactory<ListQueueTagsResult, "Tags">("Tags"),
  getQueueAttributes: formatSQSGetQueueAttributes,
};

/**
 * SNS Formatters
 */

import type {
  ListTopicsResponse,
  GetTopicAttributesResponse,
  ListSubscriptionsByTopicResponse,
} from "@aws-sdk/client-sns";

export const SNS = {
  listTopics: simpleLookupFactory<ListTopicsResponse, "Topics">("Topics"),
  getTopicAttributes: simpleLookupFactory<
    GetTopicAttributesResponse,
    "Attributes"
  >("Attributes"),
  listSubscriptionByTopic: simpleLookupFactory<
    ListSubscriptionsByTopicResponse,
    "Subscriptions"
  >("Subscriptions"),
};

/**
 * EC2 Formatters
 */
import type {
  DescribeAvailabilityZonesResult,
  DescribeSubnetsResult,
  DescribeVpcsResult,
} from "@aws-sdk/client-ec2";

export const EC2 = {
  describeVPCs: simpleLookupFactory<DescribeVpcsResult, "Vpcs">("Vpcs"),
  describeSubnets: simpleLookupFactory<DescribeSubnetsResult, "Subnets">(
    "Subnets",
  ),
  describeAvailabilityZones: simpleLookupFactory<
    DescribeAvailabilityZonesResult,
    "AvailabilityZones"
  >("AvailabilityZones"),
};

/**
 * Autoscaling Formatters
 */

import type { DescribeAutoScalingGroupsCommandOutput } from "@aws-sdk/client-auto-scaling";

export const AutoScaling = {
  describeAutoScalingGroups: simpleLookupFactory<
    DescribeAutoScalingGroupsCommandOutput,
    "AutoScalingGroups"
  >("AutoScalingGroups"),
};

/**
 * ApiGateway Formatters
 */

import type {
  GetApisCommandOutput,
  GetDomainNamesCommandOutput,
} from "@aws-sdk/client-apigatewayv2";

export const ApiGatewayV2 = {
  getApis: simpleLookupFactory<GetApisCommandOutput, "Items">("Items"),
  getDomainNames: simpleLookupFactory<GetDomainNamesCommandOutput, "Items">(
    "Items",
  ),
};

/**
 * RDS Formatters
 */

import type { DescribeDBInstancesCommandOutput } from "@aws-sdk/client-rds";

export const RDS = {
  describeDBInstances: simpleLookupFactory<
    DescribeDBInstancesCommandOutput,
    "DBInstances"
  >("DBInstances"),
};

/**
 * Elastic Load Balancing Formatters
 */

import type {
  DescribeListenersOutput,
  DescribeLoadBalancersOutput,
  DescribeRulesOutput,
  DescribeTargetGroupsOutput,
} from "@aws-sdk/client-elastic-load-balancing-v2";

export const ElasticLoadBalancingV2 = {
  describeLoadBalancers: simpleLookupFactory<
    DescribeLoadBalancersOutput,
    "LoadBalancers"
  >("LoadBalancers"),
  describeTargetGroups: simpleLookupFactory<
    DescribeTargetGroupsOutput,
    "TargetGroups"
  >("TargetGroups"),
  describeListeners: simpleLookupFactory<DescribeListenersOutput, "Listeners">(
    "Listeners",
  ),
  describeRules: simpleLookupFactory<DescribeRulesOutput, "Rules">("Rules"),
};

/**
 * DynamoDB Formatters
 */

import type {
  DescribeTableOutput,
  ListTablesOutput,
} from "@aws-sdk/client-dynamodb";

export const DynamoDB = {
  listTables: simpleLookupFactory<ListTablesOutput, "TableNames">("TableNames"),
  describeTable: simpleLookupFactory<DescribeTableOutput, "Table">("Table"),
};
