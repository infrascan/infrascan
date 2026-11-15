import {
  evaluateSelectorGlobally,
  filterState,
  formatEdge,
} from "@infrascan/core";
import type {
  Connector,
  SelectedEdge,
  SelectedEdgeTarget,
} from "@infrascan/shared-types";
import debug from "debug";

const edgesDebug = debug("apigatewayv2:edges");
export async function getEdges(
  stateConnector: Connector,
): Promise<SelectedEdge[]> {
  edgesDebug("Fetching edges");
  const edges: SelectedEdge[] = [];
  edgesDebug("Evaluating ApiGatewayV2|GetStages|[]");
  const GetStagesState1 = await evaluateSelectorGlobally(
    "ApiGatewayV2|GetStages|[]",
    stateConnector,
  );
  const GetStagesEdges1 = GetStagesState1.flatMap((state: any) => {
    const source = filterState(
      state,
      "join('', ['arn:', _metadata.partition || 'aws', ':apigateway:', _metadata.region, '::/apis/', _parameters.ApiId])",
    );
    const target: SelectedEdgeTarget | SelectedEdgeTarget[] | null =
      filterState(
        state,
        "_result.Items[?AccessLogSettings.DestinationArn] | [].{target:AccessLogSettings.DestinationArn,name:join('', ['Access logs (', StageName, ')'])}",
      );
    if (!target || !source) {
      return [];
    }
    // Handle case of one to many edges
    if (Array.isArray(target)) {
      return target.map((edgeTarget) => formatEdge(source, edgeTarget));
    } else {
      return formatEdge(source, target);
    }
  });
  edgesDebug(
    `Evaluated ApiGatewayV2|GetStages|[]: ${GetStagesEdges1.length} Edges found`,
  );
  edges.push(...GetStagesEdges1);
  return edges;
}
