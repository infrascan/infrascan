import { evaluateSelector, formatNode } from "@infrascan/core";
import type {
  Connector,
  AwsContext,
  SelectedNode,
  GraphNode,
} from "@infrascan/shared-types";

export async function getNodes(
  stateConnector: Connector,
  context: AwsContext,
): Promise<GraphNode[]> {
  const state: SelectedNode[] = [];
  const DescribeDBInstancesNodes = await evaluateSelector(
    context.account,
    context.region,
    "RDS|DescribeDBInstances|[]._result.DBInstances | [].{id:DBInstanceIdentifier,name:DBName}",
    stateConnector,
  );
  state.push(...DescribeDBInstancesNodes);

  return state.map((node) => formatNode(node, "rds", "RDS", context, true));
}
