import type {
  DistributionSummary,
  ListDistributionsCommandOutput,
} from "@aws-sdk/client-cloudfront";
import type {
  HostedZone,
  ListHostedZonesByNameCommandOutput,
  ListResourceRecordSetsCommandOutput,
  ResourceRecordSet,
} from "@aws-sdk/client-route-53";

export type ParameterResolver = {
  Key: string;
  Selector?: string;
  Value?: any;
};

export type EdgeResolver = {
  state: string;
  from: string;
  to: string;
};

export type PaginationToken = {
  request?: string;
  response?: string;
};

export type ServiceGetter = {
  fn: string;
  parameters?: ParameterResolver[];
  formatter?: (state: any) => any;
  paginationToken?: PaginationToken;
};

export type ServiceConfig = {
  service: string;
  key: string;
  getters: ServiceGetter[];
  arnLabel?: string;
  nodes?: string[];
  edges?: EdgeResolver[];
  iamRoles?: string[];
};

export type CloudfrontDistributionSummary = {
  _infrascanLabel?: string;
} & DistributionSummary;

export const GLOBAL_SERVICES: ServiceConfig[] = [
  {
    service: "S3",
    key: "S3",
    getters: [
      {
        fn: "listBuckets",
        formatter: ({ Buckets }) => Buckets,
      },
      {
        fn: "getBucketTagging",
        parameters: [
          {
            Key: "Bucket",
            Selector: "S3|listBuckets|[]._result[].Name",
          },
        ],
      },
      {
        fn: "getBucketNotificationConfiguration",
        parameters: [
          {
            Key: "Bucket",
            Selector: "S3|listBuckets|[]._result[].Name",
          },
        ],
      },
      {
        fn: "getBucketWebsite",
        parameters: [
          {
            Key: "Bucket",
            Selector: "S3|listBuckets|[]._result[].Name",
          },
        ],
      },
      {
        fn: "getBucketAcl",
        parameters: [
          {
            Key: "Bucket",
            Selector: "S3|listBuckets|[]._result[].Name",
          },
        ],
      },
    ],
    nodes: ["S3|listBuckets|[]._result[].{id:Name,name:Name}"],
    edges: [
      {
        state: "S3|getBucketNotificationConfiguration|[]",
        from: "_parameters.Bucket",
        to: "_result.TopicConfigurations | [].{target:TopicArn,name:Id}",
      },
      {
        state: "S3|getBucketNotificationConfiguration|[]",
        from: "_parameters.Bucket",
        to: "_result.QueueConfigurations | [].{target:Queue,name:Id}",
      },
      {
        state: "S3|getBucketNotificationConfiguration|[]",
        from: "_parameters.Bucket",
        to: "_result.LambdaFunctionConfiguration | [].{target:LambdaFunctionArn,name:Id}",
      },
    ],
  },
  {
    service: "CloudFront",
    key: "CloudFront",
    getters: [
      {
        fn: "listDistributions",
        formatter: ({
          DistributionList,
        }: ListDistributionsCommandOutput):
          | CloudfrontDistributionSummary[]
          | undefined => {
          return DistributionList?.Items?.map((distribution) => {
            const distributionQuantity = distribution?.Aliases?.Quantity ?? 0;
            const _infrascanLabel =
              distributionQuantity > 0
                ? distribution?.Aliases?.Items?.[0]
                : distribution.DomainName;
            return {
              ...distribution,
              _infrascanLabel,
            };
          }).filter((distributionItem) => distributionItem != null);
        },
      },
    ],
    nodes: [
      "CloudFront|listDistributions|[]._result[].{id:ARN,name:_infrascanLabel}",
    ],
  },
  {
    service: "Route53",
    key: "Route53",
    getters: [
      {
        fn: "listHostedZonesByName",
        formatter: ({
          HostedZones,
        }: ListHostedZonesByNameCommandOutput): HostedZone[] | undefined =>
          HostedZones,
      },
      {
        fn: "listResourceRecordSets",
        parameters: [
          {
            Key: "HostedZoneId",
            Selector: "Route53|listHostedZonesByName|[]._result[].Id",
          },
        ],
        formatter: ({
          ResourceRecordSets,
        }: ListResourceRecordSetsCommandOutput):
          | ResourceRecordSet[]
          | undefined => ResourceRecordSets,
      },
    ],
    nodes: [
      "Route53|listResourceRecordSets|[]._result[?Type==`A`] | [].{id:Name,name:Name}",
    ],
  },
];

