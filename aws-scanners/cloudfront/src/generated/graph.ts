import { evaluateSelector } from "@infrascan/core";
import type { Connector, AwsContext, GraphNode } from "@infrascan/shared-types";

export async function getNodes(
  stateConnector: Connector,
  context: AwsContext,
): Promise<GraphNode[]> {
  let state: GraphNode[] = [];
  const ListDistributionsNodes = await evaluateSelector(
    context.account,
    context.region,
    "CloudFront|ListDistributions|[]._result[].{id:ARN,name:_infrascanLabel}",
    stateConnector,
  );
  state = state.concat(ListDistributionsNodes);
  return state;
}
