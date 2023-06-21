import type { ServiceScanCompleteCallbackFn, ResolveStateFromServiceFn } from "@sharedTypes/api";
import type { GenericState } from "@sharedTypes/scan";
import { LambdaClient, ListFunctionsCommand, ListFunctionsCommandInput, ListFunctionsCommandOutput, GetFunctionCommand, GetFunctionCommandInput, GetFunctionCommandOutput } from "@aws-sdk/client-lambda";
import { IAM } from "@aws-sdk/client-iam";
import jmespath from "jmespath";

async function performScan(account: string, region: string, onServiceScanComplete: ServiceScanCompleteCallbackFn, resolveStateForServiceCall: ResolveStateFromServiceFn) {
  const Lambda = new LambdaClient({ region });

  const ListFunctionsState: GenericState[] = [];
  try {
    console.log("lambda ListFunctions");
    let ListFunctionsPagingToken: string | undefined = undefined;
    do {
      const ListFunctionsCmd = new ListFunctionsCommand({ "Marker": ListFunctionsPagingToken } as ListFunctionsCommandInput);
      const result: ListFunctionsCommandOutput = await Lambda.send(ListFunctionsCmd);
      ListFunctionsState.push({ _metadata: { account, region }, _parameters: {}, _result: result });
      ListFunctionsPagingToken = result["NextMarker"];
    } while (ListFunctionsPagingToken != null);
  }
  catch (err: any) {
    if (err?.retryable) {
      console.log("Encountered retryable error", err);
    }
  }
  await onServiceScanComplete(account, region, "lambda", "ListFunctions", ListFunctionsState);

  const GetFunctionState: GenericState[] = [];
  const GetFunctionParameterResolvers = [{ "Key": "FunctionName", "Selector": "Lambda|ListFunctions|[]._result.Functions[].FunctionArn" }];
  const GetFunctionParameters = (await resolveFunctionCallParameters(account, region, GetFunctionParameterResolvers, resolveStateForServiceCall)) as GetFunctionCommandInput[];
  for (const requestParameters of GetFunctionParameters) {
    try {
      console.log("lambda GetFunction");
      let GetFunctionPagingToken: string | undefined = undefined;
      do {
        const GetFunctionCmd = new GetFunctionCommand(requestParameters);
        const result: GetFunctionCommandOutput = await Lambda.send(GetFunctionCmd);
        GetFunctionState.push({ _metadata: { account, region }, _parameters: requestParameters, _result: result });
        const iamRoleSelectors = ["Configuration.Role"];
        for (const selector of iamRoleSelectors) {
          const selectionResult = jmespath.search(result, selector);
          if (Array.isArray(selectionResult)
                {
            for (const roleArn of selectionResult) {
              console.log(roleArn);
            }
          }
          else if (selectionResult != null) {
            console.log(selectionResult);
          }
        }
      } while (GetFunctionPagingToken != null);
    }
    catch (err: any) {
      if (err?.retryable) {
        console.log("Encountered retryable error", err);
      }
    }
  }
  await onServiceScanComplete(account, region, "lambda", "GetFunction", GetFunctionState);
}

export { performScan };
