import { evaluateSelector } from "@infrascan/core";
import type { Connector, AwsContext, GraphNode } from "@infrascan/shared-types";

export async function getNodes(
  stateConnector: Connector,
  context: AwsContext,
): Promise<GraphNode[]> {
  let state: GraphNode[] = [];
  const GetApisNodes = await evaluateSelector(
    context.account,
    context.region,
    "ApiGatewayV2|GetApis|[]._result | [].{id:ApiEndpoint}",
    stateConnector,
  );
  state = state.concat(GetApisNodes);
  return state;
}
