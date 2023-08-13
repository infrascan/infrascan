import type { ScannerDefinition } from "./types";

export * as Formatters from "./formatters";

export type S3Functions =
  | "ListBuckets"
  | "GetBucketTagging"
  | "GetBucketNotificationConfiguration"
  | "GetBucketWebsite"
  | "GetBucketAcl";
const S3Scanner: ScannerDefinition<"S3", S3Functions> = {
  service: "s3",
  key: "S3",
  clientKey: "S3",
  isGlobal: true,
  getters: [
    {
      fn: "ListBuckets",
      formatter: "listBuckets",
    },
    {
      fn: "GetBucketTagging",
      parameters: [
        {
          Key: "Bucket",
          Selector: "S3|ListBuckets|[]._result[].Name",
        },
      ],
    },
    {
      fn: "GetBucketNotificationConfiguration",
      parameters: [
        {
          Key: "Bucket",
          Selector: "S3|ListBuckets|[]._result[].Name",
        },
      ],
    },
    {
      fn: "GetBucketWebsite",
      parameters: [
        {
          Key: "Bucket",
          Selector: "S3|ListBuckets|[]._result[].Name",
        },
      ],
    },
    {
      fn: "GetBucketAcl",
      parameters: [
        {
          Key: "Bucket",
          Selector: "S3|ListBuckets|[]._result[].Name",
        },
      ],
    },
  ],
  nodes: ["S3|ListBuckets|[]._result[].{id:Name,name:Name}"],
  edges: [
    {
      state: "S3|GetBucketNotificationConfiguration|[]",
      from: "_parameters.Bucket",
      to: "_result.TopicConfigurations | [].{target:TopicArn,name:Id}",
    },
    {
      state: "S3|GetBucketNotificationConfiguration|[]",
      from: "_parameters.Bucket",
      to: "_result.QueueConfigurations | [].{target:Queue,name:Id}",
    },
    {
      state: "S3|GetBucketNotificationConfiguration|[]",
      from: "_parameters.Bucket",
      to: "_result.LambdaFunctionConfiguration | [].{target:LambdaFunctionArn,name:Id}",
    },
  ],
};

export type CloudFrontFunctions = "ListDistributions";
const CloudfrontScanner: ScannerDefinition<"CloudFront", CloudFrontFunctions> =
  {
    service: "cloudfront",
    key: "CloudFront",
    clientKey: "CloudFront",
    isGlobal: true,
    getters: [
      {
        fn: "ListDistributions",
        formatter: "listDistributions",
      },
    ],
    nodes: [
      "CloudFront|ListDistributions|[]._result[].{id:ARN,name:_infrascanLabel}",
    ],
  };

export type Route53Functions = "ListHostedZonesByName" | "ListResourceRecordSets";
const Route53Scanner: ScannerDefinition<"Route53", Route53Functions> = {
  service: "route-53",
  clientKey: "Route53",
  key: "Route53",
  isGlobal: true,
  getters: [
    {
      fn: "ListHostedZonesByName",
      formatter: "listHostedZonesByName",
    },
    {
      fn: "ListResourceRecordSets",
      parameters: [
        {
          Key: "HostedZoneId",
          Selector: "Route53|ListHostedZonesByName|[]._result[].Id",
        },
      ],
      formatter: "listResourceRecordSets",
    },
  ],
  nodes: [
    "Route53|ListResourceRecordSets|[]._result[?Type==`A`] | [].{id:Name,name:Name}",
  ],
};

export type ApiGatewayFunctions = "GetApis" | "GetDomainNames";
const ApiGatewayScanner: ScannerDefinition<
  "ApiGatewayV2",
  ApiGatewayFunctions
> = {
  service: "apigatewayv2",
  key: "ApiGateway",
  clientKey: "ApiGatewayV2",
  getters: [
    {
      fn: "GetApis",
      formatter: "getApis",
    },
    {
      fn: "GetDomainNames",
      formatter: "getDomainNames",
    },
  ],
  nodes: ["ApiGatewayV2|GetApis|[]._result | [].{id:ApiEndpoint}"],
};

export type AutoScalingFunctions = "DescribeAutoScalingGroups";
const AutoScalingScanner: ScannerDefinition<
  "AutoScaling",
  AutoScalingFunctions
> = {
  service: "auto-scaling",
  clientKey: "AutoScaling",
  key: "AutoScaling",
  getters: [
    {
      fn: "DescribeAutoScalingGroups",
      formatter: "describeAutoScalingGroups",
    },
  ],
};

export type CloudWatchLogsFunctions =
  | "DescribeLogGroups"
  | "DescribeSubscriptionFilters";
const CloudWatchLogsScanner: ScannerDefinition<
  "CloudWatchLogs",
  CloudWatchLogsFunctions
