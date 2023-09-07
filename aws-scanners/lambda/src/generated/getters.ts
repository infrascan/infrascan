import {
  LambdaClient,
  ListFunctionsCommand,
  GetFunctionCommand,
} from "@aws-sdk/client-lambda";
import { resolveFunctionCallParameters } from "@infrascan/core";
import type { Connector, GenericState } from "@infrascan/shared-types";
import type {
  ListFunctionsCommandInput,
  ListFunctionsCommandOutput,
  GetFunctionCommandInput,
  GetFunctionCommandOutput,
} from "@aws-sdk/client-lambda";

export async function ListFunctions(
  client: LambdaClient,
  stateConnector: Connector,
  account: string,
  region: string,
): Promise<void> {
  const state: GenericState[] = [];
  try {
    console.log("lambda ListFunctions");
    let pagingToken: string | undefined = undefined;
    do {
      const preparedParams: ListFunctionsCommandInput = {};
      preparedParams.Marker = pagingToken;
      const cmd = new ListFunctionsCommand(preparedParams);
      const result: ListFunctionsCommandOutput = await client.send(cmd);
      state.push({
        _metadata: { account, region },
        _parameters: preparedParams,
        _result: result,
      });
      pagingToken = result.NextMarker;
    } while (pagingToken != null);
  } catch (err: any) {
    if (err?.retryable) {
      console.log("Encountered retryable error", err);
    } else {
      console.log("Encountered unretryable error", err);
    }
  }
  await stateConnector.onServiceScanCompleteCallback(
    account,
    region,
    "Lambda",
    "ListFunctions",
    state,
  );
}

export async function GetFunction(
  client: LambdaClient,
  stateConnector: Connector,
  account: string,
  region: string,
): Promise<void> {
  const state: GenericState[] = [];
  try {
    console.log("lambda GetFunction");
    const resolvers = [
      {
        Key: "FunctionName",
        Selector: "Lambda|ListFunctions|[]._result.Functions[].FunctionArn",
      },
    ];
    const parameterQueue = (await resolveFunctionCallParameters(
      account,
      region,
      resolvers,
      stateConnector,
    )) as GetFunctionCommandInput[];
    for (const parameters of parameterQueue) {
      const preparedParams: GetFunctionCommandInput = parameters;
      const cmd = new GetFunctionCommand(preparedParams);
      const result: GetFunctionCommandOutput = await client.send(cmd);
      state.push({
        _metadata: { account, region },
        _parameters: preparedParams,
        _result: result,
      });
    }
  } catch (err: any) {
    if (err?.retryable) {
      console.log("Encountered retryable error", err);
    } else {
      console.log("Encountered unretryable error", err);
    }
  }
  await stateConnector.onServiceScanCompleteCallback(
    account,
    region,
    "Lambda",
    "GetFunction",
    state,
  );
}
