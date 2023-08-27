import {
  CloudFrontClient,
  ListDistributionsCommandInput,
  ListDistributionsCommandOutput,
  ListDistributionsCommand,
} from "@aws-sdk/client-cloudfront";
import { scanIamRole, IAMStorage } from "../helpers/iam";
import { IAM } from "@aws-sdk/client-iam";
import { Formatters } from "@infrascan/config";
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
  const CloudFront = new CloudFrontClient({ region, credentials });
  const ListDistributionsState: GenericState[] = [];
  try {
    console.log("cloudfront ListDistributions");
    let ListDistributionsPagingToken: string | undefined = undefined;
    do {
      const ListDistributionsCmd = new ListDistributionsCommand(
        {} as ListDistributionsCommandInput,
      );
      const result: ListDistributionsCommandOutput = await CloudFront.send(
        ListDistributionsCmd,
      );
      const formattedResult = Formatters.CloudFront.listDistributions(result);
      ListDistributionsState.push({
        _metadata: { account, region },
        _parameters: {},
        _result: formattedResult,
      });
    } while (ListDistributionsPagingToken != null);
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
    "CloudFront",
    "ListDistributions",
    ListDistributionsState,
  );
}

const NODE_SELECTORS = [
  "CloudFront|ListDistributions|[]._result[].{id:ARN,name:_infrascanLabel}",
];

export { performScan, NODE_SELECTORS };
