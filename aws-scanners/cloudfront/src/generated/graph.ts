import { evaluateSelector, formatNode } from "@infrascan/core";
import type {
  Connector,
  AwsContext,
  SelectedNode,
} from "@infrascan/shared-types";
import debug from "debug";

const nodesDebug = debug("cloudfront:nodes");
export async function getNodes(
  stateConnector: Connector,
  context: AwsContext,
): Promise<SelectedNode[]> {
  nodesDebug("Fetching nodes");
  const state: SelectedNode[] = [];
  nodesDebug(
    "Evaluating CloudFront|ListDistributions|[]._result.DistributionList.Items[].{id:ARN,name:Aliases.Items[0] || DomainName}",
  );
  const ListDistributionsNodes = await evaluateSelector<SelectedNode>(
    context.account,
    context.region,
    "CloudFront|ListDistributions|[]._result.DistributionList.Items[].{id:ARN,name:Aliases.Items[0] || DomainName}",
    stateConnector,
  );
  nodesDebug(
    `Evaluated CloudFront|ListDistributions|[]._result.DistributionList.Items[].{id:ARN,name:Aliases.Items[0] || DomainName}: ${ListDistributionsNodes.length} Nodes found`,
  );
  state.push(...ListDistributionsNodes);

  return state.map((node) => formatNode(node, "CloudFront", context, false));
}
