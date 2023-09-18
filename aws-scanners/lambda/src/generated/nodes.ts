import { evaluateSelector } from "@infrascan/core";
import type { Connector, GraphNode } from "@infrascan/shared-types";

export async function getNodes(
  stateConnector: Connector,
  account: string,
  region: string,
): Promise<GraphNode[]> {
  let state: GraphNode[] = [];
  const nodes1 = await evaluateSelector(
    account,
    region,
    "Lambda|ListFunctions|[]._result.Functions[].{id: FunctionArn,name:FunctionName}",
    stateConnector,
  );
  state = state.concat(nodes1);
  return state;
}
