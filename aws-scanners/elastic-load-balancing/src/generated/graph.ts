import { evaluateSelector, formatNode } from "@infrascan/core";
import type {
  Connector,
  AwsContext,
  SelectedNode,
} from "@infrascan/shared-types";
import debug from "debug";

const nodesDebug = debug("elastic-load-balancing-v2:nodes");
export async function getNodes(
  stateConnector: Connector,
  context: AwsContext,
): Promise<SelectedNode[]> {
  nodesDebug("Fetching nodes");
  const state: SelectedNode[] = [];
  nodesDebug(
    "Evaluating ElasticLoadBalancingV2|DescribeLoadBalancers|[]._result.LoadBalancers | [].{id:LoadBalancerArn,name:LoadBalancerName}",
  );
  const DescribeLoadBalancersNodes = await evaluateSelector<SelectedNode>(
    context.account,
    context.region,
    "ElasticLoadBalancingV2|DescribeLoadBalancers|[]._result.LoadBalancers | [].{id:LoadBalancerArn,name:LoadBalancerName}",
    stateConnector,
  );
  nodesDebug(
    `Evaluated ElasticLoadBalancingV2|DescribeLoadBalancers|[]._result.LoadBalancers | [].{id:LoadBalancerArn,name:LoadBalancerName}: ${DescribeLoadBalancersNodes.length} Nodes found`,
  );
  state.push(...DescribeLoadBalancersNodes);

  return state.map((node) => formatNode(node, "ELB", context, true));
}
