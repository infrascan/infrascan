import { resolveFunctionCallParameters } from "@infrascan/core";
import {
  AutoScalingClient,
  AutoScalingServiceException,
} from "@aws-sdk/client-auto-scaling";
import {
  DescribeAutoScalingGroupsCommand,
  DescribeAutoScalingGroupsCommandInput,
  DescribeAutoScalingGroupsCommandOutput,
} from "@aws-sdk/client-auto-scaling";
import {
  DescribePoliciesCommand,
  DescribePoliciesCommandInput,
  DescribePoliciesCommandOutput,
} from "@aws-sdk/client-auto-scaling";
import {
  DescribeLifecycleHooksCommand,
  DescribeLifecycleHooksCommandInput,
  DescribeLifecycleHooksCommandOutput,
} from "@aws-sdk/client-auto-scaling";
import type {
  Connector,
  GenericState,
  AwsContext,
} from "@infrascan/shared-types";
import debug from "debug";

export async function DescribeAutoScalingGroups(
  client: AutoScalingClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("auto-scaling:DescribeAutoScalingGroups");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  let pagingToken: string | undefined;
  do {
    const preparedParams: DescribeAutoScalingGroupsCommandInput = {};
    preparedParams["NextToken"] = pagingToken;
    try {
      const cmd = new DescribeAutoScalingGroupsCommand(preparedParams);
      const result: DescribeAutoScalingGroupsCommandOutput = await client.send(
        cmd,
      );
      state.push({
        _metadata: {
          account: context.account,
          region: context.region,
          timestamp: Date.now(),
        },
        _parameters: preparedParams,
        _result: result,
      });
      pagingToken = result["NextToken"];
      if (pagingToken != null) {
        getterDebug("Found pagination token in response");
      } else {
        getterDebug("No pagination token found in response");
      }
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
      pagingToken = undefined;
    }
  } while (pagingToken != null);
  getterDebug("Recording state");
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "AutoScaling",
    "DescribeAutoScalingGroups",
    state,
  );
}

export async function DescribePolicies(
  client: AutoScalingClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("auto-scaling:DescribePolicies");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [
    {
      Key: "AutoScalingGroupName",
      Selector:
        "AutoScaling|DescribeAutoScalingGroups|[]._result.AutoScalingGroups[].AutoScalingGroupName",
    },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as DescribePoliciesCommandInput[];
  for (const parameters of parameterQueue) {
    let pagingToken: string | undefined;
    do {
      const preparedParams: DescribePoliciesCommandInput = parameters;
      preparedParams["NextToken"] = pagingToken;
      try {
        const cmd = new DescribePoliciesCommand(preparedParams);
        const result: DescribePoliciesCommandOutput = await client.send(cmd);
        state.push({
          _metadata: {
            account: context.account,
            region: context.region,
            timestamp: Date.now(),
          },
          _parameters: preparedParams,
          _result: result,
        });
        pagingToken = result["NextToken"];
        if (pagingToken != null) {
          getterDebug("Found pagination token in response");
        } else {
          getterDebug("No pagination token found in response");
        }
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
        pagingToken = undefined;
      }
    } while (pagingToken != null);
  }
  getterDebug("Recording state");
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "AutoScaling",
    "DescribePolicies",
    state,
  );
}
export async function DescribeLifecycleHooks(
  client: AutoScalingClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("auto-scaling:DescribeLifecycleHooks");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [
    {
      Key: "AutoScalingGroupName",
      Selector:
        "AutoScaling|DescribeAutoScalingGroups|[]._result.AutoScalingGroups[].AutoScalingGroupName",
    },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as DescribeLifecycleHooksCommandInput[];
  for (const parameters of parameterQueue) {
    const preparedParams: DescribeLifecycleHooksCommandInput = parameters;
    try {
      const cmd = new DescribeLifecycleHooksCommand(preparedParams);
      const result: DescribeLifecycleHooksCommandOutput = await client.send(
        cmd,
      );
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
  }
  getterDebug("Recording state");
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "AutoScaling",
    "DescribeLifecycleHooks",
    state,
  );
}
