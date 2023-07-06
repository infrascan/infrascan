import type { ScannerDefinition } from "@infrascan/shared-types";

const SERVICE_SCANNERS: ScannerDefinition[] = [
  {
    service: "s3",
    key: "S3",
    clientKey: "S3",
    isGlobal: true,
    getters: [
      {
        fn: "ListBuckets",
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
  },
  {
    service: "cloudfront",
    key: "CloudFront",
    clientKey: "CloudFront",
    isGlobal: true,
    getters: [
      {
        fn: "ListDistributions",
      },
    ],
    nodes: [
      "CloudFront|ListDistributions|[]._result[].{id:ARN,name:_infrascanLabel}",
    ],
  },
  {
    service: "route-53",
    clientKey: "Route53",
    key: "Route53",
    isGlobal: true,
    getters: [
      {
        fn: "ListHostedZonesByName",
      },
      {
        fn: "ListResourceRecordSets",
        parameters: [
          {
            Key: "HostedZoneId",
            Selector: "Route53|ListHostedZonesByName|[]._result[].Id",
          },
        ],
      },
    ],
    nodes: [
      "Route53|ListResourceRecordSets|[]._result[?Type==`A`] | [].{id:Name,name:Name}",
    ],
  },
  {
    service: "api-gateway",
    key: "ApiGateway",
    clientKey: "APIGateway",
    getters: [
      {
        fn: "GetRestApis",
        formatter: "formatters.ApiGateway.getRestApis",
      },
      {
        fn: "GetDomainNames",
        formatter: "formatters.ApiGateway.getDomainNames",
      },
    ],
    nodes: ["ApiGatewayV2|GetApis|[]._result | [].{id:ApiEndpoint}"],
  },
  {
    service: "auto-scaling",
    clientKey: "AutoScaling",
    key: "AutoScaling",
    getters: [
      {
        fn: "DescribeAutoScalingGroups",
        formatter: "formatters.AutoScaling.describeAutoScalingGroups",
      },
    ],
  },
  {
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
  },
  {
    service: "dynamodb",
    clientKey: "DynamoDB",
    key: "DynamoDB",
    getters: [
      {
        fn: "ListTables",
        formatter: "formatters.DynamoDB.listTables",
      },
      {
        fn: "DescribeTable",
        parameters: [
          {
            Key: "TableName",
            Selector: "DynamoDB|ListTables|[]._result[]",
          },
        ],
        formatter: "formatters.DynamoDB.describeTable",
      },
    ],
    nodes: ["DynamoDB|DescribeTable|[].{id:_result.TableArn}"],
  },
  {
    service: "ec2",
    clientKey: "EC2",
    key: "EC2-Networking",
    isGlobal: false,
    getters: [
      {
        fn: "DescribeVpcs",
        formatter: "formatters.EC2.describeVPCs",
      },
      {
        fn: "DescribeAvailabilityZones",
        formatter: "formatters.EC2.describeAvailabilityZones",
      },
      {
        fn: "DescribeSubnets",
        formatter: "formatters.EC2.describeSubnets",
      },
    ],
  },
  {
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
  },
  {
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
  },
  {
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
    ],
    iamRoles: [
      "ECS|DescribeTaskDefinition|[]._result.taskDefinition | [].{arn:taskRoleArn,executor:taskDefinitionArn}",
      "ECS|DescribeTaskDefinition|[]._result.taskDefinition | [].{arn:executionRoleArn,executor:taskDefinitionArn}",
    ],
  },
  {
    service: "elastic-load-balancing-v2",
    clientKey: "ElasticLoadBalancingV2",
    key: "ELB",
    getters: [
      {
        fn: "DescribeLoadBalancers",
        formatter: "formatters.ElasticLoadBalancing.describeLoadBalancers",
      },
      {
        fn: "DescribeTargetGroups",
        parameters: [
          {
            Key: "LoadBalancerArn",
            Selector:
              "ELBv2|DescribeLoadBalancers|[]._result[].LoadBalancerArn",
          },
        ],
        formatter: "formatters.ElasticLoadBalancing.describeTargetGroups",
      },
      {
        fn: "DescribeListeners",
        parameters: [
          {
            Key: "LoadBalancerArn",
            Selector:
              "ELBv2|DescribeLoadBalancers|[]._result[].LoadBalancerArn",
          },
        ],
        formatter: "formatters.ElasticLoadBalancing.describeListeners",
      },
      {
        fn: "DescribeRules",
        parameters: [
          {
            Key: "ListenerArn",
            Selector: "ELBv2|DescribeListeners|[]._result[].ListenerArn",
          },
        ],
        formatter: "formatters.ElasticLoadBalancing.describeRules",
      },
    ],
    nodes: ["ELBv2|DescribeLoadBalancers|[]._result | [].{id:LoadBalancerArn}"],
  },
  {
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
  },
  {
    service: "rds",
    clientKey: "RDS",
    key: "RDS",
    getters: [
      {
        fn: "DescribeDBInstances",
        formatter: "formatters.RDS.describeDBInstances",
      },
    ],
    nodes: [
      "RDS|DescribeDBInstances|[]._result | [].{id:DBInstanceIdentifier,name:DBName}",
    ],
  },
  {
    service: "sns",
    key: "SNS",
    clientKey: "SNS",
    getters: [
      {
        fn: "ListTopics",
        formatter: "formatters.SNS.listTopics",
      },
      {
        fn: "GetTopicAttributes",
        parameters: [
          {
            Key: "TopicArn",
            Selector: "SNS|ListTopics|[]._result[].TopicArn",
          },
        ],
        formatter: "formatters.SNS.getTopicAttributes",
      },
      {
        fn: "ListSubscriptionsByTopic",
        parameters: [
          {
            Key: "TopicArn",
            Selector: "SNS|ListTopics|[]._result[].TopicArn",
          },
        ],
        formatter: "formatters.SNS.listSubscriptionByTopic",
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
  },
  {
    service: "sqs",
    key: "SQS",
    clientKey: "SQS",
    isGlobal: false,
    getters: [
      {
        fn: "ListQueues",
        formatter: "formatters.SQS.listQueues",
      },
      {
        fn: "ListQueueTags",
        parameters: [
          {
            Key: "QueueUrl",
            Selector: "SQS|ListQueues|[]._result[].QueueUrl",
          },
        ],
        formatter: "formatters.SQS.listQueueTags",
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
        formatter: "formatters.SQS.getQueueAttributes",
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
  },
];

export const GLOBAL_SERVICES = SERVICE_SCANNERS.filter(
  (scanner) => scanner.isGlobal
);
export const REGIONAL_SERVICES = SERVICE_SCANNERS.filter(
  (scanner) => !scanner.isGlobal
);
export default SERVICE_SCANNERS;
