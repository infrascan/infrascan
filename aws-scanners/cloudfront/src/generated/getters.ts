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
import debug from "debug";

export async function ListDistributions(
  client: CloudFrontClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("cloudfront:ListDistributions");
  const state: GenericState[] = [];
  getterDebug("ListDistributions");
  const preparedParams: ListDistributionsCommandInput = {};
  try {
    const cmd = new ListDistributionsCommand(preparedParams);
    const result: ListDistributionsCommandOutput = await client.send(cmd);
    state.push({
      _metadata: {
        account: context.account,
        region: context.region,
        timestamp: Date.now(),
      },
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
  getterDebug("Recording state");
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "CloudFront",
    "ListDistributions",
    state,
  );
}
