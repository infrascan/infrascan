import { AutoScalingClient, DescribeAutoScalingGroupsCommandInput, DescribeAutoScalingGroupsCommandOutput, DescribeAutoScalingGroupsCommand } from "@aws-sdk/client-auto-scaling";
import { scanIamRole, IAMStorage } from "../helpers/iam";
import { IAM } from "@aws-sdk/client-iam";
import { Formatters } from "@infrascan/config";
import type { ServiceScanCompleteCallbackFn, ResolveStateFromServiceFn, GenericState } from "@infrascan/shared-types";
import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";

// This file is autogenerated using infrascan-codegen. Do not manually edit this file.
async function performScan(credentials: AwsCredentialIdentityProvider, account: string, region: string, iamClient: IAM, iamStorage: IAMStorage, onServiceCallComplete: ServiceScanCompleteCallbackFn, resolveStateForServiceCall: ResolveStateFromServiceFn) {
  const AutoScaling = new AutoScalingClient({ region, credentials });
  const DescribeAutoScalingGroupsState: GenericState[] = [];
  try {
    console.log("auto-scaling DescribeAutoScalingGroups");
    let DescribeAutoScalingGroupsPagingToken: string | undefined = undefined;
    do {
      const DescribeAutoScalingGroupsCmd = new DescribeAutoScalingGroupsCommand({} as DescribeAutoScalingGroupsCommandInput);
      const result: DescribeAutoScalingGroupsCommandOutput = await AutoScaling.send(DescribeAutoScalingGroupsCmd);
      const formattedResult = Formatters.AutoScaling.describeAutoScalingGroups(result);
      DescribeAutoScalingGroupsState.push({ _metadata: { account, region }, _parameters: {}, _result: formattedResult });
    } while (DescribeAutoScalingGroupsPagingToken != null);
  }
  catch (err: any) {
    if (err?.retryable) {
      console.log("Encountered retryable error", err);
    }
    else {
      console.log("Encountered unretryable error", err);
    }
  }
  await onServiceCallComplete(account, region, "AutoScaling", "DescribeAutoScalingGroups", DescribeAutoScalingGroupsState);

}

export { performScan };
