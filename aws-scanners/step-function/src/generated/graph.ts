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
  const DescribeStateMachineNodes = await evaluateSelector(
    context.account,
    context.region,
    "SFN|DescribeStateMachine|[]._result.{id:stateMachineArn,name:name,rawState:@}",
    stateConnector,
  );
  state.push(...DescribeStateMachineNodes);

  return state.map((node) => formatNode(node, "sfn", "SFN", context, true));
}
