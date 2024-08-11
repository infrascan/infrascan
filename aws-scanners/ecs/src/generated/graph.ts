import { evaluateSelector, formatNode } from "@infrascan/core";
import type {
  Connector,
  AwsContext,
  SelectedNode,
} from "@infrascan/shared-types";
import debug from "debug";

const nodesDebug = debug("ecs:nodes");
export async function getNodes(
  stateConnector: Connector,
  context: AwsContext,
): Promise<SelectedNode[]> {
  nodesDebug("Fetching nodes");
  const state: SelectedNode[] = [];
  nodesDebug(
    "Evaluating ECS|DescribeClusters|[]._result.clusters | [].{id:clusterArn,name:clusterName,type:`ECS-Cluster`,rawState:@}",
  );
  const DescribeClustersNodes = await evaluateSelector(
    context.account,
    context.region,
    "ECS|DescribeClusters|[]._result.clusters | [].{id:clusterArn,name:clusterName,type:`ECS-Cluster`,rawState:@}",
    stateConnector,
  );
  nodesDebug(
    `Evaluated ECS|DescribeClusters|[]._result.clusters | [].{id:clusterArn,name:clusterName,type:\`ECS-Cluster\`,rawState:@}: ${DescribeClustersNodes.length} Nodes found`,
  );
  state.push(...DescribeClustersNodes);
  nodesDebug(
    "Evaluating ECS|DescribeServices|[]._result.services | [].{id:serviceArn,parent:clusterArn,name:serviceName,type:`ECS-Service`,rawState:@}",
  );
  const DescribeServicesNodes = await evaluateSelector(
    context.account,
    context.region,
    "ECS|DescribeServices|[]._result.services | [].{id:serviceArn,parent:clusterArn,name:serviceName,type:`ECS-Service`,rawState:@}",
    stateConnector,
  );
  nodesDebug(
    `Evaluated ECS|DescribeServices|[]._result.services | [].{id:serviceArn,parent:clusterArn,name:serviceName,type:\`ECS-Service\`,rawState:@}: ${DescribeServicesNodes.length} Nodes found`,
  );
  state.push(...DescribeServicesNodes);
  nodesDebug(
    "Evaluating ECS|DescribeServices|[]._result.services | [].{id:taskDefinition,parent:serviceArn,type:`ECS-Task`,rawState:@}",
  );
  const DescribeServicesNodes2 = await evaluateSelector(
    context.account,
    context.region,
    "ECS|DescribeServices|[]._result.services | [].{id:taskDefinition,parent:serviceArn,type:`ECS-Task`,rawState:@}",
    stateConnector,
  );
  nodesDebug(
    `Evaluated ECS|DescribeServices|[]._result.services | [].{id:taskDefinition,parent:serviceArn,type:\`ECS-Task\`,rawState:@}: ${DescribeServicesNodes2.length} Nodes found`,
  );
  state.push(...DescribeServicesNodes2);
  nodesDebug(
    "Evaluating ECS|DescribeTasks|[]._result.tasks | [].{id:taskDefinitionArn,parent:clusterArn,type:`ECS-Task`,rawState:@}",
  );
  const DescribeTasksNodes = await evaluateSelector(
    context.account,
    context.region,
    "ECS|DescribeTasks|[]._result.tasks | [].{id:taskDefinitionArn,parent:clusterArn,type:`ECS-Task`,rawState:@}",
    stateConnector,
  );
  nodesDebug(
    `Evaluated ECS|DescribeTasks|[]._result.tasks | [].{id:taskDefinitionArn,parent:clusterArn,type:\`ECS-Task\`,rawState:@}: ${DescribeTasksNodes.length} Nodes found`,
  );
  state.push(...DescribeTasksNodes);

  return state.map((node) => formatNode(node, "ECS", context, true));
}
