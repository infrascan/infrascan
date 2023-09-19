import { evaluateSelector } from "@infrascan/core";
import type { Connector, AwsContext, GraphNode } from "@infrascan/shared-types";

export async function getNodes(
  stateConnector: Connector,
  context: AwsContext,
): Promise<GraphNode[]> {
  let state: GraphNode[] = [];
  const ListFunctionsNodes = await evaluateSelector(
    context.account,
    context.region,
    "Lambda|ListFunctions|[]._result.Functions[].{id: FunctionArn,name:FunctionName}",
    stateConnector,
  );
  state = state.concat(ListFunctionsNodes);
  return state;
}
