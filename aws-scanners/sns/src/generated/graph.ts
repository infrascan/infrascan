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
  const ListTopicsNodes = await evaluateSelector(
    context.account,
    context.region,
    "SNS|ListTopics|[]._result.Topics[].{id:TopicArn,name:TopicArn}",
    stateConnector,
  );
  state.push(...ListTopicsNodes);

  return state.map((node) => formatNode(node, "SNS", context, true));
}

export async function getEdges(
  stateConnector: Connector,
): Promise<SelectedEdge[]> {
  const edges: SelectedEdge[] = [];
  const ListSubscriptionsByTopicState1 = await evaluateSelectorGlobally(
    "SNS|ListSubscriptionsByTopic|[]",
    stateConnector,
  );
  const ListSubscriptionsByTopicEdges1 = ListSubscriptionsByTopicState1.flatMap(
    (state: any) => {
      const source = filterState(state, "_parameters.TopicArn");
      const target: SelectedEdgeTarget | SelectedEdgeTarget[] | null =
        filterState(
          state,
          "_result.Subscriptions[?Protocol!=`https` && Protocol!=`http` && Protocol!=`email` && Protocol!=`email-json` && Protocol!=`sms`] | [].{target:Endpoint,name:SubscriptionArn}",
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
  edges.push(...ListSubscriptionsByTopicEdges1);
  return edges;
}
