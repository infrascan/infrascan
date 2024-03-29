import {
  evaluateSelectorGlobally,
  resolveFunctionCallParameters,
} from "@infrascan/core";
import {
  LambdaClient,
  LambdaServiceException,
  ListFunctionsCommand,
  ListFunctionsCommandInput,
  ListFunctionsCommandOutput,
  GetFunctionCommand,
  GetFunctionCommandInput,
  GetFunctionCommandOutput,
} from "@aws-sdk/client-lambda";
import type {
  Connector,
  GenericState,
  AwsContext,
  EntityRoleData,
} from "@infrascan/shared-types";

export async function ListFunctions(
  client: LambdaClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const state: GenericState[] = [];
  console.log("lambda ListFunctions");
  let pagingToken: string | undefined;
  do {
    const preparedParams: ListFunctionsCommandInput = {};
    preparedParams.Marker = pagingToken;
    try {
      const cmd = new ListFunctionsCommand(preparedParams);
      const result: ListFunctionsCommandOutput = await client.send(cmd);
      state.push({
        _metadata: { account: context.account, region: context.region },
        _parameters: preparedParams,
        _result: result,
      });
      pagingToken = result.NextMarker;
    } catch (err: unknown) {
      if (err instanceof LambdaServiceException) {
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
    "Lambda",
    "ListFunctions",
    state,
  );
}
export async function GetFunction(
  client: LambdaClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const state: GenericState[] = [];
  console.log("lambda GetFunction");
  const resolvers = [
    {
      Key: "FunctionName",
      Selector: "Lambda|ListFunctions|[]._result.Functions[].FunctionArn",
    },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as GetFunctionCommandInput[];
  for (const parameters of parameterQueue) {
    const preparedParams: GetFunctionCommandInput = parameters;
    try {
      const cmd = new GetFunctionCommand(preparedParams);
      const result: GetFunctionCommandOutput = await client.send(cmd);
      state.push({
        _metadata: { account: context.account, region: context.region },
        _parameters: preparedParams,
        _result: result,
      });
    } catch (err: unknown) {
      if (err instanceof LambdaServiceException) {
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
    "Lambda",
    "GetFunction",
    state,
  );
}

export async function getIamRoles(
  stateConnector: Connector,
): Promise<EntityRoleData[]> {
  const state: EntityRoleData[] = [];
  const GetFunctionRoleState = (await evaluateSelectorGlobally(
    "Lambda|GetFunction|[]._result.Configuration | [].{roleArn:Role,executor:FunctionArn}",
    stateConnector,
  )) as EntityRoleData[];
  state.push(...GetFunctionRoleState);
  return state;
}
