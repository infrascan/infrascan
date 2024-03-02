import { evaluateSelector, formatNode } from "@infrascan/core";
import type {
  Connector,
  AwsContext,
  SelectedNode,
} from "@infrascan/shared-types";

export async function getNodes(
  stateConnector: Connector,
  context: AwsContext,
): Promise<SelectedNode[]> {
  const state: SelectedNode[] = [];
  const DescribeClustersNodes = await evaluateSelector(
    context.account,
    context.region,
    "ECS|DescribeClusters|[]._result.clusters | [].{id:clusterArn,arn:clusterArn,name:clusterName,type:`ECS-Cluster`,rawState:@}",
    stateConnector,
  );
  state.push(...DescribeClustersNodes);
  const DescribeServicesNodes = await evaluateSelector(
    context.account,
    context.region,
    "ECS|DescribeServices|[]._result.services | [].{id:serviceArn,arn:serviceArn,parent:clusterArn,name:serviceName,type:`ECS-Service`,rawState:@}",
    stateConnector,
  );
  state.push(...DescribeServicesNodes);
  const DescribeServicesNodes2 = await evaluateSelector(
    context.account,
    context.region,
    "ECS|DescribeServices|[]._result.services | [].{id:taskDefinition,arn:taskDefinition,parent:serviceArn,type:`ECS-Task`,rawState:@}",
    stateConnector,
  );
  state.push(...DescribeServicesNodes2);
  const DescribeTasksNodes = await evaluateSelector(
    context.account,
    context.region,
    "ECS|DescribeTasks|[]._result.tasks | [].{id:taskDefinitionArn,arn:taskDefinitionArn,parent:clusterArn,type:`ECS-Task`,rawState:@}",
    stateConnector,
  );
  state.push(...DescribeTasksNodes);

  return state.map((node) => formatNode(node, "ECS", context, true));
}
