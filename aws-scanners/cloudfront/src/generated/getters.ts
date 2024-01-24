import {
  CloudFrontClient,
  CloudFrontServiceException,
  ListDistributionsCommand,
  ListDistributionsCommandInput,
  ListDistributionsCommandOutput,
} from "@aws-sdk/client-cloudfront";
import type {
  Connector,
  GenericState,
  AwsContext,
} from "@infrascan/shared-types";

export async function ListDistributions(
  client: CloudFrontClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const state: GenericState[] = [];
  console.log("cloudfront ListDistributions");
  const preparedParams: ListDistributionsCommandInput = {};
  try {
    const cmd = new ListDistributionsCommand(preparedParams);
    const result: ListDistributionsCommandOutput = await client.send(cmd);
    state.push({
      _metadata: { account: context.account, region: context.region },
      _parameters: preparedParams,
      _result: result,
    });
  } catch (err: unknown) {
    if (err instanceof CloudFrontServiceException) {
      if (err?.$retryable) {
        console.log("Encountered retryable error", err);
      } else {
        console.log("Encountered unretryable error", err);
      }
    } else {
      console.log("Encountered unexpected error", err);
    }
  }
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "CloudFront",
    "ListDistributions",
    state,
  );
}
