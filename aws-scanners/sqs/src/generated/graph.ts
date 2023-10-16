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
  const GetQueueAttributesNodes = await evaluateSelector(
    context.account,
    context.region,
    "SQS|GetQueueAttributes|[]._result.Attributes.{id:QueueArn,name:QueueName}",
    stateConnector,
  );
  state.push(...GetQueueAttributesNodes);
  return state.map((node) => formatNode(node, "sqs", "SQS"));
}

export async function getEdges(
  stateConnector: Connector,
): Promise<GraphEdge[]> {
  const edges: GraphEdge[] = [];
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
  edges.push(...GetQueueAttributesEdges1);
  return edges;
}
