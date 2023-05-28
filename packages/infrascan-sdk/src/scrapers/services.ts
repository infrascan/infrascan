import * as formatters from './formatters';
import type { SupportedServices } from './client';

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
	iamRoleSelectors?: string[];
};

export type ServiceConfig = {
	service: keyof SupportedServices;
	clientKey: string;
	key: string;
	getters: ServiceGetter[];
	arnLabel?: string;
	nodes?: string[];
	edges?: EdgeResolver[];
	iamRoles?: string[];
};

export const GLOBAL_SERVICES: ServiceConfig[] = [
	{
		service: 's3',
		key: 'S3',
		clientKey: 'S3',
		getters: [
			{
				fn: 'listBuckets',
				formatter: formatters.S3.listBuckets,
			},
			{
				fn: 'getBucketTagging',
				parameters: [
					{
						Key: 'Bucket',
						Selector: 'S3|listBuckets|[]._result[].Name',
					},
				],
			},
			{
				fn: 'getBucketNotificationConfiguration',
				parameters: [
					{
						Key: 'Bucket',
						Selector: 'S3|listBuckets|[]._result[].Name',
					},
				],
			},
			{
				fn: 'getBucketWebsite',
				parameters: [
					{
						Key: 'Bucket',
						Selector: 'S3|listBuckets|[]._result[].Name',
					},
				],
			},
			{
				fn: 'getBucketAcl',
				parameters: [
					{
						Key: 'Bucket',
						Selector: 'S3|listBuckets|[]._result[].Name',
					},
				],
			},
		],
		nodes: ['S3|listBuckets|[]._result[].{id:Name,name:Name}'],
		edges: [
			{
				state: 'S3|getBucketNotificationConfiguration|[]',
				from: '_parameters.Bucket',
				to: '_result.TopicConfigurations | [].{target:TopicArn,name:Id}',
			},
			{
				state: 'S3|getBucketNotificationConfiguration|[]',
				from: '_parameters.Bucket',
				to: '_result.QueueConfigurations | [].{target:Queue,name:Id}',
			},
			{
				state: 'S3|getBucketNotificationConfiguration|[]',
				from: '_parameters.Bucket',
				to: '_result.LambdaFunctionConfiguration | [].{target:LambdaFunctionArn,name:Id}',
			},
		],
	},
	{
		service: 'cloudfront',
		key: 'CloudFront',
		clientKey: 'CloudFront',
		getters: [
			{
				fn: 'listDistributions',
				formatter: formatters.Cloudfront.listDistributions,
			},
		],
		nodes: [
			'CloudFront|listDistributions|[]._result[].{id:ARN,name:_infrascanLabel}',
		],
	},
	{
		service: 'route-53',
		clientKey: 'Route53',
		key: 'Route53',
		getters: [
			{
				fn: 'listHostedZonesByName',
				formatter: formatters.Route53.listHostedZonesByName,
			},
			{
				fn: 'listResourceRecordSets',
				parameters: [
					{
						Key: 'HostedZoneId',
						Selector: 'Route53|listHostedZonesByName|[]._result[].Id',
					},
				],
				formatter: formatters.Route53.listResourceRecordsSets,
			},
		],
		nodes: [
			'Route53|listResourceRecordSets|[]._result[?Type==`A`] | [].{id:Name,name:Name}',
		],
	},
];

