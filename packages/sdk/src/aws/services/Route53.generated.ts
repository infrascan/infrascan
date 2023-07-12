import { Route53Client, ListHostedZonesByNameCommandInput, ListHostedZonesByNameCommandOutput, ListHostedZonesByNameCommand, ListResourceRecordSetsCommandInput, ListResourceRecordSetsCommandOutput, ListResourceRecordSetsCommand } from "@aws-sdk/client-route-53";
import { scanIamRole, IAMStorage } from "../helpers/iam";
import { IAM } from "@aws-sdk/client-iam";
import { resolveFunctionCallParameters } from "../helpers/state";
import { Formatters } from "@infrascan/config";
import type { ServiceScanCompleteCallbackFn, ResolveStateFromServiceFn, GenericState } from "@infrascan/shared-types";
import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";

// This file is autogenerated using infrascan-codegen. Do not manually edit this file.
async function performScan(credentials: AwsCredentialIdentityProvider, account: string, region: string, iamClient: IAM, iamStorage: IAMStorage, onServiceCallComplete: ServiceScanCompleteCallbackFn, resolveStateForServiceCall: ResolveStateFromServiceFn) {
  const Route53 = new Route53Client({ region, credentials });
  const ListHostedZonesByNameState: GenericState[] = [];
  try {
    console.log("route-53 ListHostedZonesByName");
    let ListHostedZonesByNamePagingToken: string | undefined = undefined;
    do {
      const ListHostedZonesByNameCmd = new ListHostedZonesByNameCommand({} as ListHostedZonesByNameCommandInput);
      const result: ListHostedZonesByNameCommandOutput = await Route53.send(ListHostedZonesByNameCmd);
      const formattedResult = Formatters.Route53.listHostedZonesByName(result);
      ListHostedZonesByNameState.push({ _metadata: { account, region }, _parameters: {}, _result: formattedResult });
    } while (ListHostedZonesByNamePagingToken != null);
  }
  catch (err: any) {
    if (err?.retryable) {
      console.log("Encountered retryable error", err);
    }
  }
  await onServiceCallComplete(account, region, "Route53", "ListHostedZonesByName", ListHostedZonesByNameState);

  const ListResourceRecordSetsState: GenericState[] = [];
  const ListResourceRecordSetsParameterResolvers = [{ "Key": "HostedZoneId", "Selector": "Route53|ListHostedZonesByName|[]._result[].Id" }];
  const ListResourceRecordSetsParameters = (await resolveFunctionCallParameters(account, region, ListResourceRecordSetsParameterResolvers, resolveStateForServiceCall)) as ListResourceRecordSetsCommandInput[];
  for (const requestParameters of ListResourceRecordSetsParameters) {
    try {
      console.log("route-53 ListResourceRecordSets");
      let ListResourceRecordSetsPagingToken: string | undefined = undefined;
      do {
        const ListResourceRecordSetsCmd = new ListResourceRecordSetsCommand(requestParameters);
        const result: ListResourceRecordSetsCommandOutput = await Route53.send(ListResourceRecordSetsCmd);
        const formattedResult = Formatters.Route53.listResourceRecordSets(result);
        ListResourceRecordSetsState.push({ _metadata: { account, region }, _parameters: requestParameters, _result: formattedResult });
      } while (ListResourceRecordSetsPagingToken != null);
    }
    catch (err: any) {
      if (err?.retryable) {
        console.log("Encountered retryable error", err);
      }
    }
  }
  await onServiceCallComplete(account, region, "Route53", "ListResourceRecordSets", ListResourceRecordSetsState);

}

const NODE_SELECTORS = ["Route53|ListResourceRecordSets|[]._result[?Type==`A`] | [].{id:Name,name:Name}"];

export { performScan, NODE_SELECTORS };
