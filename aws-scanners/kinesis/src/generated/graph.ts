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

  return state.map((node) => formatNode(node, "Kinesis", context, true));
}

export async function getEdges(
  stateConnector: Connector,
): Promise<SelectedEdge[]> {
  const edges: SelectedEdge[] = [];
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
  edges.push(...ListStreamConsumersEdges1);
  return edges;
}
