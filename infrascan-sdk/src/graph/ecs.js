/**
 * Handles the custom logic for generating edges between ECS nodes and the services they touch
 * as this logic is too messy to define in the config as normal
 * For now, only services will be rendered as nodes, within their clusters
 * but the edges will be generated using the roles from their tasks
 */

const {
	generateEdgesForRole,
	formatEdge,
	sanitizeId,
} = require('./graphUtilities');
const { evaluateSelector } = require('../utils');

function generateEdgesForECSResources(getGlobalStateForServiceAndFunction) {
	const ecsServiceRecords = getGlobalStateForServiceAndFunction(
		'ECS',
		'describeServices'
	).flatMap(({ _result }) => _result.services);

	const ecsTaskDefinitionRecords = getGlobalStateForServiceAndFunction(
		'ECS',
		'describeTaskDefinition'
	).flatMap(({ _result }) => _result.taskDefinition);

	const taskRoleEdges = ecsServiceRecords.flatMap(({ taskDefinition }) => {
		const matchedTaskDef = ecsTaskDefinitionRecords.find(
			({ taskDefinitionArn }) => taskDefinitionArn === taskDefinition
		);

		let taskEdges = [];
		if (matchedTaskDef?.taskRoleArn) {
			taskEdges = taskEdges.concat(
				generateEdgesForRole(
					matchedTaskDef.taskRoleArn,
					matchedTaskDef.taskDefinitionArn,
					getGlobalStateForServiceAndFunction
				)
			);
		}
		if (matchedTaskDef?.executionRoleArn) {
			taskEdges = taskEdges.concat(
				generateEdgesForRole(
					matchedTaskDef.executionRoleArn,
					matchedTaskDef.taskDefinitionArn,
					getGlobalStateForServiceAndFunction
				)
			);
		}

		return taskEdges;
	});

	const loadBalancedECSServices = ecsServiceRecords.filter(
		({ loadBalancers }) => {
			return loadBalancers.length > 0;
		}
	);

	const elbTargetGroups = getGlobalStateForServiceAndFunction(
		'ELBv2',
		'describeTargetGroups'
	).flatMap(({ _result }) => _result);

	// Step over every load balanced ECS Service
	const ecsLoadBalancingEdges = loadBalancedECSServices.flatMap(
		({ loadBalancers, taskDefinition }) => {
			// For each of their load balancer configs:
			// - Find the relevant target group
			// - Find the relevant task definition (down to the specific container)
			// - Create an edge from each of the target group's load balancers, to the task node
			return loadBalancers.flatMap(({ targetGroupArn, containerName }) => {
				const targetGroup = elbTargetGroups.find(
					({ TargetGroupArn }) => targetGroupArn === TargetGroupArn
				);
				const matchedTaskDef = ecsTaskDefinitionRecords.find(
					({ taskDefinitionArn, containerDefinitions }) => {
						const isLoadBalancedTask = taskDefinitionArn === taskDefinition;
						const loadBalancedContainer = containerDefinitions.find(
							({ name: taskContainerName }) =>
								containerName === taskContainerName
						);
						return isLoadBalancedTask && loadBalancedContainer;
					}
				);
				if (!matchedTaskDef) {
					return [];
				}
				return targetGroup.LoadBalancerArns.map((loadBalancerArn) => {
					return formatEdge(
						loadBalancerArn,
						matchedTaskDef.taskDefinitionArn,
						`${containerName}-LoadBalancing`
					);
				});
			});
		}
	);

	const ecsTaskEdges = taskRoleEdges.concat(ecsLoadBalancingEdges);
	return ecsTaskEdges;
}

function generateNodesForECSTasks(account, region, resolveStateForServiceCall) {
	const servicesState = evaluateSelector({
		account,
		region,
		rawSelector: 'ECS|describeServices|[]._result.services[]',
		resolveStateForServiceCall,
	});

	return servicesState.flatMap(
		({ serviceName, clusterArn, taskDefinition, networkConfiguration }) => {
			return networkConfiguration.awsvpcConfiguration.subnets.map((subnet) => ({
				group: 'nodes',
				id: sanitizeId(`${taskDefinition}-${subnet}`),
				data: {
					type: 'ECS-Tasks',
					id: `${taskDefinition}-${subnet}`,
					parent: subnet,
					ecsService: serviceName,
					ecsCluster: clusterArn,
				},
			}));
		}
	);
}

module.exports = {
	generateEdgesForECSResources,
	generateNodesForECSTasks,
};
