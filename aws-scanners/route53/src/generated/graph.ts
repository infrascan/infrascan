import { evaluateSelector, formatNode } from "@infrascan/core";
import type {
  Connector,
  AwsContext,
  SelectedNode,
} from "@infrascan/shared-types";
import debug from "debug";

const nodesDebug = debug("route-53:nodes");
export async function getNodes(
  stateConnector: Connector,
  context: AwsContext,
): Promise<SelectedNode[]> {
  nodesDebug("Fetching nodes");
  const state: SelectedNode[] = [];
  nodesDebug(
    "Evaluating Route53|ListResourceRecordSets|[]._result.ResourceRecordSets[?Type==`A`] | [].{id:Name,name:Name}",
  );
  const ListResourceRecordSetsNodes = await evaluateSelector<SelectedNode>(
    context.account,
    context.region,
    "Route53|ListResourceRecordSets|[]._result.ResourceRecordSets[?Type==`A`] | [].{id:Name,name:Name}",
    stateConnector,
  );
  nodesDebug(
    `Evaluated Route53|ListResourceRecordSets|[]._result.ResourceRecordSets[?Type==\`A\`] | [].{id:Name,name:Name}: ${ListResourceRecordSetsNodes.length} Nodes found`,
  );
  state.push(...ListResourceRecordSetsNodes);

  return state.map((node) => formatNode(node, "Route53", context, false));
}
