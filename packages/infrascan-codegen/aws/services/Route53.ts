import type { ServiceScanCompleteCallbackFn, ResolveStateFromServiceFn } from "@sharedTypes/api";
import type { GenericState } from "@sharedTypes/scan";
import { Route53 } from "@aws-sdk/client-route-53";

async function performScan(account: string, region: string, onServiceScanComplete: ServiceScanCompleteCallbackFn, resolveStateForServiceCall: ResolveStateFromServiceFn) {
  const Route53Client = new Route53({ region });

  const listHostedZonesByNameState: GenericState[] = [];
  try {
    console.log("route-53 listHostedZonesByName");
    let listHostedZonesByNamePagingToken = undefined;
    do {
      const result = await Route53Client.listHostedZonesByName({});
      listHostedZonesByNameState.push({ _metadata: { account, region }, _parameters: requestParameters, _result: result });
    } while (listHostedZonesByNamePagingToken != null);
  }
  catch (err: any) {
    if (err?.retryable) {
      console.log("Encountered retryable error", err);
    }
  }
  await onServiceScanComplete(account, region, "route-53", "listHostedZonesByName", listHostedZonesByNameState);

  const listResourceRecordSetsState: GenericState[] = [];
  const listResourceRecordSetsParameters: Record<string, any>[] = await resolveFunctionCallParameters(account, region, parameters, resolveStateForServiceCall);
  for (const requestParameters of listResourceRecordSetsParameters) {
    try {
      console.log("route-53 listResourceRecordSets");
      let listResourceRecordSetsPagingToken = undefined;
      do {
        const result = await Route53Client.listResourceRecordSets(requestParameters);
        listResourceRecordSetsState.push({ _metadata: { account, region }, _parameters: requestParameters, _result: result });
      } while (listResourceRecordSetsPagingToken != null);
    }
    catch (err: any) {
      if (err?.retryable) {
        console.log("Encountered retryable error", err);
      }
    }
  }
  await onServiceScanComplete(account, region, "route-53", "listResourceRecordSets", listResourceRecordSetsState);
}

export { performScan };
