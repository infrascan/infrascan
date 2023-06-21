import type { ServiceScanCompleteCallbackFn, ResolveStateFromServiceFn } from "./types/api";
import type { GenericState } from "./types/scan";
import { CloudFrontClient, ListDistributionsCommandInput, ListDistributionsCommandOutput, ListDistributionsCommand } from "@aws-sdk/client-cloudfront";

// This file is autogenerated using infrascan-codegen. Do not manually edit this file.
async function performScan(account: string, region: string, iamClient: IAM, iamStorage: IAMStorage, onServiceCallComplete: ServiceScanCompleteCallbackFn, resolveStateForServiceCall: ResolveStateFromServiceFn) {
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
  await onServiceCallComplete(account, region, "cloudfront", "ListDistributions", ListDistributionsState);

}

export { performScan };