> = {
  service: "cloudwatch-logs",
  clientKey: "CloudWatchLogs",
  key: "CloudWatchLogs",
  arnLabel: "logs",
  getters: [
    {
      fn: "DescribeLogGroups",
      paginationToken: {
        request: "nextToken",
        response: "nextToken",
      },
    },
    {
      fn: "DescribeSubscriptionFilters",
      parameters: [
        {
          Key: "logGroupName",
          Selector:
            "CloudWatchLogs|DescribeLogGroups|[]._result.logGroups[].logGroupName",
        },
      ],
      paginationToken: {
        request: "nextToken",
        response: "nextToken",
      },
    },
  ],
  nodes: [
    "CloudWatchLogs|DescribeSubscriptionFilters|[]._result.subscriptionFilters[].{id:logGroupName,name:logGroupName}",
  ],
  edges: [
    {
      state:
        "CloudWatchLogs|DescribeSubscriptionFilters|[]._result.subscriptionFilters[]",
      from: "logGroupName",
      to: "{target:destinationArn}",
    },
  ],
};

export type DynamoDbFunctions = "ListTables" | "DescribeTable";
const DynamoDbScanner: ScannerDefinition<"DynamoDB", DynamoDbFunctions> = {
  service: "dynamodb",
  clientKey: "DynamoDB",
  key: "DynamoDB",
  getters: [
    {
      fn: "ListTables",
      formatter: "listTables",
    },
    {
      fn: "DescribeTable",
      parameters: [
        {
          Key: "TableName",
          Selector: "DynamoDB|ListTables|[]._result[]",
        },
      ],
      formatter: "describeTable",
    },
  ],
  nodes: ["DynamoDB|DescribeTable|[].{id:_result.TableArn}"],
};

export type EC2Functions =
  | "DescribeVpcs"
  | "DescribeAvailabilityZones"
  | "DescribeSubnets";
const EC2Scanner: ScannerDefinition<"EC2", EC2Functions> = {
  service: "ec2",
  clientKey: "EC2",
  key: "EC2-Networking",
  isGlobal: false,
  getters: [
    {
      fn: "DescribeVpcs",
      formatter: "describeVPCs",
    },
    {
      fn: "DescribeAvailabilityZones",
      formatter: "describeAvailabilityZones",
    },
    {
      fn: "DescribeSubnets",
      formatter: "describeSubnets",
    },
  ],
};

export type ECSClusterFunctions = "ListClusters" | "DescribeClusters";
const ECSClusterScanner: ScannerDefinition<"ECS", ECSClusterFunctions> = {
  service: "ecs",
  key: "ECS-Cluster",
  clientKey: "ECS",
  getters: [
    {
      fn: "ListClusters",
    },
    {
      fn: "DescribeClusters",
      parameters: [
        {
          Key: "clusters",
          Selector: "ECS|ListClusters|[]._result.clusterArns",
        },
        {
          Key: "include",
          Value: [
            "ATTACHMENTS",
            "SETTINGS",
            "CONFIGURATIONS",
            "STATISTICS",
            "TAGS",
          ],
        },
      ],
    },
  ],
  nodes: [
    "ECS|DescribeClusters|[]._result.clusters | [].{id:clusterArn,name:clusterName,info:@}",
  ],
};

export type ECSServiceFunctions = "ListServices" | "DescribeServices";
const ECSServiceScanner: ScannerDefinition<
  "ECS",
  ECSServiceFunctions | ECSClusterFunctions
> = {
  service: "ecs",
  key: "ECS-Services",
  clientKey: "ECS",
  getters: [
    {
      fn: "ListServices",
      parameters: [
        {
          Key: "cluster",
          Selector: "ECS|ListClusters|[]._result.clusterArns[]",
        },
        {
          Key: "maxResults",
          Value: 100,
        },
      ],
    },
    {
      fn: "DescribeServices",
      parameters: [
        {
          Key: "cluster",
          Selector: "ECS|ListServices|[]._parameters.cluster",
        },
        {
          Key: "services",
          Selector: "ECS|ListServices|[]._result.serviceArns",
        },
        {
          Key: "include",
          Value: ["TAGS"],
        },
      ],
    },
  ],
  nodes: [
    "ECS|DescribeServices|[]._result.services | [].{id:serviceArn,parent:clusterArn,name:serviceName,info:@}",
  ],
};

export type ECSTaskFunctions =
  | "ListTasks"
  | "DescribeTasks"
  | "DescribeTaskDefinition";
const ECSTaskScanner: ScannerDefinition<
  "ECS",
  ECSTaskFunctions | ECSServiceFunctions | ECSClusterFunctions
