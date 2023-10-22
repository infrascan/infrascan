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
  const ListFunctionsNodes = await evaluateSelector(
    context.account,
    context.region,
    "Lambda|ListFunctions|[]._result.Functions[].{id: FunctionArn,name:FunctionName}",
    stateConnector,
  );
  state.push(...ListFunctionsNodes);
  return state.map((node) =>
    formatNode(node, "lambda", "Lambda", context, true),
  );
}
