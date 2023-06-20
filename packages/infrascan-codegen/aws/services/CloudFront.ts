import type { ServiceScanCompleteCallbackFn, ResolveStateFromServiceFn } from "@sharedTypes/api";
import type { GenericState } from "@sharedTypes/scan";
import { CloudFront } from "@aws-sdk/client-cloudfront";

async function performScan(account: string, region: string, onServiceScanComplete: ServiceScanCompleteCallbackFn, resolveStateForServiceCall: ResolveStateFromServiceFn) {
  const CloudFrontClient = new CloudFront({ region });

  const listDistributionsState: GenericState[] = [];
  try {
    console.log("cloudfront listDistributions");
    let listDistributionsPagingToken = undefined;
    do {
      const result = await CloudFrontClient.listDistributions({});
      listDistributionsState.push({ _metadata: { account, region }, _parameters: requestParameters, _result: result });
    } while (listDistributionsPagingToken != null);
  }
  catch (err: any) {
    if (err?.retryable) {
      console.log("Encountered retryable error", err);
    }
  }
  await onServiceScanComplete(account, region, "cloudfront", "listDistributions", listDistributionsState);
}

export { performScan };
