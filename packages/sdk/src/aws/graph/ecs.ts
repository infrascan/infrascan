/**
 * Handles the custom logic for generating edges between ECS nodes and the services they touch
 * as this logic is too messy to define in the config as normal
 * For now, only services will be rendered as nodes, within their clusters
 * but the edges will be generated using the roles from their tasks
 */
import type {
  DescribeServicesResponse,
  DescribeTaskDefinitionResponse,
  Service,
  TaskDefinition,
} from "@aws-sdk/client-ecs";
import type {
  GetGlobalStateForServiceAndFunction,
  GraphNode,
  GraphEdge,
} from "@infrascan/shared-types";
import type { State } from "@infrascan/shared-types";
import type { ResolveStateFromServiceFn } from "@infrascan/shared-types";

import { TargetGroup } from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  generateEdgesForRole,
  formatEdge,
  sanitizeId,
} from "./graph-utilities";
import { evaluateSelector } from "../helpers/state";
import { IAMStorage } from "../helpers/iam";

type ECSServiceState = State<DescribeServicesResponse>;
type ECSTaskState = State<DescribeTaskDefinitionResponse>;
type ELBTargetGroupState = State<TargetGroup>;

export async function generateEdgesForECSResources(
  iamStorage: IAMStorage,
  getGlobalStateForServiceAndFunction: GetGlobalStateForServiceAndFunction
): Promise<GraphEdge[]> {
  const ecsServiceState: ECSServiceState[] =
    await getGlobalStateForServiceAndFunction("ECS", "DescribeServices");
  const ecsServiceRecords = ecsServiceState
    .flatMap(({ _result }) => _result.services)
    .filter(Boolean) as Service[];

  const ecsTaskDefinitionState: ECSTaskState[] =
    await getGlobalStateForServiceAndFunction("ECS", "DescribeTaskDefinition");
  const ecsTaskDefinitionRecords = ecsTaskDefinitionState
    .flatMap(({ _result }) => _result.taskDefinition)
    .filter((taskDef) => taskDef != null) as TaskDefinition[];

  let taskRoleEdges: GraphEdge[] = [];
  for (const { taskDefinition } of ecsServiceRecords) {
    const matchedTaskDef = ecsTaskDefinitionRecords.find(
      ({ taskDefinitionArn }) => taskDefinitionArn === taskDefinition
    );

    if (matchedTaskDef?.taskRoleArn) {
      const edgesForTaskRole = await generateEdgesForRole(
        iamStorage,
        matchedTaskDef.taskRoleArn,
        matchedTaskDef.taskDefinitionArn as string,
        getGlobalStateForServiceAndFunction
      );
      if (edgesForTaskRole) {
        taskRoleEdges = taskRoleEdges.concat(edgesForTaskRole);
      }
    }
    if (matchedTaskDef?.executionRoleArn) {
      const edgesForExecutionRole = await generateEdgesForRole(
        iamStorage,
        matchedTaskDef.executionRoleArn,
        matchedTaskDef.taskDefinitionArn as string,
        getGlobalStateForServiceAndFunction
      );
      if (edgesForExecutionRole) {
        taskRoleEdges = taskRoleEdges.concat(edgesForExecutionRole);
      }
    }
  }

  const loadBalancedECSServices = ecsServiceRecords.filter(
    ({ loadBalancers }) => {
      return loadBalancers && loadBalancers?.length > 0;
    }
  );

  const elbTargetGroupsState: ELBTargetGroupState[] =
    await getGlobalStateForServiceAndFunction(
      "ElasticLoadBalancingv2",
      "DescribeTargetGroups"
    );
  const elbTargetGroups = elbTargetGroupsState.flatMap(
    ({ _result }) => _result
  );

  // Step over every load balanced ECS Service
  const ecsLoadBalancingEdges = loadBalancedECSServices.flatMap(
    ({ loadBalancers, taskDefinition }) => {
      // For each of their load balancer configs:
      // - Find the relevant target group
      // - Find the relevant task definition (down to the specific container)
      // - Create an edge from each of the target group's load balancers, to the task node
      return loadBalancers?.flatMap(({ targetGroupArn, containerName }) => {
        const targetGroup = elbTargetGroups.find(
          ({ TargetGroupArn }) => targetGroupArn === TargetGroupArn
        );
        const matchedTaskDef = ecsTaskDefinitionRecords.find(
          ({ taskDefinitionArn, containerDefinitions }) => {
            const isLoadBalancedTask = taskDefinitionArn === taskDefinition;
            const loadBalancedContainer = containerDefinitions?.find(
              ({ name: taskContainerName }) =>
                containerName === taskContainerName
            );
            return isLoadBalancedTask && loadBalancedContainer;
          }
        );
        if (!matchedTaskDef) {
          return [];
        }
        return targetGroup?.LoadBalancerArns?.map((loadBalancerArn) => {
          return formatEdge(
            loadBalancerArn,
            matchedTaskDef.taskDefinitionArn as string,
            `${containerName}-LoadBalancing`
          );
        });
      });
    }
  ) as GraphEdge[];

  return taskRoleEdges.concat(ecsLoadBalancingEdges);
}

export async function generateNodesForECSTasks(
  account: string,
  region: string,
  resolveStateForServiceCall: ResolveStateFromServiceFn
): Promise<GraphNode[]> {
  const servicesState: Service[] = await evaluateSelector(
    account,
    region,
    "ECS|DescribeServices|[]._result.services[]",
    resolveStateForServiceCall
  );

  const servicesNodes = servicesState
    .flatMap(
      ({ serviceName, clusterArn, taskDefinition, networkConfiguration }) => {
        return networkConfiguration?.awsvpcConfiguration?.subnets?.map(
          (subnet) => ({
            group: "nodes",
            id: sanitizeId(`${taskDefinition}-${subnet}`),
            data: {
              type: "ECS-Tasks",
              id: `${taskDefinition}-${subnet}`,
              parent: subnet,
              ecsService: serviceName,
              ecsCluster: clusterArn,
            },
          })
        );
      }
    )
    .filter(Boolean) as GraphNode[];
  return servicesNodes;
}
