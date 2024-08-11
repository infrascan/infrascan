import { resolveFunctionCallParameters } from "@infrascan/core";
import {
  CloudWatchLogsClient,
  CloudWatchLogsServiceException,
  DescribeLogGroupsCommand,
  DescribeLogGroupsCommandInput,
  DescribeLogGroupsCommandOutput,
  DescribeSubscriptionFiltersCommand,
  DescribeSubscriptionFiltersCommandInput,
  DescribeSubscriptionFiltersCommandOutput,
} from "@aws-sdk/client-cloudwatch-logs";
import type {
  Connector,
  GenericState,
  AwsContext,
} from "@infrascan/shared-types";
import debug from "debug";

export async function DescribeLogGroups(
  client: CloudWatchLogsClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("cloudwatch-logs:DescribeLogGroups");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  let pagingToken: string | undefined;
  do {
    const preparedParams: DescribeLogGroupsCommandInput = {};
    preparedParams.nextToken = pagingToken;
    try {
      const cmd = new DescribeLogGroupsCommand(preparedParams);
      const result: DescribeLogGroupsCommandOutput = await client.send(cmd);
      state.push({
        _metadata: { account: context.account, region: context.region },
        _parameters: preparedParams,
        _result: result,
      });
      pagingToken = result.nextToken;
      if (pagingToken != null) {
        getterDebug("Found pagination token in response");
      } else {
        getterDebug("No pagination token found in response");
      }
    } catch (err: unknown) {
      if (err instanceof CloudWatchLogsServiceException) {
        if (err?.$retryable) {
          console.log("Encountered retryable error", err);
        } else {
          console.log("Encountered unretryable error", err);
        }
      } else {
        console.log("Encountered unexpected error", err);
      }
      pagingToken = undefined;
    }
  } while (pagingToken != null);
  getterDebug("Recording state");
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "CloudWatchLogs",
    "DescribeLogGroups",
    state,
  );
}

export async function DescribeSubscriptionFilters(
  client: CloudWatchLogsClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("cloudwatch-logs:DescribeSubscriptionFilters");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [
    {
      Key: "logGroupName",
      Selector:
        "CloudWatchLogs|DescribeLogGroups|[]._result.logGroups[].logGroupName",
    },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as DescribeSubscriptionFiltersCommandInput[];
  for (const parameters of parameterQueue) {
    let pagingToken: string | undefined;
    do {
      const preparedParams: DescribeSubscriptionFiltersCommandInput =
        parameters;
      preparedParams.nextToken = pagingToken;
      try {
        const cmd = new DescribeSubscriptionFiltersCommand(preparedParams);
        const result: DescribeSubscriptionFiltersCommandOutput =
          await client.send(cmd);
        state.push({
          _metadata: { account: context.account, region: context.region },
          _parameters: preparedParams,
          _result: result,
        });
        pagingToken = result.nextToken;
        if (pagingToken != null) {
          getterDebug("Found pagination token in response");
        } else {
          getterDebug("No pagination token found in response");
        }
      } catch (err: unknown) {
        if (err instanceof CloudWatchLogsServiceException) {
          if (err?.$retryable) {
            console.log("Encountered retryable error", err);
          } else {
            console.log("Encountered unretryable error", err);
          }
        } else {
          console.log("Encountered unexpected error", err);
        }
        pagingToken = undefined;
      }
    } while (pagingToken != null);
  }
  getterDebug("Recording state");
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "CloudWatchLogs",
    "DescribeSubscriptionFilters",
    state,
  );
}
