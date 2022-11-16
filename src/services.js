const SERVICES_CONFIG = [
  {
    service: "SQS",
    fn: "listQueues",
    formatter: ({ QueueUrls }) => QueueUrls.map((queueUrl) => ({
      QueueUrl: queueUrl,
      Name: queueUrl.split('/').pop()
    }))
  },
  {
    service: "SQS",
    fn: "listQueueTags",
    parameters: [
      {
        Key: "QueueUrl", 
        Selector: "SQS|listQueues|[].QueueUrl"
      }
    ],
    formatter: ({ Tags }) => Tags
  },
  {
    service: "SNS",
    fn: "listTopics",
    formatter: ({ Topics }) => Topics
  },
  {
    service: "SNS",
    fn: "getTopicAttributes",
    parameters: [
      {
        Key: "TopicArn",
        Selector: "SNS|listTopics|[].TopicArn"
      }
    ],
    formatter: ({ Attributes }) => Attributes
  },
  {
    service: "SNS",
    fn: "listSubscriptionsByTopic",
    parameters: [
      {
        Key: "TopicArn",
        Selector: "SNS|listTopics|[].TopicArn"
      }
    ],
    formatter: ({ Subscriptions }) => Subscriptions
  },
  {
    service: "SNS",
    fn: "listTagsForResource",
    parameters: [
      {
        Key: "ResourceArn",
        Selector: "SNS|listTopics|[].TopicArn"
      }
    ]
  },
  {
    service: "Lambda",
    fn: "listFunctions",
    formatter: ({ Functions }) => Functions
  },
  {
    service: "Lambda",
    fn: "getFunction",
    parameters: [
      {
        Key: "FunctionName",
        Selector: "Lambda|listFunctions|[].FunctionArn"
      }
    ],
    iamRoleSelector: "Configuration.Role"
  },
  {
    service: "S3",
    fn: "listBuckets",
    formatter: ({ Buckets }) => Buckets
  },
  {
    service: "S3",
    fn: "getBucketNotificationConfiguration",
    parameters: [
      {
        Key: "Bucket",
        Selector: "S3|listBuckets|[].Name"
      }
    ]
  },
  {
    service: "S3",
    fn: "getBucketWebsite",
    parameters: [
      {
        Key: "Bucket",
        Selector: "S3|listBuckets|[].Name"
      }
    ]
  },
  {
    service: "S3",
    fn: "getBucketAcl",
    parameters: [
      {
        Key: "Bucket",
        Selector: "S3|listBuckets|[].Name"
      }
    ]
  },
  {
    service: "CloudFront",
    fn: "listDistributions"
  },
  {
    service: "EC2",
    fn: "describeVpcs",
    formatter: ({ Vpcs }) => Vpcs
  },
  {
    service: "EC2",
    fn: "describeSubnets",
    formatter: ({ Subnets }) => Subnets
  },
  {
    service: "AutoScaling",
    fn: "describeAutoScalingGroups",
    formatter: ({ AutoScalingGroups }) => AutoScalingGroups
  },
  {
    service: "ApiGatewayV2",
    fn: "getApis",
    formatter: ({ Items }) => Items
  },
  {
    service: "RDS",
    fn: "describeDBInstances",
    formatter: ({ DBInstances }) => DBInstances
  },
  {
    service: "Route53",
    fn: "listHostedZonesByName",
    formatter: ({ HostedZones }) => HostedZones
  },
  {
    service: "Route53",
    fn: "listResourceRecordSets",
    parameters: [
      {
        Key: "HostedZoneId",
        Selector: "Route53|listHostedZonesByName|[].Id"
      }
    ],
    formatter: ({ ResourceRecordSets }) => ResourceRecordSets
  },
  {
    service: "ELBv2",
    fn: "describeLoadBalancers",
    formatter: ({ LoadBalancers }) => LoadBalancers
  },
  {
    service: "ELBv2",
    fn: "describeTargetGroups",
    parameters: [
      {
        Key: "LoadBalancerArn",
        Selector: "ELBv2|describeLoadBalancers|[].LoadBalancerArn"
      }
    ],
    formatter: ({ TargetGroups }) => TargetGroups
  },
  {
    service: "ELBv2",
    fn: "describeListeners",
    parameters: [
      {
        Key: "LoadBalancerArn",
        Selector: "ELBv2|describeLoadBalancers|[].LoadBalancerArn"
      }
    ],
    formatter: ({ Listeners }) => Listeners
  },
  {
    service: "ELBv2",
    fn: "describeRules",
    parameters: [
      {
        Key: "ListenerArn",
        Selector: "ELBv2|describeListeners|[].ListenerArn"
      }
    ],
    formatter: ({ Rules }) => Rules
  },
  {
    service: "DynamoDB",
    fn: "listTables",
    formatter: ({ TableNames }) => TableNames
  },
  {
    service: "DynamoDB",
    fn: "describeTable",
    parameters: [
      {
        Key: "TableName",
        Selector: "DynamoDB|listTables|[]"
      }
    ],
    formatter: ({ Table }) => Table
  }
];

module.exports = {
  SERVICES_CONFIG
}