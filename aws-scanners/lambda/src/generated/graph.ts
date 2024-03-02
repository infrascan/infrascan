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
  const ListFunctionsNodes = await evaluateSelector(
    context.account,
    context.region,
    "Lambda|ListFunctions|[]._result.Functions[].{id:FunctionArn,arn:FunctionArn,name:FunctionName}",
    stateConnector,
  );
  state.push(...ListFunctionsNodes);

  return state.map((node) => formatNode(node, "Lambda", context, true));
}
