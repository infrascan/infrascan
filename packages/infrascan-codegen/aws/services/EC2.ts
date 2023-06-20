import type { ServiceScanCompleteCallbackFn, ResolveStateFromServiceFn } from "@sharedTypes/api";
import type { GenericState } from "@sharedTypes/scan";
import { EC2 } from "@aws-sdk/client-ec2";
import * as formatters from "./formatters";

async function performScan(account: string, region: string, onServiceScanComplete: ServiceScanCompleteCallbackFn, resolveStateForServiceCall: ResolveStateFromServiceFn) {
  const EC2Client = new EC2({ region });

  const describeVpcsState: GenericState[] = [];
  try {
    console.log("ec2 describeVpcs");
    let describeVpcsPagingToken = undefined;
    do {
      const result = await EC2Client.describeVpcs({});
      const formattedResult = formatters.EC2.describeVPCs(result);
      describeVpcsState.push({ _metadata: { account, region }, _parameters: requestParameters, _result: formattedResult });
    } while (describeVpcsPagingToken != null);
  }
  catch (err: any) {
    if (err?.retryable) {
      console.log("Encountered retryable error", err);
    }
  }
  await onServiceScanComplete(account, region, "ec2", "describeVpcs", describeVpcsState);

  const describeAvailabilityZonesState: GenericState[] = [];
  try {
    console.log("ec2 describeAvailabilityZones");
    let describeAvailabilityZonesPagingToken = undefined;
    do {
      const result = await EC2Client.describeAvailabilityZones({});
      const formattedResult = formatters.EC2.describeAvailabilityZones(result);
      describeAvailabilityZonesState.push({ _metadata: { account, region }, _parameters: requestParameters, _result: formattedResult });
    } while (describeAvailabilityZonesPagingToken != null);
  }
  catch (err: any) {
    if (err?.retryable) {
      console.log("Encountered retryable error", err);
    }
  }
  await onServiceScanComplete(account, region, "ec2", "describeAvailabilityZones", describeAvailabilityZonesState);

  const describeSubnetsState: GenericState[] = [];
  try {
    console.log("ec2 describeSubnets");
    let describeSubnetsPagingToken = undefined;
    do {
      const result = await EC2Client.describeSubnets({});
      const formattedResult = formatters.EC2.describeSubnets(result);
      describeSubnetsState.push({ _metadata: { account, region }, _parameters: requestParameters, _result: formattedResult });
    } while (describeSubnetsPagingToken != null);
  }
  catch (err: any) {
    if (err?.retryable) {
      console.log("Encountered retryable error", err);
    }
  }
  await onServiceScanComplete(account, region, "ec2", "describeSubnets", describeSubnetsState);
}

export { performScan };
