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
  GraphNode,
  GraphEdge,
  EdgeTarget,
} from "@infrascan/shared-types";

export async function getNodes(
  stateConnector: Connector,
  context: AwsContext,
): Promise<GraphNode[]> {
  const state: SelectedNode[] = [];
  const ListStreamsNodes = await evaluateSelector(
    context.account,
    context.region,
    "Kinesis|ListStreams|[]._result.StreamSummaries[].{id:StreamARN,name:StreamName}",
    stateConnector,
  );
  state.push(...ListStreamsNodes);
  const ListStreamConsumersNodes = await evaluateSelector(
    context.account,
    context.region,
    "Kinesis|ListStreamConsumers|[]._result.Consumers[].{id:ConsumerARN,name:ConsumerName}",
    stateConnector,
  );
  state.push(...ListStreamConsumersNodes);
  return state.map((node) =>
    formatNode(node, "kinesis", "Kinesis", context, true),
  );
}

export async function getEdges(
  stateConnector: Connector,
): Promise<GraphEdge[]> {
  const edges: GraphEdge[] = [];
  const ListStreamConsumersState1 = await evaluateSelectorGlobally(
    "Kinesis|ListStreamConsumers|[]",
    stateConnector,
  );
  const ListStreamConsumersEdges1 = ListStreamConsumersState1.flatMap(
    (state: any) => {
      const source = filterState(state, "_parameters.StreamARN");
      const target: EdgeTarget | EdgeTarget[] | null = filterState(
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
  edges.push(...ListStreamConsumersEdges1);
  return edges;
}
