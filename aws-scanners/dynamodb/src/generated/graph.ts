import { evaluateSelector, formatNode } from "@infrascan/core";
import type {
  Connector,
  AwsContext,
  SelectedNode,
} from "@infrascan/shared-types";
import debug from "debug";

const nodesDebug = debug("dynamodb:nodes");
export async function getNodes(
  stateConnector: Connector,
  context: AwsContext,
): Promise<SelectedNode[]> {
  nodesDebug("Fetching nodes");
  const state: SelectedNode[] = [];
  nodesDebug(
    "Evaluating DynamoDB|DescribeTable|[].{id:_result.Table.TableArn}",
  );
  const DescribeTableNodes = await evaluateSelector<SelectedNode>(
    context.account,
    context.region,
    "DynamoDB|DescribeTable|[].{id:_result.Table.TableArn}",
    stateConnector,
  );
  nodesDebug(
    `Evaluated DynamoDB|DescribeTable|[].{id:_result.Table.TableArn}: ${DescribeTableNodes.length} Nodes found`,
  );
  state.push(...DescribeTableNodes);

  return state.map((node) => formatNode(node, "DynamoDB", context, true));
}
