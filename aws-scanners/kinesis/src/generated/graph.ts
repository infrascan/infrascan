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
