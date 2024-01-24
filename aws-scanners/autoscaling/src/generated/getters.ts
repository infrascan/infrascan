import {
  AutoScalingClient,
  AutoScalingServiceException,
  DescribeAutoScalingGroupsCommand,
  DescribeAutoScalingGroupsCommandInput,
  DescribeAutoScalingGroupsCommandOutput,
} from "@aws-sdk/client-auto-scaling";
import type {
  Connector,
  GenericState,
  AwsContext,
} from "@infrascan/shared-types";

export async function DescribeAutoScalingGroups(
  client: AutoScalingClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const state: GenericState[] = [];
  console.log("auto-scaling DescribeAutoScalingGroups");
  const preparedParams: DescribeAutoScalingGroupsCommandInput = {};
  try {
    const cmd = new DescribeAutoScalingGroupsCommand(preparedParams);
    const result: DescribeAutoScalingGroupsCommandOutput = await client.send(
      cmd,
    );
    state.push({
      _metadata: { account: context.account, region: context.region },
      _parameters: preparedParams,
      _result: result,
    });
  } catch (err: unknown) {
    if (err instanceof AutoScalingServiceException) {
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
    "AutoScaling",
    "DescribeAutoScalingGroups",
    state,
  );
}
