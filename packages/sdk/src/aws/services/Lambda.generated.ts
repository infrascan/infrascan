import {
  LambdaClient,
  ListFunctionsCommandInput,
  ListFunctionsCommandOutput,
  ListFunctionsCommand,
  GetFunctionCommandInput,
  GetFunctionCommandOutput,
  GetFunctionCommand,
} from "@aws-sdk/client-lambda";
import { scanIamRole, IAMStorage } from "../helpers/iam";
import { IAM } from "@aws-sdk/client-iam";
import jmespath from "jmespath";
import { resolveFunctionCallParameters } from "../helpers/state";
import type {
  ServiceScanCompleteCallbackFn,
  ResolveStateForServiceFunction,
  GenericState,
} from "@infrascan/shared-types";
import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";

// This file is autogenerated using infrascan-codegen. Do not manually edit this file.
async function performScan(
  credentials: AwsCredentialIdentityProvider,
  account: string,
  region: string,
  iamClient: IAM,
  iamStorage: IAMStorage,
  onServiceCallComplete: ServiceScanCompleteCallbackFn,
  resolveStateForServiceCall: ResolveStateForServiceFunction,
) {
  const Lambda = new LambdaClient({ region, credentials });
  const ListFunctionsState: GenericState[] = [];
  try {
    console.log("lambda ListFunctions");
    let ListFunctionsPagingToken: string | undefined = undefined;
    do {
      const ListFunctionsCmd = new ListFunctionsCommand({
        Marker: ListFunctionsPagingToken,
      } as ListFunctionsCommandInput);
      const result: ListFunctionsCommandOutput = await Lambda.send(
        ListFunctionsCmd,
      );
      ListFunctionsState.push({
        _metadata: { account, region },
        _parameters: {},
        _result: result,
      });
      ListFunctionsPagingToken = result["NextMarker"];
    } while (ListFunctionsPagingToken != null);
  } catch (err: any) {
    if (err?.retryable) {
      console.log("Encountered retryable error", err);
    } else {
      console.log("Encountered unretryable error", err);
    }
  }
  await onServiceCallComplete(
    account,
    region,
    "Lambda",
    "ListFunctions",
    ListFunctionsState,
  );

  const GetFunctionState: GenericState[] = [];
  const GetFunctionParameterResolvers = [
    {
      Key: "FunctionName",
      Selector: "Lambda|ListFunctions|[]._result.Functions[].FunctionArn",
    },
  ];
  const GetFunctionParameters = (await resolveFunctionCallParameters(
    account,
    region,
    GetFunctionParameterResolvers,
    resolveStateForServiceCall,
  )) as GetFunctionCommandInput[];
  for (const requestParameters of GetFunctionParameters) {
    try {
      console.log("lambda GetFunction");
      let GetFunctionPagingToken: string | undefined = undefined;
      do {
        const GetFunctionCmd = new GetFunctionCommand(requestParameters);
        const result: GetFunctionCommandOutput = await Lambda.send(
          GetFunctionCmd,
        );
        GetFunctionState.push({
          _metadata: { account, region },
          _parameters: requestParameters,
          _result: result,
        });
        const iamRoleSelectors = ["Configuration.Role"];
        for (const selector of iamRoleSelectors) {
          const selectionResult = jmespath.search(result, selector);
          if (Array.isArray(selectionResult)) {
            for (const roleArn of selectionResult) {
              await scanIamRole(iamStorage, iamClient, roleArn);
            }
          } else if (selectionResult != null) {
            await scanIamRole(iamStorage, iamClient, selectionResult);
          }
        }
      } while (GetFunctionPagingToken != null);
    } catch (err: any) {
      if (err?.retryable) {
        console.log("Encountered retryable error", err);
      } else {
        console.log("Encountered unretryable error", err);
      }
    }
  }
  await onServiceCallComplete(
    account,
    region,
    "Lambda",
    "GetFunction",
    GetFunctionState,
  );
}

const NODE_SELECTORS = [
  "Lambda|ListFunctions|[]._result.Functions[].{id: FunctionArn,name:FunctionName}",
];

export { performScan, NODE_SELECTORS };