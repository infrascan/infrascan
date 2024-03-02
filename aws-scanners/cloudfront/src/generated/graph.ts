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
  const ListDistributionsNodes = await evaluateSelector(
    context.account,
    context.region,
    "CloudFront|ListDistributions|[]._result.DistributionList.Items[].{id:ARN,arn:ARN,name:Aliases.Items[0] || DomainName}",
    stateConnector,
  );
  state.push(...ListDistributionsNodes);

  return state.map((node) => formatNode(node, "CloudFront", context, false));
}
