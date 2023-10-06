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
  const GetQueueAttributesNodes = await evaluateSelector(
    context.account,
    context.region,
    "SQS|GetQueueAttributes|[]._result.{id:QueueArn,name:QueueName}",
    stateConnector,
  );
  state = state.concat(GetQueueAttributesNodes);
  return state;
}

export async function getEdges(
  stateConnector: Connector,
): Promise<GraphEdge[]> {
  let edges: GraphEdge[] = [];
  const GetQueueAttributesState1 = await evaluateSelectorGlobally(
    "SQS|GetQueueAttributes|[]",
    stateConnector,
  );
  const GetQueueAttributesEdges1 = GetQueueAttributesState1.flatMap(
    (state: any) => {
      const source = filterState(state, "_result.QueueArn");
      const target: EdgeTarget | EdgeTarget[] | null = filterState(
        state,
        "_result.RedrivePolicy.{target:deadLetterTargetArn}",
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
  edges = edges.concat(GetQueueAttributesEdges1);
  return edges;
}