> = {
  service: "ecs",
  key: "ECS-Tasks",
  clientKey: "ECS",
  getters: [
    {
      fn: "ListTasks",
      parameters: [
        {
          Key: "cluster",
          Selector: "ECS|ListClusters|[]._result.clusterArns[]",
        },
      ],
    },
    {
      fn: "DescribeTasks",
      parameters: [
        {
          Key: "cluster",
          Selector: "ECS|ListTasks|[]._parameters.cluster",
        },
        {
          Key: "tasks",
          Selector: "ECS|ListTasks|[]._result.taskArns",
        },
      ],
    },
    {
      fn: "DescribeTaskDefinition",
      parameters: [
        {
          Key: "taskDefinition",
          Selector: "ECS|DescribeTasks|[]._result.tasks[].taskDefinitionArn",
        },
        {
          Key: "include",
          Value: ["TAGS"],
        },
      ],
      iamRoleSelectors: [
        "taskDefinition.taskRoleArn",
        "taskDefinition.executionRoleArn",
      ],
    },
  ],
  nodes: [
    "ECS|DescribeServices|[]._result.services | [].{id:taskDefinition,parent:serviceArn}",
    "ECS|DescribeTasks|[]._result.tasks | [].{id:taskDefinitionArn,parent:clusterArn}",
  ],
  iamRoles: [
    "ECS|DescribeTaskDefinition|[]._result.taskDefinition | [].{arn:taskRoleArn,executor:taskDefinitionArn}",
    "ECS|DescribeTaskDefinition|[]._result.taskDefinition | [].{arn:executionRoleArn,executor:taskDefinitionArn}",
  ],
};

export type ElasticLoadBalancingFunctions =
  | "DescribeLoadBalancers"
  | "DescribeTargetGroups"
  | "DescribeListeners"
  | "DescribeRules";
const ElasticLoadBalancingScanner: ScannerDefinition<
  "ElasticLoadBalancingV2",
  ElasticLoadBalancingFunctions
> = {
  service: "elastic-load-balancing-v2",
  clientKey: "ElasticLoadBalancingV2",
  key: "ELB",
  getters: [
    {
      fn: "DescribeLoadBalancers",
      formatter: "describeLoadBalancers",
    },
    {
      fn: "DescribeTargetGroups",
      parameters: [
        {
          Key: "LoadBalancerArn",
          Selector:
            "ElasticLoadBalancingV2|DescribeLoadBalancers|[]._result[].LoadBalancerArn",
        },
      ],
      formatter: "describeTargetGroups",
    },
    {
      fn: "DescribeListeners",
      parameters: [
        {
          Key: "LoadBalancerArn",
          Selector:
            "ElasticLoadBalancingV2|DescribeLoadBalancers|[]._result[].LoadBalancerArn",
        },
      ],
      formatter: "describeListeners",
    },
    {
      fn: "DescribeRules",
      parameters: [
        {
          Key: "ListenerArn",
          Selector:
            "ElasticLoadBalancingV2|DescribeListeners|[]._result[].ListenerArn",
        },
      ],
      formatter: "describeRules",
    },
  ],
  nodes: [
    "ElasticLoadBalancingV2|DescribeLoadBalancers|[]._result | [].{id:LoadBalancerArn,name:LoadBalancerName}",
  ],
};

export type LambdaFunctions = "ListFunctions" | "GetFunction";
const LambdaScanner: ScannerDefinition<"Lambda", LambdaFunctions> = {
  service: "lambda",
  clientKey: "Lambda",
  key: "Lambda",
  isGlobal: false,
  getters: [
    {
      fn: "ListFunctions",
      paginationToken: {
        request: "Marker",
        response: "NextMarker",
      },
    },
    {
      fn: "GetFunction",
      parameters: [
        {
          Key: "FunctionName",
          Selector: "Lambda|ListFunctions|[]._result.Functions[].FunctionArn",
        },
      ],
      iamRoleSelectors: ["Configuration.Role"],
    },
  ],
  nodes: [
    "Lambda|ListFunctions|[]._result.Functions[].{id: FunctionArn,name:FunctionName}",
  ],
  iamRoles: [
    "Lambda|GetFunction|[]._result.Configuration | [].{arn:Role,executor:FunctionArn}",
  ],
};

export type RDSFunctions = "DescribeDBInstances";
const RDSScanner: ScannerDefinition<"RDS", RDSFunctions> = {
  service: "rds",
  clientKey: "RDS",
  key: "RDS",
  getters: [
    {
      fn: "DescribeDBInstances",
      formatter: "describeDBInstances",
    },
  ],
  nodes: [
    "RDS|DescribeDBInstances|[]._result | [].{id:DBInstanceIdentifier,name:DBName}",
  ],
};

