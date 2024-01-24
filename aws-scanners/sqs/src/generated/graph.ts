import { evaluateSelector, formatNode } from "@infrascan/core";
import type {
  Connector,
  AwsContext,
  SelectedNode,
  GraphNode,
} from "@infrascan/shared-types";

export async function getNodes(
  stateConnector: Connector,
  context: AwsContext,
): Promise<GraphNode[]> {
  const state: SelectedNode[] = [];
  const GetQueueAttributesNodes = await evaluateSelector(
    context.account,
    context.region,
    "SQS|GetQueueAttributes|[]._result.Attributes.{id:QueueArn,name:QueueArn}",
    stateConnector,
  );
  state.push(...GetQueueAttributesNodes);

  return state.map((node) => formatNode(node, "sqs", "SQS", context, true));
}
