import { evaluateSelector } from "@infrascan/core";
import type { Connector, AwsContext, GraphNode } from "@infrascan/shared-types";

export async function getNodes(
  stateConnector: Connector,
  context: AwsContext,
): Promise<GraphNode[]> {
  let state: GraphNode[] = [];
  const DescribeClustersNodes = await evaluateSelector(
    context.account,
    context.region,
    "ECS|DescribeClusters|[]._result.clusters | [].{id:clusterArn,name:clusterName,info:@}",
    stateConnector,
  );
  state = state.concat(DescribeClustersNodes);
  const DescribeServicesNodes = await evaluateSelector(
    context.account,
    context.region,
    "ECS|DescribeServices|[]._result.services | [].{id:serviceArn,parent:clusterArn,name:serviceName,info:@}",
    stateConnector,
  );
  state = state.concat(DescribeServicesNodes);
  const DescribeServicesNodes2 = await evaluateSelector(
    context.account,
    context.region,
    "ECS|DescribeServices|[]._result.services | [].{id:taskDefinition,parent:serviceArn}",
    stateConnector,
  );
  state = state.concat(DescribeServicesNodes2);
  const DescribeTasksNodes = await evaluateSelector(
    context.account,
    context.region,
    "ECS|DescribeTasks|[]._result.tasks | [].{id:taskDefinitionArn,parent:clusterArn}",
    stateConnector,
  );
  state = state.concat(DescribeTasksNodes);
  return state;
}
