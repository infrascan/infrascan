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
  const ListBucketsNodes = await evaluateSelector(
    context.account,
    context.region,
    "S3|ListBuckets|[]._result[].{id:Name,name:Name}",
    stateConnector,
  );
  state = state.concat(ListBucketsNodes);
  return state;
}

export async function getEdges(
  stateConnector: Connector,
): Promise<GraphEdge[]> {
  let edges: GraphEdge[] = [];
  const GetBucketNotificationConfigurationState1 =
    await evaluateSelectorGlobally(
      "S3|GetBucketNotificationConfiguration|[]",
      stateConnector,
    );
  const GetBucketNotificationConfigurationEdges1 =
    GetBucketNotificationConfigurationState1.flatMap((state: any) => {
      const source = filterState(state, "_parameters.Bucket");
      const target: EdgeTarget | EdgeTarget[] | null = filterState(
        state,
        "_result.TopicConfigurations | [].{target:TopicArn,name:Id}",
      );
      if (!target || !source) {
        return [];
      }
      // Handle case of one to many edges
      if (Array.isArray(target)) {
        return target.map((edgeTarget) => formatEdge(source, edgeTarget));
      }
      return formatEdge(source, target);
    });
  edges = edges.concat(GetBucketNotificationConfigurationEdges1);
  const GetBucketNotificationConfigurationState2 =
    await evaluateSelectorGlobally(
      "S3|GetBucketNotificationConfiguration|[]",
      stateConnector,
    );
  const GetBucketNotificationConfigurationEdges2 =
    GetBucketNotificationConfigurationState2.flatMap((state: any) => {
      const source = filterState(state, "_parameters.Bucket");
      const target: EdgeTarget | EdgeTarget[] | null = filterState(
        state,
        "_result.QueueConfigurations | [].{target:Queue,name:Id}",
      );
      if (!target || !source) {
        return [];
      }
      // Handle case of one to many edges
      if (Array.isArray(target)) {
        return target.map((edgeTarget) => formatEdge(source, edgeTarget));
      }
      return formatEdge(source, target);
    });
  edges = edges.concat(GetBucketNotificationConfigurationEdges2);
  const GetBucketNotificationConfigurationState3 =
    await evaluateSelectorGlobally(
      "S3|GetBucketNotificationConfiguration|[]",
      stateConnector,
    );
  const GetBucketNotificationConfigurationEdges3 =
    GetBucketNotificationConfigurationState3.flatMap((state: any) => {
      const source = filterState(state, "_parameters.Bucket");
      const target: EdgeTarget | EdgeTarget[] | null = filterState(
        state,
        "_result.LambdaFunctionConfiguration | [].{target:LambdaFunctionArn,name:Id}",
      );
      if (!target || !source) {
        return [];
      }
      // Handle case of one to many edges
      if (Array.isArray(target)) {
        return target.map((edgeTarget) => formatEdge(source, edgeTarget));
      }
      return formatEdge(source, target);
    });
  edges = edges.concat(GetBucketNotificationConfigurationEdges3);
  return edges;
}
