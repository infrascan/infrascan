import { CloudWatchLogsClient, DescribeLogGroupsCommandInput, DescribeLogGroupsCommandOutput, DescribeLogGroupsCommand, DescribeSubscriptionFiltersCommandInput, DescribeSubscriptionFiltersCommandOutput, DescribeSubscriptionFiltersCommand } from "@aws-sdk/client-cloudwatch-logs";
import { scanIamRole, IAMStorage } from "../helpers/iam";
import { IAM } from "@aws-sdk/client-iam";
import { resolveFunctionCallParameters } from "../helpers/state";
import type { ServiceScanCompleteCallbackFn, ResolveStateForServiceFunction, GenericState } from "@infrascan/shared-types";
import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";

// This file is autogenerated using infrascan-codegen. Do not manually edit this file.
async function performScan(credentials: AwsCredentialIdentityProvider, account: string, region: string, iamClient: IAM, iamStorage: IAMStorage, onServiceCallComplete: ServiceScanCompleteCallbackFn, resolveStateForServiceCall: ResolveStateForServiceFunction) {
  const CloudWatchLogs = new CloudWatchLogsClient({ region, credentials });
  const DescribeLogGroupsState: GenericState[] = [];
  try {
    console.log("cloudwatch-logs DescribeLogGroups");
    let DescribeLogGroupsPagingToken: string | undefined = undefined;
    do {
      const DescribeLogGroupsCmd = new DescribeLogGroupsCommand({ "nextToken": DescribeLogGroupsPagingToken } as DescribeLogGroupsCommandInput);
      const result: DescribeLogGroupsCommandOutput = await CloudWatchLogs.send(DescribeLogGroupsCmd);
      DescribeLogGroupsState.push({ _metadata: { account, region }, _parameters: {}, _result: result });
      DescribeLogGroupsPagingToken = result["nextToken"];
    } while (DescribeLogGroupsPagingToken != null);
  }
  catch (err: any) {
    if (err?.retryable) {
      console.log("Encountered retryable error", err);
    }
    else {
      console.log("Encountered unretryable error", err);
    }
  }
  await onServiceCallComplete(account, region, "CloudWatchLogs", "DescribeLogGroups", DescribeLogGroupsState);

  const DescribeSubscriptionFiltersState: GenericState[] = [];
  const DescribeSubscriptionFiltersParameterResolvers = [{ "Key": "logGroupName", "Selector": "CloudWatchLogs|DescribeLogGroups|[]._result.logGroups[].logGroupName" }];
  const DescribeSubscriptionFiltersParameters = (await resolveFunctionCallParameters(account, region, DescribeSubscriptionFiltersParameterResolvers, resolveStateForServiceCall)) as DescribeSubscriptionFiltersCommandInput[];
  for (const requestParameters of DescribeSubscriptionFiltersParameters) {
    try {
      console.log("cloudwatch-logs DescribeSubscriptionFilters");
      let DescribeSubscriptionFiltersPagingToken: string | undefined = undefined;
      do {
        requestParameters["nextToken"] = DescribeSubscriptionFiltersPagingToken;
        const DescribeSubscriptionFiltersCmd = new DescribeSubscriptionFiltersCommand(requestParameters);
        const result: DescribeSubscriptionFiltersCommandOutput = await CloudWatchLogs.send(DescribeSubscriptionFiltersCmd);
        DescribeSubscriptionFiltersState.push({ _metadata: { account, region }, _parameters: requestParameters, _result: result });
        DescribeSubscriptionFiltersPagingToken = result["nextToken"];
      } while (DescribeSubscriptionFiltersPagingToken != null);
    }
    catch (err: any) {
      if (err?.retryable) {
        console.log("Encountered retryable error", err);
      }
      else {
        console.log("Encountered unretryable error", err);
      }
    }
  }
  await onServiceCallComplete(account, region, "CloudWatchLogs", "DescribeSubscriptionFilters", DescribeSubscriptionFiltersState);

}

const NODE_SELECTORS = ["CloudWatchLogs|DescribeSubscriptionFilters|[]._result.subscriptionFilters[].{id:logGroupName,name:logGroupName}"];
const EDGE_SELECTORS = [{ "state": "CloudWatchLogs|DescribeSubscriptionFilters|[]._result.subscriptionFilters[]", "from": "logGroupName", "to": "{target:destinationArn}" }];

export { performScan, NODE_SELECTORS, EDGE_SELECTORS };
