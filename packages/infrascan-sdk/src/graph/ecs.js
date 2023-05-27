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

async function generateEdgesForECSResources(
	getGlobalStateForServiceAndFunction
) {
	const ecsServiceRecords = (
		await getGlobalStateForServiceAndFunction('ECS', 'describeServices')
	).flatMap(({ _result }) => _result.services);

	const ecsTaskDefinitionRecords = (
		await getGlobalStateForServiceAndFunction('ECS', 'describeTaskDefinition')
	).flatMap(({ _result }) => _result.taskDefinition);

	let taskRoleEdges = [];
	for (let { taskDefinition } of ecsServiceRecords) {
		const matchedTaskDef = ecsTaskDefinitionRecords.find(
			({ taskDefinitionArn }) => taskDefinitionArn === taskDefinition
		);

		if (matchedTaskDef?.taskRoleArn) {
			const edgesForTaskRole = await generateEdgesForRole(
				matchedTaskDef.taskRoleArn,
				matchedTaskDef.taskDefinitionArn,
				getGlobalStateForServiceAndFunction
			);
			taskRoleEdges = taskRoleEdges.concat(edgesForTaskRole);
		}
		if (matchedTaskDef?.executionRoleArn) {
			const edgesForExecutionRole = await generateEdgesForRole(
				matchedTaskDef.executionRoleArn,
				matchedTaskDef.taskDefinitionArn,
				getGlobalStateForServiceAndFunction
			);
			taskRoleEdges = taskRoleEdges.concat(edgesForExecutionRole);
		}
	}

	const loadBalancedECSServices = ecsServiceRecords.filter(
		({ loadBalancers }) => {
			return loadBalancers.length > 0;
		}
	);

	const elbTargetGroups = (
		await getGlobalStateForServiceAndFunction('ELBv2', 'describeTargetGroups')
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

async function generateNodesForECSTasks(
	account,
	region,
	resolveStateForServiceCall
) {
	const servicesState = await evaluateSelector({
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
