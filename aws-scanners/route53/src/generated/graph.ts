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
  const ListResourceRecordSetsNodes = await evaluateSelector(
    context.account,
    context.region,
    "Route53|ListResourceRecordSets|[]._result.ResourceRecordSets[?Type==`A`] | [].{id:Name,name:Name}",
    stateConnector,
  );
  state.push(...ListResourceRecordSetsNodes);
  return state.map((node) =>
    formatNode(node, "route-53", "Route53", context, false),
  );
}
