import { evaluateSelector, formatNode } from "@infrascan/core";
import type {
  Connector,
  AwsContext,
  SelectedNode,
} from "@infrascan/shared-types";

export async function getNodes(
  stateConnector: Connector,
  context: AwsContext,
): Promise<SelectedNode[]> {
  const state: SelectedNode[] = [];
  const DescribeTableNodes = await evaluateSelector(
    context.account,
    context.region,
    "DynamoDB|DescribeTable|[].{id:_result.Table.TableArn,arn:_result.Table.TableArn}",
    stateConnector,
  );
  state.push(...DescribeTableNodes);

  return state.map((node) => formatNode(node, "DynamoDB", context, true));
}
