import { evaluateSelector, formatNode } from "@infrascan/core";
import type {
  Connector,
  AwsContext,
  SelectedNode,
} from "@infrascan/shared-types";
import debug from "debug";

const nodesDebug = debug("sfn:nodes");
export async function getNodes(
  stateConnector: Connector,
  context: AwsContext,
): Promise<SelectedNode[]> {
  nodesDebug("Fetching nodes");
  const state: SelectedNode[] = [];
  nodesDebug(
    "Evaluating SFN|DescribeStateMachine|[]._result.{id:stateMachineArn,name:name,rawState:@}",
  );
  const DescribeStateMachineNodes = await evaluateSelector(
    context.account,
    context.region,
    "SFN|DescribeStateMachine|[]._result.{id:stateMachineArn,name:name,rawState:@}",
    stateConnector,
  );
  nodesDebug(
    `Evaluated SFN|DescribeStateMachine|[]._result.{id:stateMachineArn,name:name,rawState:@}: ${DescribeStateMachineNodes.length} Nodes found`,
  );
  state.push(...DescribeStateMachineNodes);

  return state.map((node) => formatNode(node, "SFN", context, true));
}
