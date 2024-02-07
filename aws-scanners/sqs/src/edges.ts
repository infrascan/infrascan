import { GetQueueAttributesCommandOutput } from "@aws-sdk/client-sqs";
import { evaluateSelectorGlobally, formatEdge } from "@infrascan/core";
import type {
  Connector,
  SelectedEdge,
  SelectedEdgeTarget,
  State,
} from "@infrascan/shared-types";

interface RedrivePolicy {
  deadLetterTargetArn?: string;
}

export async function getEdges(
  stateConnector: Connector,
): Promise<SelectedEdge[]> {
  const edges: SelectedEdge[] = [];
  const GetQueueAttributesState = await evaluateSelectorGlobally(
    "SQS|GetQueueAttributes|[]",
    stateConnector,
  );
  const GetQueueAttributesEdges = GetQueueAttributesState.flatMap(
    (state: State<GetQueueAttributesCommandOutput>) => {
      const source = state._result.Attributes?.QueueArn;
      const redrivePolicy = state._result.Attributes?.RedrivePolicy;
      if (!source || !redrivePolicy) {
        return [];
      }
      const parsedRedrivePolicy: RedrivePolicy = JSON.parse(redrivePolicy);
      if (!parsedRedrivePolicy.deadLetterTargetArn) {
        return [];
      }
      const sourceQueueName = source.split(":").pop();
      const target: SelectedEdgeTarget = {
        target: parsedRedrivePolicy.deadLetterTargetArn,
        name: `${sourceQueueName ?? source} Deadletter Queue`,
      };
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
  edges.push(...GetQueueAttributesEdges);
  return edges;
}
