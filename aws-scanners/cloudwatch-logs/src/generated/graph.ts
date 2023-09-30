import {
  evaluateSelector,
  evaluateSelectorGlobally,
  filterState,
  formatEdge,
} from "@infrascan/core";
import type {
  Connector,
  AwsContext,
  GraphNode,
  GraphEdge,
  EdgeTarget,
} from "@infrascan/shared-types";

export async function getNodes(
  stateConnector: Connector,
  context: AwsContext,
): Promise<GraphNode[]> {
  let state: GraphNode[] = [];
  const DescribeSubscriptionFiltersNodes = await evaluateSelector(
    context.account,
    context.region,
    "CloudWatchLogs|DescribeSubscriptionFilters|[]._result.subscriptionFilters[].{id:logGroupName,name:logGroupName}",
    stateConnector,
  );
  state = state.concat(DescribeSubscriptionFiltersNodes);
  return state;
}

export async function getEdges(
  stateConnector: Connector,
  context: AwsContext,
): Promise<GraphEdge[]> {
  let edges: GraphEdge[] = [];
  const DescribeSubscriptionFiltersState1 = await evaluateSelectorGlobally(
    "CloudWatchLogs|DescribeSubscriptionFilters|[]._result.subscriptionFilters[]",
    stateConnector,
  );
  const DescribeSubscriptionFiltersEdges1 =
    DescribeSubscriptionFiltersState1.flatMap((state: any) => {
      const source = filterState(state, "logGroupName");
      const target: EdgeTarget | EdgeTarget[] | null = filterState(
        state,
        "{target:destinationArn}",
      );
      if (!target || !source) {
        return [];
      }
      // Handle case of one to many edges
      if (Array.isArray(target)) {
        return target.map((edgeTarget) => formatEdge(source, edgeTarget));
      }
      return formatEdge(source, target);
    });
  edges = edges.concat(DescribeSubscriptionFiltersEdges1);
  return edges;
}
