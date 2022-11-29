const SERVICES_CONFIG = [
  {
    service: "SQS",
    key: "SQS",
    getters: [
      {
        fn: "listQueues",
        formatter: ({ QueueUrls }) =>
          QueueUrls.map((queueUrl) => ({
            QueueUrl: queueUrl,
            Name: queueUrl.split("/").pop(),
          })),
      },
      {
        fn: "listQueueTags",
        parameters: [
          {
            Key: "QueueUrl",
            Selector: "SQS|listQueues|_result[].QueueUrl",
          },
        ],
        formatter: ({ Tags }) => Tags,
      },
      {
        fn: "getQueueAttributes",
        parameters: [
          {
            Key: "QueueUrl",
            Selector: "SQS|listQueues|_result[].QueueUrl",
          },
          {
            Key: "AttributeNames",
            Value: ["All"],
          },
        ],
        formatter: ({ Attributes }) => Attributes,
      },
    ],
    nodes: ["SQS|getQueueAttributes|[]._result.QueueArn"],
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
            Selector: "SNS|listTopics|_result[].TopicArn",
          },
        ],
        formatter: ({ Attributes }) => Attributes,
      },
      {
        fn: "listSubscriptionsByTopic",
        parameters: [
          {
            Key: "TopicArn",
            Selector: "SNS|listTopics|_result[].TopicArn",
          },
        ],
        formatter: ({ Subscriptions }) => Subscriptions,
      },
      {
        fn: "listTagsForResource",
        parameters: [
          {
            Key: "ResourceArn",
            Selector: "SNS|listTopics|_result[].TopicArn",
          },
        ],
      },
    ],
    nodes: ["SNS|listTopics|_result[].TopicArn"],
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
        formatter: ({ Functions }) => Functions,
      },
      {
        fn: "getFunction",
        parameters: [
          {
            Key: "FunctionName",
            Selector: "Lambda|listFunctions|_result[].FunctionArn",
          },
        ],
        iamRoleSelector: "Configuration.Role",
      },
    ],
    nodes: ["Lambda|listFunctions|_result[].FunctionArn"],
  },
  {
    service: "S3",
    key: "S3",
    getters: [
      {
        fn: "listBuckets",
        formatter: ({ Buckets }) => Buckets,
      },
      {
        fn: "getBucketNotificationConfiguration",
        parameters: [
          {
            Key: "Bucket",
            Selector: "S3|listBuckets|_result[].Name",
          },
        ],
      },
      {
        fn: "getBucketWebsite",
        parameters: [
          {
            Key: "Bucket",
            Selector: "S3|listBuckets|_result[].Name",
          },
        ],
      },
      {
        fn: "getBucketAcl",
        parameters: [
          {
            Key: "Bucket",
            Selector: "S3|listBuckets|_result[].Name",
          },
        ],
      },
    ],
    nodes: ["S3|listBuckets|_result[].Name"],
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
        formatter: ({ DistributionList }) => DistributionList.Items,
      },
    ],
    nodes: ["CloudFront|listDistributions|_result[].ARN"],
  },
  {
    service: "EC2",
    key: "EC2-Networking",
    getters: [
      {
        fn: "describeSubnets",
        formatter: ({ Subnets }) => Subnets,
      },
      {
        fn: "describeVpcs",
        formatter: ({ Vpcs }) => Vpcs,
      },
    ],
    // nodes: ["EC2|describeSubnets|[].SubnetId", "EC2|describeVpcs|[].VpcId"],
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
    // nodes: ["AutoScaling|describeAutoScalingGroups|[].AutoScalingGroupARN"],
  },
  {
    service: "ApiGatewayV2",
    key: "ApiGateway",
    getters: [
      {
        fn: "getApis",
        formatter: ({ Items }) => Items,
      },
    ],
    nodes: ["ApiGatewayV2|getApis|_result[].ApiEndpoint"],
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
    nodes: ["RDS|describeDBInstances|_result[].DBInstanceIdentifier"],
  },
  {
    service: "Route53",
    key: "Route53",
    getters: [
      {
        fn: "listHostedZonesByName",
        formatter: ({ HostedZones }) => HostedZones,
      },
      {
        fn: "listResourceRecordSets",
        parameters: [
          {
            Key: "HostedZoneId",
            Selector: "Route53|listHostedZonesByName|_result[].Id",
          },
        ],
        formatter: ({ ResourceRecordSets }) => ResourceRecordSets,
      },
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
            Selector: "ELBv2|describeLoadBalancers|_result[].LoadBalancerArn",
          },
        ],
        formatter: ({ TargetGroups }) => TargetGroups,
      },
      {
        fn: "describeListeners",
        parameters: [
          {
            Key: "LoadBalancerArn",
            Selector: "ELBv2|describeLoadBalancers|_result[].LoadBalancerArn",
          },
        ],
        formatter: ({ Listeners }) => Listeners,
      },
      {
        fn: "describeRules",
        parameters: [
          {
            Key: "ListenerArn",
            Selector: "ELBv2|describeListeners|_result[].ListenerArn",
          },
        ],
        formatter: ({ Rules }) => Rules,
      },
    ],
    nodes: [
      "ELBv2|describeLoadBalancers|_result[].LoadBalancerArn",
      // "ELBv2|describeListeners|[].ListenerArn",
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
            Selector: "DynamoDB|listTables|_result",
          },
        ],
        formatter: ({ Table }) => Table,
      },
    ],
    nodes: ["DynamoDB|describeTable|[]._result.TableArn"],
  },
];

module.exports = {
  SERVICES_CONFIG,
};
