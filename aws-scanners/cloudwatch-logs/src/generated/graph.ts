import {
  evaluateSelector,
  formatNode,
  evaluateSelectorGlobally,
  filterState,
  formatEdge,
} from "@infrascan/core";
import type {
  Connector,
  AwsContext,
  SelectedNode,
  SelectedEdge,
  SelectedEdgeTarget,
} from "@infrascan/shared-types";

export async function getNodes(
  stateConnector: Connector,
  context: AwsContext,
): Promise<SelectedNode[]> {
  const state: SelectedNode[] = [];
  const DescribeSubscriptionFiltersNodes = await evaluateSelector(
    context.account,
    context.region,
    "CloudWatchLogs|DescribeSubscriptionFilters|[]._result.subscriptionFilters[].{id:logGroupName,name:logGroupName}",
    stateConnector,
  );
  state.push(...DescribeSubscriptionFiltersNodes);

  return state.map((node) => formatNode(node, "CloudWatchLogs", context, true));
}

export async function getEdges(
  stateConnector: Connector,
): Promise<SelectedEdge[]> {
  const edges: SelectedEdge[] = [];
  const DescribeSubscriptionFiltersState1 = await evaluateSelectorGlobally(
    "CloudWatchLogs|DescribeSubscriptionFilters|[]._result.subscriptionFilters[]",
    stateConnector,
  );
  const DescribeSubscriptionFiltersEdges1 =
    DescribeSubscriptionFiltersState1.flatMap((state: any) => {
      const source = filterState(state, "logGroupName");
      const target: SelectedEdgeTarget | SelectedEdgeTarget[] | null =
        filterState(state, "{target:destinationArn}");
      if (!target || !source) {
        return [];
      }
      // Handle case of one to many edges
      if (Array.isArray(target)) {
        return target.map((edgeTarget) => formatEdge(source, edgeTarget));
      }
      return formatEdge(source, target);
    });
  edges.push(...DescribeSubscriptionFiltersEdges1);
  return edges;
}
