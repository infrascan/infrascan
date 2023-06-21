import type { ServiceScanCompleteCallbackFn, ResolveStateFromServiceFn } from "@sharedTypes/api";
import type { GenericState } from "@sharedTypes/scan";
import { Route53Client, ListHostedZonesByNameCommand, ListHostedZonesByNameCommandInput, ListHostedZonesByNameCommandOutput, ListResourceRecordSetsCommand, ListResourceRecordSetsCommandInput, ListResourceRecordSetsCommandOutput } from "@aws-sdk/client-route-53";

async function performScan(account: string, region: string, onServiceScanComplete: ServiceScanCompleteCallbackFn, resolveStateForServiceCall: ResolveStateFromServiceFn) {
  const Route53 = new Route53Client({ region });

  const ListHostedZonesByNameState: GenericState[] = [];
  try {
    console.log("route-53 ListHostedZonesByName");
    let ListHostedZonesByNamePagingToken: string | undefined = undefined;
    do {
      const ListHostedZonesByNameCmd = new ListHostedZonesByNameCommand({} as ListHostedZonesByNameCommandInput);
      const result: ListHostedZonesByNameCommandOutput = await Route53.send(ListHostedZonesByNameCmd);
      ListHostedZonesByNameState.push({ _metadata: { account, region }, _parameters: {}, _result: result });
    } while (ListHostedZonesByNamePagingToken != null);
  }
  catch (err: any) {
    if (err?.retryable) {
      console.log("Encountered retryable error", err);
    }
  }
  await onServiceScanComplete(account, region, "route-53", "ListHostedZonesByName", ListHostedZonesByNameState);

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
        ListResourceRecordSetsState.push({ _metadata: { account, region }, _parameters: requestParameters, _result: result });
      } while (ListResourceRecordSetsPagingToken != null);
    }
    catch (err: any) {
      if (err?.retryable) {
        console.log("Encountered retryable error", err);
      }
    }
  }
  await onServiceScanComplete(account, region, "route-53", "ListResourceRecordSets", ListResourceRecordSetsState);
}

export { performScan };
