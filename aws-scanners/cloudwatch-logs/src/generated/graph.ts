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
import debug from "debug";

const nodesDebug = debug("cloudwatch-logs:nodes");
export async function getNodes(
  stateConnector: Connector,
  context: AwsContext,
): Promise<SelectedNode[]> {
  nodesDebug("Fetching nodes");
  const state: SelectedNode[] = [];
  nodesDebug(
    "Evaluating CloudWatchLogs|DescribeSubscriptionFilters|[]._result.subscriptionFilters[].{id:logGroupName,name:logGroupName}",
  );
  const DescribeSubscriptionFiltersNodes = await evaluateSelector<SelectedNode>(
    context.account,
    context.region,
    "CloudWatchLogs|DescribeSubscriptionFilters|[]._result.subscriptionFilters[].{id:logGroupName,name:logGroupName}",
    stateConnector,
  );
  nodesDebug(
    `Evaluated CloudWatchLogs|DescribeSubscriptionFilters|[]._result.subscriptionFilters[].{id:logGroupName,name:logGroupName}: ${DescribeSubscriptionFiltersNodes.length} Nodes found`,
  );
  state.push(...DescribeSubscriptionFiltersNodes);

  return state.map((node) => formatNode(node, "CloudWatchLogs", context, true));
}

const edgesDebug = debug("cloudwatch-logs:edges");
export async function getEdges(
  stateConnector: Connector,
): Promise<SelectedEdge[]> {
  edgesDebug("Fetching edges");
  const edges: SelectedEdge[] = [];
  edgesDebug(
    "Evaluating CloudWatchLogs|DescribeSubscriptionFilters|[]._result.subscriptionFilters[]",
  );
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
  edgesDebug(
    `Evaluated CloudWatchLogs|DescribeSubscriptionFilters|[]._result.subscriptionFilters[]: ${DescribeSubscriptionFiltersEdges1.length} Edges found`,
  );
  edges.push(...DescribeSubscriptionFiltersEdges1);
  return edges;
}
