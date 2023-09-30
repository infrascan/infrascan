import { evaluateSelector } from "@infrascan/core";
import type { Connector, AwsContext, GraphNode } from "@infrascan/shared-types";

export async function getNodes(
  stateConnector: Connector,
  context: AwsContext,
): Promise<GraphNode[]> {
  let state: GraphNode[] = [];
  const DescribeLoadBalancersNodes = await evaluateSelector(
    context.account,
    context.region,
    "ElasticLoadBalancingV2|DescribeLoadBalancers|[]._result | [].{id:LoadBalancerArn,name:LoadBalancerName}",
    stateConnector,
  );
  state = state.concat(DescribeLoadBalancersNodes);
  return state;
}
