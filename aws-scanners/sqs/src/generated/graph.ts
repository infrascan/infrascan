import { evaluateSelector, formatNode } from "@infrascan/core";
import type {
  Connector,
  AwsContext,
  SelectedNode,
} from "@infrascan/shared-types";

export async function getNodes(
  stateConnector: Connector,
  context: AwsContext,
): Promise<SelectedNode[]> {
  const state: SelectedNode[] = [];
  const GetQueueAttributesNodes = await evaluateSelector(
    context.account,
    context.region,
    "SQS|GetQueueAttributes|[]._result.Attributes.{id:QueueArn,arn:QueueArn,name:QueueArn}",
    stateConnector,
  );
  state.push(...GetQueueAttributesNodes);

  return state.map((node) => formatNode(node, "SQS", context, true));
}
