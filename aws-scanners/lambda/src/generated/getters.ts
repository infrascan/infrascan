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
import debug from "debug";

export async function ListFunctions(
  client: LambdaClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("lambda:ListFunctions");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  let pagingToken: string | undefined;
  do {
    const preparedParams: ListFunctionsCommandInput = {};
    preparedParams.Marker = pagingToken;
    try {
      const cmd = new ListFunctionsCommand(preparedParams);
      const result: ListFunctionsCommandOutput = await client.send(cmd);
      state.push({
        _metadata: {
          account: context.account,
          region: context.region,
          timestamp: Date.now(),
        },
        _parameters: preparedParams,
        _result: result,
      });
      pagingToken = result.NextMarker;
      if (pagingToken != null) {
        getterDebug("Found pagination token in response");
      } else {
        getterDebug("No pagination token found in response");
      }
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
  getterDebug("Recording state");
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
  const getterDebug = debug("lambda:GetFunction");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
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
        _metadata: {
          account: context.account,
          region: context.region,
          timestamp: Date.now(),
        },
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
  getterDebug("Recording state");
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
  const iamDebug = debug("lambda:iam");
  iamDebug("Pulling IAM roles from state");
  const state: EntityRoleData[] = [];
  const GetFunctionRoleState = (await evaluateSelectorGlobally(
    "Lambda|GetFunction|[]._result.Configuration | [].{roleArn:Role,executor:FunctionArn}",
    stateConnector,
  )) as EntityRoleData[];
  state.push(...GetFunctionRoleState);
  return state;
}
