import { evaluateSelector } from "@infrascan/core";
import type { Connector, AwsContext, GraphNode } from "@infrascan/shared-types";

export async function getNodes(
  stateConnector: Connector,
  context: AwsContext,
): Promise<GraphNode[]> {
  let state: GraphNode[] = [];
  const ListResourceRecordSetsNodes = await evaluateSelector(
    context.account,
    context.region,
    "Route53|ListResourceRecordSets|[]._result[?Type==`A`] | [].{id:Name,name:Name}",
    stateConnector,
  );
  state = state.concat(ListResourceRecordSetsNodes);
  return state;
}
