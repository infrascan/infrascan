import { evaluateSelector, formatNode } from "@infrascan/core";
import type {
  Connector,
  AwsContext,
  SelectedNode,
} from "@infrascan/shared-types";
import debug from "debug";

const nodesDebug = debug("lambda:nodes");
export async function getNodes(
  stateConnector: Connector,
  context: AwsContext,
): Promise<SelectedNode[]> {
  nodesDebug("Fetching nodes");
  const state: SelectedNode[] = [];
  nodesDebug(
    "Evaluating Lambda|ListFunctions|[]._result.Functions[].{id: FunctionArn,name:FunctionName}",
  );
  const ListFunctionsNodes = await evaluateSelector<SelectedNode>(
    context.account,
    context.region,
    "Lambda|ListFunctions|[]._result.Functions[].{id: FunctionArn,name:FunctionName}",
    stateConnector,
  );
  nodesDebug(
    `Evaluated Lambda|ListFunctions|[]._result.Functions[].{id: FunctionArn,name:FunctionName}: ${ListFunctionsNodes.length} Nodes found`,
  );
  state.push(...ListFunctionsNodes);

  return state.map((node) => formatNode(node, "Lambda", context, true));
}
