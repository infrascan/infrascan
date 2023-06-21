import type { ServiceScanCompleteCallbackFn, ResolveStateFromServiceFn } from "@sharedTypes/api";
import type { GenericState } from "@sharedTypes/scan";
import { CloudFrontClient, ListDistributionsCommand, ListDistributionsCommandInput, ListDistributionsCommandOutput } from "@aws-sdk/client-cloudfront";

async function performScan(account: string, region: string, onServiceScanComplete: ServiceScanCompleteCallbackFn, resolveStateForServiceCall: ResolveStateFromServiceFn) {
  const CloudFront = new CloudFrontClient({ region });

  const ListDistributionsState: GenericState[] = [];
  try {
    console.log("cloudfront ListDistributions");
    let ListDistributionsPagingToken: string | undefined = undefined;
    do {
      const ListDistributionsCmd = new ListDistributionsCommand({} as ListDistributionsCommandInput);
      const result: ListDistributionsCommandOutput = await CloudFront.send(ListDistributionsCmd);
      ListDistributionsState.push({ _metadata: { account, region }, _parameters: {}, _result: result });
    } while (ListDistributionsPagingToken != null);
  }
  catch (err: any) {
    if (err?.retryable) {
      console.log("Encountered retryable error", err);
    }
  }
  await onServiceScanComplete(account, region, "cloudfront", "ListDistributions", ListDistributionsState);
}

export { performScan };
