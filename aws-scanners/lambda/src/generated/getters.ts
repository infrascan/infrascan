import * as Lambda from "@aws-sdk/client-lambda";
import type { Connector, GenericState } from "@infrascan/shared-types";
export async function ListFunctions(
  client: Lambda.LambdaClient,
  stateConnector: Connector,
  account: string,
  region: string,
): Promise<void> {
  const state: GenericState[] = [];
  try {
    console.log("lambda ListFunctions");
    let pagingToken: string | undefined = undefined;
    do {
      const preparedParams: Lambda.ListFunctionsCommandInput = {};
      preparedParams["Marker"] = pagingToken;
      const cmd = new Lambda.ListFunctionsCommand(preparedParams);
      const result: Lambda.ListFunctionsCommandOutput = await client.send(cmd);
      state.push({
        _metadata: { account, region },
        _parameters: preparedParams,
        _result: result,
      });
      pagingToken = result["NextMarker"];
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
  client: Lambda.LambdaClient,
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
    const parameterQueue: Lambda.GetFunctionCommandInput[] =
      await resolveFunctionCallParameters(
        account,
        region,
        resolvers,
        stateConnector.resolveStateForServiceFunction,
      );
    for (const parameters of parameterQueue) {
      const preparedParams: Lambda.GetFunctionCommandInput = parameters;
      const cmd = new Lambda.GetFunctionCommand(preparedParams);
      const result: Lambda.GetFunctionCommandOutput = await client.send(cmd);
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
