import { evaluateSelector } from "@infrascan/core";
import type { Connector, AwsContext, GraphNode } from "@infrascan/shared-types";

export async function getNodes(
  stateConnector: Connector,
  context: AwsContext,
): Promise<GraphNode[]> {
  let state: GraphNode[] = [];
  const DescribeDBInstancesNodes = await evaluateSelector(
    context.account,
    context.region,
    "RDS|DescribeDBInstances|[]._result | [].{id:DBInstanceIdentifier,name:DBName}",
    stateConnector,
  );
  state = state.concat(DescribeDBInstancesNodes);
  return state;
}