export const REGIONAL_SERVICES: ServiceConfig[] = [
  {
    service: "SQS",
    key: "SQS",
    getters: [
      {
        fn: "listQueues",
        formatter: ({ QueueUrls }) =>
          QueueUrls?.map((queueUrl: string) => ({
            QueueUrl: queueUrl,
            Name: queueUrl.split("/").pop(),
          })),
      },
      {
        fn: "listQueueTags",
        parameters: [
          {
            Key: "QueueUrl",
            Selector: "SQS|listQueues|[]._result[].QueueUrl",
          },
        ],
        formatter: ({ Tags }) => Tags,
      },
      {
        fn: "getQueueAttributes",
        parameters: [
          {
            Key: "QueueUrl",
            Selector: "SQS|listQueues|[]._result[].QueueUrl",
          },
          {
            Key: "AttributeNames",
            Value: ["All"],
          },
        ],
        formatter: ({
          Attributes: {
            QueueArn,
            Policy,
            RedrivePolicy,
            ...remainingAttributes
          },
        }) => ({
          QueueArn,
          // derive queue name
          QueueName: QueueArn.split(":").pop(),
          // Parse JSON documents to allow jmespath interegation
          Policy: JSON.parse(Policy ?? "{}"),
          RedrivePolicy: JSON.parse(RedrivePolicy ?? "{}"),
          ...remainingAttributes,
        }),
      },
    ],
    nodes: ["SQS|getQueueAttributes|[]._result.{id:QueueArn,name:QueueName}"],
    edges: [
      {
        state: "SQS|getQueueAttributes|[]",
        from: "_result.QueueArn",
        // link queue to DLQ
        to: "_result.RedrivePolicy.{target:deadLetterTargetArn}",
      },
    ],
  },
  {
    service: "SNS",
    key: "SNS",
    getters: [
      {
        fn: "listTopics",
        formatter: ({ Topics }) => Topics,
      },
      {
        fn: "getTopicAttributes",
        parameters: [
          {
            Key: "TopicArn",
            Selector: "SNS|listTopics|[]._result[].TopicArn",
          },
        ],
        formatter: ({ Attributes }) => Attributes,
      },
      {
        fn: "listSubscriptionsByTopic",
        parameters: [
          {
            Key: "TopicArn",
            Selector: "SNS|listTopics|[]._result[].TopicArn",
          },
        ],
        formatter: ({ Subscriptions }) => Subscriptions,
      },
      {
        fn: "listTagsForResource",
        parameters: [
          {
            Key: "ResourceArn",
            Selector: "SNS|listTopics|[]._result[].TopicArn",
          },
        ],
      },
    ],
    nodes: ["SNS|listTopics|[]._result[].{id:TopicArn}"],
    edges: [
      {
        state: "SNS|listSubscriptionsByTopic|[]",
        from: "_parameters.TopicArn",
        // filter out non-service subscriptions
        to: "_result[?Protocol!=`https` && Protocol!=`http` && Protocol!=`email` && Protocol!=`email-json` && Protocol!=`sms`] | [].{target:Endpoint,name:SubscriptionArn}",
      },
    ],
  },
  {
    service: "Lambda",
    key: "Lambda",
    getters: [
      {
        fn: "listFunctions",
        paginationToken: {
          request: "Marker",
          response: "NextMarker",
        },
      },
      {
        fn: "getFunction",
        parameters: [
          {
            Key: "FunctionName",
            Selector: "Lambda|listFunctions|[]._result.Functions[].FunctionArn",
          },
        ],
      },
    ],
    nodes: [
      "Lambda|listFunctions|[]._result.Functions[].{id: FunctionArn,name:FunctionName}",
    ],
    iamRoles: [
      "Lambda|getFunction|[]._result.Configuration | [].{arn:Role,executor:FunctionArn}",
    ],
  },

  {
    service: "CloudWatchLogs",
    key: "CloudWatchLogs",
    arnLabel: "logs",
    getters: [
      {
        fn: "describeLogGroups",
        paginationToken: {
          request: "nextToken",
          response: "nextToken",
        },
      },
      {
        fn: "describeSubscriptionFilters",
        parameters: [
          {
            Key: "logGroupName",
            Selector:
              "CloudWatchLogs|describeLogGroups|[]._result.logGroups[].logGroupName",
          },
        ],
        paginationToken: {
          request: "nextToken",
          response: "nextToken",
        },
      },
    ],
    nodes: [
      "CloudWatchLogs|describeSubscriptionFilters|[]._result.subscriptionFilters[].{id:logGroupName,name:logGroupName}",
    ],
    edges: [
      {
        state:
          "CloudWatchLogs|describeSubscriptionFilters|[]._result.subscriptionFilters[]",
        from: "logGroupName",
        to: "{target:destinationArn}",
      },
    ],
  },
  {
    service: "EC2",
    key: "EC2-Networking",
    getters: [
      {
        fn: "describeVpcs",
        formatter: ({ Vpcs }) => Vpcs,
      },
      {
        fn: "describeAvailabilityZones",
      },
      {
        fn: "describeSubnets",
        formatter: ({ Subnets }) => Subnets,
      },
    ],
  },
  {
    service: "AutoScaling",
    key: "AutoScaling",
    getters: [
      {
        fn: "describeAutoScalingGroups",
        formatter: ({ AutoScalingGroups }) => AutoScalingGroups,
      },
    ],
    // nodes: ["AutoScaling|describeAutoScalingGroups|[].{id:AutoScalingGroupARN}"],
  },
  {
    service: "ApiGatewayV2",
    key: "ApiGateway",
    getters: [
      {
        fn: "getApis",
        formatter: ({ Items }) => Items,
      },
      {
        fn: "getDomainNames",
        formatter: ({ Items }) => Items,
      },
    ],
    nodes: ["ApiGatewayV2|getApis|[]._result | [].{id:ApiEndpoint}"],
  },
  {
    service: "RDS",
    key: "RDS",
    getters: [
      {
        fn: "describeDBInstances",
        formatter: ({ DBInstances }) => DBInstances,
      },
    ],
    nodes: [
      "RDS|describeDBInstances|[]._result | [].{id:DBInstanceIdentifier,name:DBName}",
    ],
  },
  {
    service: "ELBv2",
    key: "ELB",
    getters: [
      {
        fn: "describeLoadBalancers",
        formatter: ({ LoadBalancers }) => LoadBalancers,
      },
      {
        fn: "describeTargetGroups",
        parameters: [
          {
            Key: "LoadBalancerArn",
            Selector:
              "ELBv2|describeLoadBalancers|[]._result[].LoadBalancerArn",
          },
        ],
        formatter: ({ TargetGroups }) => TargetGroups,
      },
      {
        fn: "describeListeners",
        parameters: [
          {
            Key: "LoadBalancerArn",
            Selector:
              "ELBv2|describeLoadBalancers|[]._result[].LoadBalancerArn",
          },
        ],
        formatter: ({ Listeners }) => Listeners,
      },
      {
        fn: "describeRules",
        parameters: [
          {
            Key: "ListenerArn",
            Selector: "ELBv2|describeListeners|[]._result[].ListenerArn",
          },
        ],
        formatter: ({ Rules }) => Rules,
      },
    ],
    nodes: [
      "ELBv2|describeLoadBalancers|[]._result | [].{id:LoadBalancerArn}",
      // "ELBv2|describeListeners|[] | {id:ListenerArn}",
    ],
  },
  {
    service: "DynamoDB",
    key: "DynamoDB",
    getters: [
      {
        fn: "listTables",
        formatter: ({ TableNames }) => TableNames,
      },
      {
        fn: "describeTable",
        parameters: [
          {
            Key: "TableName",
            Selector: "DynamoDB|listTables|[]._result[]",
          },
        ],
        formatter: ({ Table }) => Table,
      },
    ],
    nodes: ["DynamoDB|describeTable|[].{id:_result.TableArn}"],
  },
  {
    service: "ECS",
    key: "ECS-Cluster",
    getters: [
      {
        fn: "listClusters",
      },
      {
        fn: "describeClusters",
        parameters: [
          {
            Key: "clusters",
            Selector: "ECS|listClusters|[]._result.clusterArns",
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
      "ECS|describeClusters|[]._result.clusters | [].{id:clusterArn,name:clusterName,info:@}",
    ],
  },
  {
    service: "ECS",
    key: "ECS-Services",
    getters: [
      {
        fn: "listServices",
        parameters: [
          {
            Key: "cluster",
            Selector: "ECS|listClusters|[]._result.clusterArns[]",
          },
        ],
      },
      {
        fn: "describeServices",
        parameters: [
          {
            Key: "cluster",
            Selector: "ECS|listServices|[]._parameters.cluster",
          },
          {
            Key: "services",
            // There's an upper limit here of 10 services, will need to add some support for
            // paginating based on parameters as well as by API responses.
            // Max: 10
            Selector: "ECS|listServices|[]._result.serviceArns",
          },
          {
            Key: "include",
            Value: ["TAGS"],
          },
        ],
      },
    ],
    nodes: [
      "ECS|describeServices|[]._result.services | [].{id:serviceArn,parent:clusterArn,name:serviceName,info:@}",
    ],
  },
  {
    service: "ECS",
    key: "ECS-Tasks",
    getters: [
      {
        fn: "listTasks",
        parameters: [
          {
            Key: "cluster",
            Selector: "ECS|listClusters|[]._result.clusterArns[]",
          },
        ],
      },
      {
        fn: "describeTasks",
        parameters: [
          {
            Key: "cluster",
            Selector: "ECS|listTasks|[]._parameters.cluster",
          },
          {
            Key: "tasks",
            Selector: "ECS|listTasks|[]._result.taskArns",
          },
        ],
      },
      {
        fn: "describeTaskDefinition",
        parameters: [
          {
            Key: "taskDefinition",
            Selector: "ECS|describeTasks|[]._result.tasks[].taskDefinitionArn",
          },
          {
            Key: "include",
            Value: ["TAGS"],
          },
        ],
      },
    ],
    nodes: [
      // use describe services as source of ECS Task nodes to create parent relationship
      "ECS|describeServices|[]._result.services | [].{id:taskDefinition,parent:serviceArn}",
    ],
    iamRoles: [
      "ECS|describeTaskDefinition|[]._result.taskDefinition | [].{arn:taskRoleArn,executor:taskDefinitionArn}",
      "ECS|describeTaskDefinition|[]._result.taskDefinition | [].{arn:executionRoleArn,executor:taskDefinitionArn}",
    ],
  },
];
