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
  const DescribeStateMachineNodes = await evaluateSelector(
    context.account,
    context.region,
    "SFN|DescribeStateMachine|[]._result.{id:stateMachineArn,arn:stateMachineArn,name:name,rawState:@}",
    stateConnector,
  );
  state.push(...DescribeStateMachineNodes);

  return state.map((node) => formatNode(node, "SFN", context, true));
}
