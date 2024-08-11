import { evaluateSelector, formatNode } from "@infrascan/core";
import type {
  Connector,
  AwsContext,
  SelectedNode,
} from "@infrascan/shared-types";
import debug from "debug";

const nodesDebug = debug("rds:nodes");
export async function getNodes(
  stateConnector: Connector,
  context: AwsContext,
): Promise<SelectedNode[]> {
  nodesDebug("Fetching nodes");
  const state: SelectedNode[] = [];
  nodesDebug(
    "Evaluating RDS|DescribeDBInstances|[]._result.DBInstances | [].{id:DBInstanceIdentifier,name:DBName}",
  );
  const DescribeDBInstancesNodes = await evaluateSelector(
    context.account,
    context.region,
    "RDS|DescribeDBInstances|[]._result.DBInstances | [].{id:DBInstanceIdentifier,name:DBName}",
    stateConnector,
  );
  nodesDebug(
    `Evaluated RDS|DescribeDBInstances|[]._result.DBInstances | [].{id:DBInstanceIdentifier,name:DBName}: ${DescribeDBInstancesNodes.length} Nodes found`,
  );
  state.push(...DescribeDBInstancesNodes);

  return state.map((node) => formatNode(node, "RDS", context, true));
}