export type SNSFunctions =
  | "ListTopics"
  | "GetTopicAttributes"
  | "ListSubscriptionsByTopic"
  | "ListTagsForResource";
const SNSScanner: ScannerDefinition<"SNS", SNSFunctions> = {
  service: "sns",
  key: "SNS",
  clientKey: "SNS",
  getters: [
    {
      fn: "ListTopics",
      formatter: "listTopics",
    },
    {
      fn: "GetTopicAttributes",
      parameters: [
        {
          Key: "TopicArn",
          Selector: "SNS|ListTopics|[]._result[].TopicArn",
        },
      ],
      formatter: "getTopicAttributes",
    },
    {
      fn: "ListSubscriptionsByTopic",
      parameters: [
        {
          Key: "TopicArn",
          Selector: "SNS|ListTopics|[]._result[].TopicArn",
        },
      ],
      formatter: "listSubscriptionByTopic",
    },
    {
      fn: "ListTagsForResource",
      parameters: [
        {
          Key: "ResourceArn",
          Selector: "SNS|ListTopics|[]._result[].TopicArn",
        },
      ],
    },
  ],
  nodes: ["SNS|ListTopics|[]._result[].{id:TopicArn}"],
  edges: [
    {
      state: "SNS|ListSubscriptionsByTopic|[]",
      from: "_parameters.TopicArn",
      to: "_result[?Protocol!=`https` && Protocol!=`http` && Protocol!=`email` && Protocol!=`email-json` && Protocol!=`sms`] | [].{target:Endpoint,name:SubscriptionArn}",
    },
  ],
};

export type SQSFunctions = "ListQueues" | "ListQueueTags" | "GetQueueAttributes";
const SQSScanner: ScannerDefinition<"SQS", SQSFunctions> = {
  service: "sqs",
  key: "SQS",
  clientKey: "SQS",
  isGlobal: false,
  getters: [
    {
      fn: "ListQueues",
      formatter: "listQueues",
    },
    {
      fn: "ListQueueTags",
      parameters: [
        {
          Key: "QueueUrl",
          Selector: "SQS|ListQueues|[]._result[].QueueUrl",
        },
      ],
      formatter: "listQueueTags",
    },
    {
      fn: "GetQueueAttributes",
      parameters: [
        {
          Key: "QueueUrl",
          Selector: "SQS|ListQueues|[]._result[].QueueUrl",
        },
        {
          Key: "AttributeNames",
          Value: ["All"],
        },
      ],
      formatter: "getQueueAttributes",
    },
  ],
  nodes: ["SQS|GetQueueAttributes|[]._result.{id:QueueArn,name:QueueName}"],
  edges: [
    {
      state: "SQS|GetQueueAttributes|[]",
      from: "_result.QueueArn",
      to: "_result.RedrivePolicy.{target:deadLetterTargetArn}",
    },
  ],
};

export type GenericScanner =
  | ScannerDefinition<"S3", S3Functions>
  | ScannerDefinition<"CloudFront", "ListDistributions">
  | ScannerDefinition<"Route53", Route53Functions>
  | ScannerDefinition<"ApiGatewayV2", ApiGatewayFunctions>
  | ScannerDefinition<"AutoScaling", "DescribeAutoScalingGroups">
  | ScannerDefinition<"CloudWatchLogs", CloudWatchLogsFunctions>
  | ScannerDefinition<"DynamoDB", DynamoDbFunctions>
  | ScannerDefinition<"EC2", EC2Functions>
  | ScannerDefinition<
      "ECS",
      ECSClusterFunctions | ECSServiceFunctions | ECSTaskFunctions
    >
  | ScannerDefinition<"ElasticLoadBalancingV2", ElasticLoadBalancingFunctions>
  | ScannerDefinition<"Lambda", LambdaFunctions>
  | ScannerDefinition<"RDS", "DescribeDBInstances">
  | ScannerDefinition<"SNS", SNSFunctions>
  | ScannerDefinition<"SQS", SQSFunctions>;

const SERVICE_SCANNERS: GenericScanner[] = [
  S3Scanner,
  CloudfrontScanner,
  Route53Scanner,
  ApiGatewayScanner,
  AutoScalingScanner,
  CloudWatchLogsScanner,
  DynamoDbScanner,
  EC2Scanner,
  ECSClusterScanner,
  ECSServiceScanner,
  ECSTaskScanner,
  ElasticLoadBalancingScanner,
  LambdaScanner,
  RDSScanner,
  SNSScanner,
  SQSScanner,
];

export const GLOBAL_SERVICES = SERVICE_SCANNERS.filter(
  (scanner) => scanner.isGlobal
);
export const REGIONAL_SERVICES = SERVICE_SCANNERS.filter(
  (scanner) => !scanner.isGlobal
);
export default SERVICE_SCANNERS;
