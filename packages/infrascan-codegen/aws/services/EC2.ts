import type { ServiceScanCompleteCallbackFn, ResolveStateFromServiceFn } from "@sharedTypes/api";
import type { GenericState } from "@sharedTypes/scan";
import { EC2Client, DescribeVpcsCommand, DescribeVpcsCommandInput, DescribeVpcsCommandOutput, DescribeAvailabilityZonesCommand, DescribeAvailabilityZonesCommandInput, DescribeAvailabilityZonesCommandOutput, DescribeSubnetsCommand, DescribeSubnetsCommandInput, DescribeSubnetsCommandOutput } from "@aws-sdk/client-ec2";
import * as formatters from "./formatters";

async function performScan(account: string, region: string, onServiceScanComplete: ServiceScanCompleteCallbackFn, resolveStateForServiceCall: ResolveStateFromServiceFn) {
  const EC2 = new EC2Client({ region });

  const DescribeVpcsState: GenericState[] = [];
  try {
    console.log("ec2 DescribeVpcs");
    let DescribeVpcsPagingToken: string | undefined = undefined;
    do {
      const DescribeVpcsCmd = new DescribeVpcsCommand({} as DescribeVpcsCommandInput);
      const result: DescribeVpcsCommandOutput = await EC2.send(DescribeVpcsCmd);
      const formattedResult = formatters.EC2.describeVPCs(result);
      DescribeVpcsState.push({ _metadata: { account, region }, _parameters: {}, _result: formattedResult });
    } while (DescribeVpcsPagingToken != null);
  }
  catch (err: any) {
    if (err?.retryable) {
      console.log("Encountered retryable error", err);
    }
  }
  await onServiceScanComplete(account, region, "ec2", "DescribeVpcs", DescribeVpcsState);

  const DescribeAvailabilityZonesState: GenericState[] = [];
  try {
    console.log("ec2 DescribeAvailabilityZones");
    let DescribeAvailabilityZonesPagingToken: string | undefined = undefined;
    do {
      const DescribeAvailabilityZonesCmd = new DescribeAvailabilityZonesCommand({} as DescribeAvailabilityZonesCommandInput);
      const result: DescribeAvailabilityZonesCommandOutput = await EC2.send(DescribeAvailabilityZonesCmd);
      const formattedResult = formatters.EC2.describeAvailabilityZones(result);
      DescribeAvailabilityZonesState.push({ _metadata: { account, region }, _parameters: {}, _result: formattedResult });
    } while (DescribeAvailabilityZonesPagingToken != null);
  }
  catch (err: any) {
    if (err?.retryable) {
      console.log("Encountered retryable error", err);
    }
  }
  await onServiceScanComplete(account, region, "ec2", "DescribeAvailabilityZones", DescribeAvailabilityZonesState);

  const DescribeSubnetsState: GenericState[] = [];
  try {
    console.log("ec2 DescribeSubnets");
    let DescribeSubnetsPagingToken: string | undefined = undefined;
    do {
      const DescribeSubnetsCmd = new DescribeSubnetsCommand({} as DescribeSubnetsCommandInput);
      const result: DescribeSubnetsCommandOutput = await EC2.send(DescribeSubnetsCmd);
      const formattedResult = formatters.EC2.describeSubnets(result);
      DescribeSubnetsState.push({ _metadata: { account, region }, _parameters: {}, _result: formattedResult });
    } while (DescribeSubnetsPagingToken != null);
  }
  catch (err: any) {
    if (err?.retryable) {
      console.log("Encountered retryable error", err);
    }
  }
  await onServiceScanComplete(account, region, "ec2", "DescribeSubnets", DescribeSubnetsState);
}

export { performScan };
