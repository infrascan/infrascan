import {
  evaluateSelectorGlobally,
  resolveFunctionCallParameters,
} from "@infrascan/core";
import {
  SFNClient,
  SFNServiceException,
  ListStateMachinesCommand,
  ListStateMachinesCommandInput,
  ListStateMachinesCommandOutput,
  DescribeStateMachineCommand,
  DescribeStateMachineCommandInput,
  DescribeStateMachineCommandOutput,
} from "@aws-sdk/client-sfn";
import type {
  Connector,
  GenericState,
  AwsContext,
  EntityRoleData,
} from "@infrascan/shared-types";

export async function ListStateMachines(
  client: SFNClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const state: GenericState[] = [];
  console.log("sfn ListStateMachines");
  let pagingToken: string | undefined;
  do {
    const preparedParams: ListStateMachinesCommandInput = {};
    preparedParams.nextToken = pagingToken;
    try {
      const cmd = new ListStateMachinesCommand(preparedParams);
      const result: ListStateMachinesCommandOutput = await client.send(cmd);
      state.push({
        _metadata: { account: context.account, region: context.region },
        _parameters: preparedParams,
        _result: result,
      });
      pagingToken = result.nextToken;
    } catch (err: unknown) {
      if (err instanceof SFNServiceException) {
        if (err?.$retryable) {
          console.log("Encountered retryable error", err);
        } else {
          console.log("Encountered unretryable error", err);
        }
      } else {
        console.log("Encountered unexpected error", err);
      }
      pagingToken = undefined;
    }
  } while (pagingToken != null);
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "SFN",
    "ListStateMachines",
    state,
  );
}
export async function DescribeStateMachine(
  client: SFNClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const state: GenericState[] = [];
  console.log("sfn DescribeStateMachine");
  const resolvers = [
    {
      Key: "stateMachineArn",
      Selector:
        "SFN|ListStateMachines|[]._result.stateMachines | [].stateMachineArn",
    },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as DescribeStateMachineCommandInput[];
  for (const parameters of parameterQueue) {
    const preparedParams: DescribeStateMachineCommandInput = parameters;
    try {
      const cmd = new DescribeStateMachineCommand(preparedParams);
      const result: DescribeStateMachineCommandOutput = await client.send(cmd);
      state.push({
        _metadata: { account: context.account, region: context.region },
        _parameters: preparedParams,
        _result: result,
      });
    } catch (err: unknown) {
      if (err instanceof SFNServiceException) {
        if (err?.$retryable) {
          console.log("Encountered retryable error", err);
        } else {
          console.log("Encountered unretryable error", err);
        }
      } else {
        console.log("Encountered unexpected error", err);
      }
    }
  }
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "SFN",
    "DescribeStateMachine",
    state,
  );
}

export async function getIamRoles(
  stateConnector: Connector,
): Promise<EntityRoleData[]> {
  const state: EntityRoleData[] = [];
  const DescribeStateMachineRoleState = (await evaluateSelectorGlobally(
    "SFN|DescribeStateMachine|[]._result.{roleArn:roleArn,executor:stateMachineArn}",
    stateConnector,
  )) as EntityRoleData[];
  state.push(...DescribeStateMachineRoleState);
  return state;
}
