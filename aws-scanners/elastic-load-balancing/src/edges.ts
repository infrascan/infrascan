import { formatEdge } from "@infrascan/core";
import type {
  TaskDefinition,
  Service,
  DescribeServicesCommandOutput,
  DescribeTaskDefinitionCommandOutput,
  LoadBalancer,
} from "@aws-sdk/client-ecs";
import type {
  DescribeTargetGroupsCommandOutput,
  TargetGroup,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import type { Connector, GraphEdge, State } from "@infrascan/shared-types";

type LoadBalancedService = Service & { loadBalancers: LoadBalancer[] };

async function generateEdgesForECSResources(
  connector: Connector,
): Promise<GraphEdge[]> {
  const ecsServiceState: State<DescribeServicesCommandOutput>[] =
    await connector.getGlobalStateForServiceFunction("ECS", "DescribeServices");
  const ecsServiceRecords = ecsServiceState
    .flatMap(({ _result }) => _result.services)
    .filter(Boolean) as Service[];

  const ecsTaskDefinitionState: State<DescribeTaskDefinitionCommandOutput>[] =
    await connector.getGlobalStateForServiceFunction(
      "ECS",
      "DescribeTaskDefinition",
    );
  const ecsTaskDefinitionRecords = ecsTaskDefinitionState
    .flatMap(({ _result }) => _result.taskDefinition)
    .filter((taskDef) => taskDef != null) as TaskDefinition[];

  const loadBalancedECSServices = ecsServiceRecords.filter(
    ({ loadBalancers }) => loadBalancers && loadBalancers?.length > 0,
  ) as LoadBalancedService[];

  const elbTargetGroupsState: State<DescribeTargetGroupsCommandOutput>[] =
    await connector.getGlobalStateForServiceFunction(
      "ElasticLoadBalancingV2",
      "DescribeTargetGroups",
    );
  const elbTargetGroups = elbTargetGroupsState
    .flatMap(({ _result }) => _result.TargetGroups)
    .filter((targetGroup) => targetGroup != null) as TargetGroup[];

  // Step over every load balanced ECS Service
  const ecsLoadBalancingEdges: GraphEdge[] = [];
  // For each of their load balancer configs:
  // - Find the relevant target group
  // - Find the relevant task definition (down to the specific container)
  // - Create an edge from each of the target group's load balancers, to the task node
  for (const service of loadBalancedECSServices) {
    const { loadBalancers, taskDefinition } = service;
    const loadBalancingEdges = loadBalancers.flatMap(
      ({ targetGroupArn, containerName }) => {
        const targetGroup = elbTargetGroups.find(
          ({ TargetGroupArn }) => targetGroupArn === TargetGroupArn,
        );
        if (!targetGroup) {
          return [];
        }

        const matchedTaskDef = ecsTaskDefinitionRecords.find(
          ({ taskDefinitionArn, containerDefinitions }) => {
            const isLoadBalancedTask = taskDefinitionArn === taskDefinition;
            const loadBalancedContainer = containerDefinitions?.find(
              ({ name: taskContainerName }) =>
                containerName === taskContainerName,
            );
            return isLoadBalancedTask && loadBalancedContainer;
          },
        );
        if (!matchedTaskDef) {
          return [];
        }

        const targetTaskDef = {
          name: `${containerName}-LoadBalancing`,
          target: matchedTaskDef.taskDefinitionArn as string,
        };
        const targetGroupLoadBalancers = targetGroup.LoadBalancerArns ?? [];
        return targetGroupLoadBalancers.map((loadBalancerArn) =>
          formatEdge(loadBalancerArn, targetTaskDef),
        );
      },
    );
    ecsLoadBalancingEdges.push(...loadBalancingEdges);
  }

  return ecsLoadBalancingEdges;
}

export async function getEdges(connector: Connector): Promise<GraphEdge[]> {
  return generateEdgesForECSResources(connector);
}
