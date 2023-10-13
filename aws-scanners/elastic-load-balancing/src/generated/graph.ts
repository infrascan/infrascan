import { evaluateSelector, formatNode } from "@infrascan/core";
import type {
  Connector,
  AwsContext,
  SelectedNode,
  GraphNode,
} from "@infrascan/shared-types";

export async function getNodes(
  stateConnector: Connector,
  context: AwsContext,
): Promise<GraphNode[]> {
  const state: SelectedNode[] = [];
  const DescribeLoadBalancersNodes = await evaluateSelector(
    context.account,
    context.region,
    "ElasticLoadBalancingV2|DescribeLoadBalancers|[]._result.LoadBalancers | [].{id:LoadBalancerArn,name:LoadBalancerName}",
    stateConnector,
  );
  state.push(...DescribeLoadBalancersNodes);
  return state.map((node) =>
    formatNode(node, "elastic-load-balancing-v2", "ELB"),
  );
}
