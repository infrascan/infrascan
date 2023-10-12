import { evaluateSelector } from "@infrascan/core";
import type { Connector, AwsContext, GraphNode } from "@infrascan/shared-types";

export async function getNodes(
  stateConnector: Connector,
  context: AwsContext,
): Promise<GraphNode[]> {
  let state: GraphNode[] = [];
  const DescribeTableNodes = await evaluateSelector(
    context.account,
    context.region,
    "DynamoDB|DescribeTable|[].{id:_result.Table.TableArn}",
    stateConnector,
  );
  state = state.concat(DescribeTableNodes);
  return state;
}
