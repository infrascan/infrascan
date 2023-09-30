import {
  EC2Client,
  DescribeVpcsCommand,
  DescribeAvailabilityZonesCommand,
  DescribeSubnetsCommand,
  EC2ServiceException,
} from "@aws-sdk/client-ec2";
import type {
  Connector,
  GenericState,
  AwsContext,
} from "@infrascan/shared-types";
import type {
  DescribeVpcsCommandInput,
  DescribeVpcsCommandOutput,
  DescribeAvailabilityZonesCommandInput,
  DescribeAvailabilityZonesCommandOutput,
  DescribeSubnetsCommandInput,
  DescribeSubnetsCommandOutput,
} from "@aws-sdk/client-ec2";

export async function DescribeVpcs(
  client: EC2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const state: GenericState[] = [];
  try {
    console.log("ec2 DescribeVpcs");
    const preparedParams: DescribeVpcsCommandInput = {};
    const cmd = new DescribeVpcsCommand(preparedParams);
    const result: DescribeVpcsCommandOutput = await client.send(cmd);
    state.push({
      _metadata: { account: context.account, region: context.region },
      _parameters: preparedParams,
      _result: result,
    });
  } catch (err: unknown) {
    if (err instanceof EC2ServiceException) {
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
    "EC2",
    "DescribeVpcs",
    state,
  );
}

export async function DescribeAvailabilityZones(
  client: EC2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const state: GenericState[] = [];
  try {
    console.log("ec2 DescribeAvailabilityZones");
    const preparedParams: DescribeAvailabilityZonesCommandInput = {};
    const cmd = new DescribeAvailabilityZonesCommand(preparedParams);
    const result: DescribeAvailabilityZonesCommandOutput = await client.send(
      cmd,
    );
    state.push({
      _metadata: { account: context.account, region: context.region },
      _parameters: preparedParams,
      _result: result,
    });
  } catch (err: unknown) {
    if (err instanceof EC2ServiceException) {
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
    "EC2",
    "DescribeAvailabilityZones",
    state,
  );
}

export async function DescribeSubnets(
  client: EC2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const state: GenericState[] = [];
  try {
    console.log("ec2 DescribeSubnets");
    const preparedParams: DescribeSubnetsCommandInput = {};
    const cmd = new DescribeSubnetsCommand(preparedParams);
    const result: DescribeSubnetsCommandOutput = await client.send(cmd);
    state.push({
      _metadata: { account: context.account, region: context.region },
      _parameters: preparedParams,
      _result: result,
    });
  } catch (err: unknown) {
    if (err instanceof EC2ServiceException) {
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
    "EC2",
    "DescribeSubnets",
    state,
  );
}
