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
  const ListResourceRecordSetsNodes = await evaluateSelector(
    context.account,
    context.region,
    "Route53|ListResourceRecordSets|[]._result.ResourceRecordSets[?Type==`A`] | [].{id:Name,name:Name}",
    stateConnector,
  );
  state.push(...ListResourceRecordSetsNodes);

  return state.map((node) => formatNode(node, "Route53", context, false));
}
