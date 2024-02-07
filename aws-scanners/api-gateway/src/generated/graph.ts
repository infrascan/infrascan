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
  const GetApisNodes = await evaluateSelector(
    context.account,
    context.region,
    "ApiGatewayV2|GetApis|[]._result.Items | [].{id:ApiEndpoint}",
    stateConnector,
  );
  state.push(...GetApisNodes);

  return state.map((node) => formatNode(node, "ApiGateway", context, true));
}
