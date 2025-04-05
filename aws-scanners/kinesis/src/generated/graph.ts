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

const nodesDebug = debug("kinesis:nodes");
export async function getNodes(
  stateConnector: Connector,
  context: AwsContext,
): Promise<SelectedNode[]> {
  nodesDebug("Fetching nodes");
  const state: SelectedNode[] = [];
  nodesDebug(
    "Evaluating Kinesis|ListStreams|[]._result.StreamSummaries[].{id:StreamARN,name:StreamName}",
  );
  const ListStreamsNodes = await evaluateSelector<SelectedNode>(
    context.account,
    context.region,
    "Kinesis|ListStreams|[]._result.StreamSummaries[].{id:StreamARN,name:StreamName}",
    stateConnector,
  );
  nodesDebug(
    `Evaluated Kinesis|ListStreams|[]._result.StreamSummaries[].{id:StreamARN,name:StreamName}: ${ListStreamsNodes.length} Nodes found`,
  );
  state.push(...ListStreamsNodes);
  nodesDebug(
    "Evaluating Kinesis|ListStreamConsumers|[]._result.Consumers[].{id:ConsumerARN,name:ConsumerName}",
  );
  const ListStreamConsumersNodes = await evaluateSelector<SelectedNode>(
    context.account,
    context.region,
    "Kinesis|ListStreamConsumers|[]._result.Consumers[].{id:ConsumerARN,name:ConsumerName}",
    stateConnector,
  );
  nodesDebug(
    `Evaluated Kinesis|ListStreamConsumers|[]._result.Consumers[].{id:ConsumerARN,name:ConsumerName}: ${ListStreamConsumersNodes.length} Nodes found`,
  );
  state.push(...ListStreamConsumersNodes);

  return state.map((node) => formatNode(node, "Kinesis", context, true));
}

const edgesDebug = debug("kinesis:edges");
export async function getEdges(
  stateConnector: Connector,
): Promise<SelectedEdge[]> {
  edgesDebug("Fetching edges");
  const edges: SelectedEdge[] = [];
  edgesDebug("Evaluating Kinesis|ListStreamConsumers|[]");
  const ListStreamConsumersState1 = await evaluateSelectorGlobally(
    "Kinesis|ListStreamConsumers|[]",
    stateConnector,
  );
  const ListStreamConsumersEdges1 = ListStreamConsumersState1.flatMap(
    (state: any) => {
      const source = filterState(state, "_parameters.StreamARN");
      const target: SelectedEdgeTarget | SelectedEdgeTarget[] | null =
        filterState(
          state,
          "_result.Consumers[].{target:ConsumerARN,name:ConsumerName}",
        );
      if (!target || !source) {
        return [];
      }
      // Handle case of one to many edges
      if (Array.isArray(target)) {
        return target.map((edgeTarget) => formatEdge(source, edgeTarget));
      }
      return formatEdge(source, target);
    },
  );
  edgesDebug(
    `Evaluated Kinesis|ListStreamConsumers|[]: ${ListStreamConsumersEdges1.length} Edges found`,
  );
  edges.push(...ListStreamConsumersEdges1);
  return edges;
}