export const REGIONAL_SERVICES: ServiceConfig[] = [
	{
		service: 'sqs',
		key: 'SQS',
		clientKey: 'SQS',
		getters: [
			{
				fn: 'listQueues',
				formatter: formatters.SQS.listQueues,
			},
			{
				fn: 'listQueueTags',
				parameters: [
					{
						Key: 'QueueUrl',
						Selector: 'SQS|listQueues|[]._result[].QueueUrl',
					},
				],
				formatter: formatters.SQS.listQueueTags,
			},
			{
				fn: 'getQueueAttributes',
				parameters: [
					{
						Key: 'QueueUrl',
						Selector: 'SQS|listQueues|[]._result[].QueueUrl',
					},
					{
						Key: 'AttributeNames',
						Value: ['All'],
					},
				],
				formatter: formatters.SQS.getQueueAttributes,
			},
		],
		nodes: ['SQS|getQueueAttributes|[]._result.{id:QueueArn,name:QueueName}'],
		edges: [
			{
				state: 'SQS|getQueueAttributes|[]',
				from: '_result.QueueArn',
				// link queue to DLQ
				to: '_result.RedrivePolicy.{target:deadLetterTargetArn}',
			},
		],
	},
	{
		service: 'sns',
		key: 'SNS',
		clientKey: 'SNS',
		getters: [
			{
				fn: 'listTopics',
				formatter: formatters.SNS.listTopics,
			},
			{
				fn: 'getTopicAttributes',
				parameters: [
					{
						Key: 'TopicArn',
						Selector: 'SNS|listTopics|[]._result[].TopicArn',
					},
				],
				formatter: formatters.SNS.getTopicAttributes,
			},
			{
				fn: 'listSubscriptionsByTopic',
				parameters: [
					{
						Key: 'TopicArn',
						Selector: 'SNS|listTopics|[]._result[].TopicArn',
					},
				],
				formatter: formatters.SNS.listSubscriptionByTopic,
			},
			{
				fn: 'listTagsForResource',
				parameters: [
					{
						Key: 'ResourceArn',
						Selector: 'SNS|listTopics|[]._result[].TopicArn',
					},
				],
			},
		],
		nodes: ['SNS|listTopics|[]._result[].{id:TopicArn}'],
		edges: [
			{
				state: 'SNS|listSubscriptionsByTopic|[]',
				from: '_parameters.TopicArn',
				// filter out non-service subscriptions
				to: '_result[?Protocol!=`https` && Protocol!=`http` && Protocol!=`email` && Protocol!=`email-json` && Protocol!=`sms`] | [].{target:Endpoint,name:SubscriptionArn}',
			},
		],
	},
	{
		service: 'lambda',
		clientKey: 'Lambda',
		key: 'Lambda',
		getters: [
			{
				fn: 'listFunctions',
				paginationToken: {
					request: 'Marker',
					response: 'NextMarker',
				},
			},
			{
				fn: 'getFunction',
				parameters: [
					{
						Key: 'FunctionName',
						Selector: 'Lambda|listFunctions|[]._result.Functions[].FunctionArn',
					},
				],
				iamRoleSelectors: ['Configuration.Role'],
			},
		],
		nodes: [
			'Lambda|listFunctions|[]._result.Functions[].{id: FunctionArn,name:FunctionName}',
		],
		iamRoles: [
			'Lambda|getFunction|[]._result.Configuration | [].{arn:Role,executor:FunctionArn}',
		],
	},

	{
		service: 'cloudwatch-logs',
		clientKey: 'CloudWatchLogs',
		key: 'CloudWatchLogs',
		arnLabel: 'logs',
		getters: [
			{
				fn: 'describeLogGroups',
				paginationToken: {
					request: 'nextToken',
					response: 'nextToken',
				},
			},
			{
				fn: 'describeSubscriptionFilters',
				parameters: [
					{
						Key: 'logGroupName',
						Selector:
							'CloudWatchLogs|describeLogGroups|[]._result.logGroups[].logGroupName',
					},
				],
				paginationToken: {
					request: 'nextToken',
					response: 'nextToken',
				},
			},
		],
		nodes: [
			'CloudWatchLogs|describeSubscriptionFilters|[]._result.subscriptionFilters[].{id:logGroupName,name:logGroupName}',
		],
		edges: [
			{
				state:
					'CloudWatchLogs|describeSubscriptionFilters|[]._result.subscriptionFilters[]',
				from: 'logGroupName',
				to: '{target:destinationArn}',
			},
		],
	},
	{
		service: 'ec2',
		clientKey: 'EC2',
		key: 'EC2-Networking',
		getters: [
			{
				fn: 'describeVpcs',
				formatter: formatters.EC2.describeVPCs,
			},
			{
				fn: 'describeAvailabilityZones',
				formatter: formatters.EC2.describeAvailabilityZones,
			},
			{
				fn: 'describeSubnets',
				formatter: formatters.EC2.describeSubnets,
			},
		],
	},
	{
		service: 'auto-scaling',
		clientKey: 'AutoScaling',
		key: 'AutoScaling',
		getters: [
			{
				fn: 'describeAutoScalingGroups',
				formatter: formatters.AutoScaling.describeAutoScalingGroups,
			},
		],
		// nodes: ["AutoScaling|describeAutoScalingGroups|[].{id:AutoScalingGroupARN}"],
	},
	{
		service: 'api-gateway',
		key: 'ApiGateway',
		clientKey: 'APIGateway',
		getters: [
			{
				fn: 'getApis',
				formatter: formatters.ApiGateway.getApis,
			},
			{
				fn: 'getDomainNames',
				formatter: formatters.ApiGateway.getDomainNames,
			},
		],
		nodes: ['ApiGatewayV2|getApis|[]._result | [].{id:ApiEndpoint}'],
	},
	{
		service: 'rds',
		clientKey: 'RDS',
		key: 'RDS',
		getters: [
			{
				fn: 'describeDBInstances',
				formatter: formatters.RDS.describeDBInstances,
			},
		],
		nodes: [
			'RDS|describeDBInstances|[]._result | [].{id:DBInstanceIdentifier,name:DBName}',
		],
	},
	{
		service: 'elastic-load-balancing-v2',
		clientKey: 'ElasticLoadBalancingV2',
		key: 'ELB',
		getters: [
			{
				fn: 'describeLoadBalancers',
				formatter: formatters.ElasticLoadBalancing.describeLoadBalancers,
			},
			{
				fn: 'describeTargetGroups',
				parameters: [
					{
						Key: 'LoadBalancerArn',
						Selector:
							'ELBv2|describeLoadBalancers|[]._result[].LoadBalancerArn',
					},
				],
				formatter: formatters.ElasticLoadBalancing.describeTargetGroups,
			},
			{
				fn: 'describeListeners',
				parameters: [
					{
						Key: 'LoadBalancerArn',
						Selector:
							'ELBv2|describeLoadBalancers|[]._result[].LoadBalancerArn',
					},
				],
				formatter: formatters.ElasticLoadBalancing.describeListeners,
			},
			{
				fn: 'describeRules',
				parameters: [
					{
						Key: 'ListenerArn',
						Selector: 'ELBv2|describeListeners|[]._result[].ListenerArn',
					},
				],
				formatter: formatters.ElasticLoadBalancing.describeRules,
			},
		],
		nodes: [
			'ELBv2|describeLoadBalancers|[]._result | [].{id:LoadBalancerArn}',
			// "ELBv2|describeListeners|[] | {id:ListenerArn}",
		],
	},
	{
		service: 'dynamodb',
		clientKey: 'DynamoDB',
		key: 'DynamoDB',
		getters: [
			{
				fn: 'listTables',
				formatter: formatters.DynamoDB.listTables,
			},
			{
				fn: 'describeTable',
				parameters: [
					{
						Key: 'TableName',
						Selector: 'DynamoDB|listTables|[]._result[]',
					},
				],
				formatter: formatters.DynamoDB.describeTable,
			},
		],
		nodes: ['DynamoDB|describeTable|[].{id:_result.TableArn}'],
	},
	{
		service: 'ecs',
		key: 'ECS-Cluster',
		clientKey: 'ECS',
		getters: [
			{
				fn: 'listClusters',
			},
			{
				fn: 'describeClusters',
				parameters: [
					{
						Key: 'clusters',
						Selector: 'ECS|listClusters|[]._result.clusterArns',
					},
					{
						Key: 'include',
						Value: [
							'ATTACHMENTS',
							'SETTINGS',
							'CONFIGURATIONS',
							'STATISTICS',
							'TAGS',
						],
					},
				],
			},
		],
		nodes: [
			'ECS|describeClusters|[]._result.clusters | [].{id:clusterArn,name:clusterName,info:@}',
		],
	},
	{
		service: 'ecs',
		key: 'ECS-Services',
		clientKey: 'ECS',
		getters: [
			{
				fn: 'listServices',
				parameters: [
					{
						Key: 'cluster',
						Selector: 'ECS|listClusters|[]._result.clusterArns[]',
					},
				],
			},
			{
				fn: 'describeServices',
				parameters: [
					{
						Key: 'cluster',
						Selector: 'ECS|listServices|[]._parameters.cluster',
					},
					{
						Key: 'services',
						// There's an upper limit here of 10 services, will need to add some support for
						// paginating based on parameters as well as by API responses.
						// Max: 10
						Selector: 'ECS|listServices|[]._result.serviceArns',
					},
					{
						Key: 'include',
						Value: ['TAGS'],
					},
				],
			},
		],
		nodes: [
			'ECS|describeServices|[]._result.services | [].{id:serviceArn,parent:clusterArn,name:serviceName,info:@}',
		],
	},
	{
		service: 'ecs',
		key: 'ECS-Tasks',
		clientKey: 'ECS',
		getters: [
			{
				fn: 'listTasks',
				parameters: [
					{
						Key: 'cluster',
						Selector: 'ECS|listClusters|[]._result.clusterArns[]',
					},
				],
			},
			{
				fn: 'describeTasks',
				parameters: [
					{
						Key: 'cluster',
						Selector: 'ECS|listTasks|[]._parameters.cluster',
					},
					{
						Key: 'tasks',
						Selector: 'ECS|listTasks|[]._result.taskArns',
					},
				],
			},
			{
				fn: 'describeTaskDefinition',
				parameters: [
					{
						Key: 'taskDefinition',
						Selector: 'ECS|describeTasks|[]._result.tasks[].taskDefinitionArn',
					},
					{
						Key: 'include',
						Value: ['TAGS'],
					},
				],
				iamRoleSelectors: [
					'taskDefinition.taskRoleArn',
					'taskDefinition.executionRoleArn',
				],
			},
		],
		nodes: [
			// use describe services as source of ECS Task nodes to create parent relationship
			'ECS|describeServices|[]._result.services | [].{id:taskDefinition,parent:serviceArn}',
		],
		iamRoles: [
			'ECS|describeTaskDefinition|[]._result.taskDefinition | [].{arn:taskRoleArn,executor:taskDefinitionArn}',
			'ECS|describeTaskDefinition|[]._result.taskDefinition | [].{arn:executionRoleArn,executor:taskDefinitionArn}',
		],
	},
];
