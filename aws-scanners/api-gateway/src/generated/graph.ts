import { evaluateSelector, formatNode } from "@infrascan/core";
import type {
  Connector,
  AwsContext,
  SelectedNode,
} from "@infrascan/shared-types";
import debug from "debug";

const nodesDebug = debug("apigatewayv2:nodes");
export async function getNodes(
  stateConnector: Connector,
  context: AwsContext,
): Promise<SelectedNode[]> {
  nodesDebug("Fetching nodes");
  const state: SelectedNode[] = [];
  nodesDebug(
    "Evaluating ApiGatewayV2|GetApis|[]._result.Items | [].{id:ApiEndpoint}",
  );
  const GetApisNodes = await evaluateSelector(
    context.account,
    context.region,
    "ApiGatewayV2|GetApis|[]._result.Items | [].{id:ApiEndpoint}",
    stateConnector,
  );
  nodesDebug(
    `Evaluated ApiGatewayV2|GetApis|[]._result.Items | [].{id:ApiEndpoint}: ${GetApisNodes.length} Nodes found`,
  );
  state.push(...GetApisNodes);

  return state.map((node) => formatNode(node, "ApiGateway", context, true));
}
