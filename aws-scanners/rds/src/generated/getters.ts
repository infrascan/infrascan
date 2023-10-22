import {
  RDSClient,
  DescribeDBInstancesCommand,
  RDSServiceException,
} from "@aws-sdk/client-rds";
import type {
  Connector,
  GenericState,
  AwsContext,
} from "@infrascan/shared-types";
import type {
  DescribeDBInstancesCommandInput,
  DescribeDBInstancesCommandOutput,
} from "@aws-sdk/client-rds";

export async function DescribeDBInstances(
  client: RDSClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const state: GenericState[] = [];
  console.log("rds DescribeDBInstances");
  const preparedParams: DescribeDBInstancesCommandInput = {};
  try {
    const cmd = new DescribeDBInstancesCommand(preparedParams);
    const result: DescribeDBInstancesCommandOutput = await client.send(cmd);
    state.push({
      _metadata: { account: context.account, region: context.region },
      _parameters: preparedParams,
      _result: result,
    });
  } catch (err: unknown) {
    if (err instanceof RDSServiceException) {
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
    "RDS",
    "DescribeDBInstances",
    state,
  );
}
