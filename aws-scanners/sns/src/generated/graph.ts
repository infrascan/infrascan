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
import debug from "debug";

const nodesDebug = debug("sns:nodes");
export async function getNodes(
  stateConnector: Connector,
  context: AwsContext,
): Promise<SelectedNode[]> {
  nodesDebug("Fetching nodes");
  const state: SelectedNode[] = [];
  nodesDebug(
    "Evaluating SNS|ListTopics|[]._result.Topics[].{id:TopicArn,name:TopicArn}",
  );
  const ListTopicsNodes = await evaluateSelector(
    context.account,
    context.region,
    "SNS|ListTopics|[]._result.Topics[].{id:TopicArn,name:TopicArn}",
    stateConnector,
  );
  nodesDebug(
    `Evaluated SNS|ListTopics|[]._result.Topics[].{id:TopicArn,name:TopicArn}: ${ListTopicsNodes.length} Nodes found`,
  );
  state.push(...ListTopicsNodes);

  return state.map((node) => formatNode(node, "SNS", context, true));
}

const edgesDebug = debug("sns:edges");
export async function getEdges(
  stateConnector: Connector,
): Promise<SelectedEdge[]> {
  edgesDebug("Fetching edges");
  const edges: SelectedEdge[] = [];
  edgesDebug("Evaluating SNS|ListSubscriptionsByTopic|[]");
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
  edgesDebug(
    `Evaluated SNS|ListSubscriptionsByTopic|[]: ${ListSubscriptionsByTopicEdges1.length} Edges found`,
  );
  edges.push(...ListSubscriptionsByTopicEdges1);
  return edges;
}
