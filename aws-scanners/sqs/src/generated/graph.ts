import { evaluateSelector, formatNode } from "@infrascan/core";
import type {
  Connector,
  AwsContext,
  SelectedNode,
} from "@infrascan/shared-types";
import debug from "debug";

const nodesDebug = debug("sqs:nodes");
export async function getNodes(
  stateConnector: Connector,
  context: AwsContext,
): Promise<SelectedNode[]> {
  nodesDebug("Fetching nodes");
  const state: SelectedNode[] = [];
  nodesDebug(
    "Evaluating SQS|GetQueueAttributes|[]._result.Attributes.{id:QueueArn,name:QueueArn}",
  );
  const GetQueueAttributesNodes = await evaluateSelector(
    context.account,
    context.region,
    "SQS|GetQueueAttributes|[]._result.Attributes.{id:QueueArn,name:QueueArn}",
    stateConnector,
  );
  nodesDebug(
    `Evaluated SQS|GetQueueAttributes|[]._result.Attributes.{id:QueueArn,name:QueueArn}: ${GetQueueAttributesNodes.length} Nodes found`,
  );
  state.push(...GetQueueAttributesNodes);

  return state.map((node) => formatNode(node, "SQS", context, true));
}
