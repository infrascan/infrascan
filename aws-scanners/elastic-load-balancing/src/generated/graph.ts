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
  const DescribeLoadBalancersNodes = await evaluateSelector(
    context.account,
    context.region,
    "ElasticLoadBalancingV2|DescribeLoadBalancers|[]._result.LoadBalancers | [].{id:LoadBalancerArn,arn:LoadBalancerArn,name:LoadBalancerName}",
    stateConnector,
  );
  state.push(...DescribeLoadBalancersNodes);

  return state.map((node) => formatNode(node, "ELB", context, true));
}
