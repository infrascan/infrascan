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
  const ListDistributionsNodes = await evaluateSelector(
    context.account,
    context.region,
    "CloudFront|ListDistributions|[]._result.DistributionList.Items[].{id:ARN,name:Aliases.Items[0] || DomainName}",
    stateConnector,
  );
  state.push(...ListDistributionsNodes);

  return state.map((node) =>
    formatNode(node, "cloudfront", "CloudFront", context, false),
  );
}
