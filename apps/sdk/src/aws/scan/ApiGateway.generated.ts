import type { ServiceScanCompleteCallbackFn, ResolveStateFromServiceFn } from "@shared-types/api";
import type { GenericState } from "@shared-types/scan";
import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";
import { APIGatewayClient, GetRestApisCommandInput, GetRestApisCommandOutput, GetRestApisCommand, GetDomainNamesCommandInput, GetDomainNamesCommandOutput, GetDomainNamesCommand } from "@aws-sdk/client-api-gateway";
import { scanIamRole, IAMStorage } from "../helpers/iam";
import { IAM } from "@aws-sdk/client-iam";
import * as formatters from "../helpers/formatters";

// This file is autogenerated using infrascan-codegen. Do not manually edit this file.
async function performScan(credentials: AwsCredentialIdentityProvider, account: string, region: string, iamClient: IAM, iamStorage: IAMStorage, onServiceCallComplete: ServiceScanCompleteCallbackFn, resolveStateForServiceCall: ResolveStateFromServiceFn) {
  const APIGateway = new APIGatewayClient({ region, credentials });
  const GetRestApisState: GenericState[] = [];
  try {
    console.log("api-gateway GetRestApis");
    let GetRestApisPagingToken: string | undefined = undefined;
    do {
      const GetRestApisCmd = new GetRestApisCommand({} as GetRestApisCommandInput);
      const result: GetRestApisCommandOutput = await APIGateway.send(GetRestApisCmd);
      const formattedResult = formatters.ApiGateway.getRestApis(result);
      GetRestApisState.push({ _metadata: { account, region }, _parameters: {}, _result: formattedResult });
    } while (GetRestApisPagingToken != null);
  }
  catch (err: any) {
    if (err?.retryable) {
      console.log("Encountered retryable error", err);
    }
  }
  await onServiceCallComplete(account, region, "api-gateway", "GetRestApis", GetRestApisState);

  const GetDomainNamesState: GenericState[] = [];
  try {
    console.log("api-gateway GetDomainNames");
    let GetDomainNamesPagingToken: string | undefined = undefined;
    do {
      const GetDomainNamesCmd = new GetDomainNamesCommand({} as GetDomainNamesCommandInput);
      const result: GetDomainNamesCommandOutput = await APIGateway.send(GetDomainNamesCmd);
      const formattedResult = formatters.ApiGateway.getDomainNames(result);
      GetDomainNamesState.push({ _metadata: { account, region }, _parameters: {}, _result: formattedResult });
    } while (GetDomainNamesPagingToken != null);
  }
  catch (err: any) {
    if (err?.retryable) {
      console.log("Encountered retryable error", err);
    }
  }
  await onServiceCallComplete(account, region, "api-gateway", "GetDomainNames", GetDomainNamesState);

}

export { performScan };
