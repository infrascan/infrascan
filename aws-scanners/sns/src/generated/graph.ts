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
  const ListTopicsNodes = await evaluateSelector(
    context.account,
    context.region,
    "SNS|ListTopics|[]._result[].TopicArn",
    stateConnector,
  );
  state = state.concat(ListTopicsNodes);
  return state;
}

export async function getEdges(
  stateConnector: Connector,
  context: AwsContext,
): Promise<GraphEdge[]> {
  let edges: GraphEdge[] = [];
  const ListSubscriptionsByTopicState1 = await evaluateSelectorGlobally(
    "SNS|ListSubscriptionsByTopic|[]",
    stateConnector,
  );
  const ListSubscriptionsByTopicEdges1 = ListSubscriptionsByTopicState1.flatMap(
    (state: any) => {
      const source = filterState(state, "_parameters.TopicArn");
      const target: EdgeTarget | EdgeTarget[] | null = filterState(
        state,
        "_result[?Protocol!=`https` && Protocol!=`http` && Protocol!=`email` && Protocol!=`email-json` && Protocol!=`sms`] | [].{target:Endpoint,name:SubscriptionArn}",
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
  edges = edges.concat(ListSubscriptionsByTopicEdges1);
  return edges;
}
