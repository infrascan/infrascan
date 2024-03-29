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
  const ListBucketsNodes = await evaluateSelector(
    context.account,
    context.region,
    "S3|ListBuckets|[]._result.Buckets[].{id:[`arn:aws:s3:::`,Name] | join('',@),name:Name}",
    stateConnector,
  );
  state.push(...ListBucketsNodes);

  return state.map((node) => formatNode(node, "S3", context, false));
}

export async function getEdges(
  stateConnector: Connector,
): Promise<SelectedEdge[]> {
  const edges: SelectedEdge[] = [];
  const GetBucketNotificationConfigurationState1 =
    await evaluateSelectorGlobally(
      "S3|GetBucketNotificationConfiguration|[]",
      stateConnector,
    );
  const GetBucketNotificationConfigurationEdges1 =
    GetBucketNotificationConfigurationState1.flatMap((state: any) => {
      const source = filterState(
        state,
        "_parameters.Bucket | [`arn:aws:s3:::`,@] | join('',@)",
      );
      const target: SelectedEdgeTarget | SelectedEdgeTarget[] | null =
        filterState(
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
  edges.push(...GetBucketNotificationConfigurationEdges1);
  const GetBucketNotificationConfigurationState2 =
    await evaluateSelectorGlobally(
      "S3|GetBucketNotificationConfiguration|[]",
      stateConnector,
    );
  const GetBucketNotificationConfigurationEdges2 =
    GetBucketNotificationConfigurationState2.flatMap((state: any) => {
      const source = filterState(
        state,
        "_parameters.Bucket | [`arn:aws:s3:::`,@] | join('',@)",
      );
      const target: SelectedEdgeTarget | SelectedEdgeTarget[] | null =
        filterState(
          state,
          "_result.QueueConfigurations | [].{target:QueueArn,name:Id}",
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
  edges.push(...GetBucketNotificationConfigurationEdges2);
  const GetBucketNotificationConfigurationState3 =
    await evaluateSelectorGlobally(
      "S3|GetBucketNotificationConfiguration|[]",
      stateConnector,
    );
  const GetBucketNotificationConfigurationEdges3 =
    GetBucketNotificationConfigurationState3.flatMap((state: any) => {
      const source = filterState(
        state,
        "_parameters.Bucket | [`arn:aws:s3:::`,@] | join('',@)",
      );
      const target: SelectedEdgeTarget | SelectedEdgeTarget[] | null =
        filterState(
          state,
          "_result.LambdaFunctionConfigurations | [].{target:LambdaFunctionArn,name:Id}",
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
  edges.push(...GetBucketNotificationConfigurationEdges3);
  return edges;
}
