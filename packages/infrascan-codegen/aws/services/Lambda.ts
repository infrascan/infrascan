import type { ServiceScanCompleteCallbackFn, ResolveStateFromServiceFn } from "@sharedTypes/api";
import type { GenericState } from "@sharedTypes/scan";
import { Lambda } from "@aws-sdk/client-lambda";
import { IAM } from "@aws-sdk/client-iam";
import jmespath from "jmespath";

async function performScan(account: string, region: string, onServiceScanComplete: ServiceScanCompleteCallbackFn, resolveStateForServiceCall: ResolveStateFromServiceFn) {
  const LambdaClient = new Lambda({ region });

  const listFunctionsState: GenericState[] = [];
  try {
    console.log("lambda listFunctions");
    let listFunctionsPagingToken = undefined;
    do {
      requestParameters[Marker] = listFunctionsPagingToken;
      const result = await LambdaClient.listFunctions({});
      listFunctionsState.push({ _metadata: { account, region }, _parameters: requestParameters, _result: result });
      listFunctionsPagingToken = result[NextMarker];
    } while (listFunctionsPagingToken != null);
  }
  catch (err: any) {
    if (err?.retryable) {
      console.log("Encountered retryable error", err);
    }
  }
  await onServiceScanComplete(account, region, "lambda", "listFunctions", listFunctionsState);

  const getFunctionState: GenericState[] = [];
  const getFunctionParameters: Record<string, any>[] = await resolveFunctionCallParameters(account, region, parameters, resolveStateForServiceCall);
  for (const requestParameters of getFunctionParameters) {
    try {
      console.log("lambda getFunction");
      let getFunctionPagingToken = undefined;
      do {
        const result = await LambdaClient.getFunction(requestParameters);
        getFunctionState.push({ _metadata: { account, region }, _parameters: requestParameters, _result: result });
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
      } while (getFunctionPagingToken != null);
    }
    catch (err: any) {
      if (err?.retryable) {
        console.log("Encountered retryable error", err);
      }
    }
  }
  await onServiceScanComplete(account, region, "lambda", "getFunction", getFunctionState);
}

export { performScan };
