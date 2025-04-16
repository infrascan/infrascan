import { resolveFunctionCallParameters } from "@infrascan/core";
import {
  ElasticLoadBalancingV2Client,
  ElasticLoadBalancingV2ServiceException,
  DescribeLoadBalancersCommand,
  DescribeLoadBalancersCommandInput,
  DescribeLoadBalancersCommandOutput,
  DescribeTargetGroupsCommand,
  DescribeTargetGroupsCommandInput,
  DescribeTargetGroupsCommandOutput,
  DescribeListenersCommand,
  DescribeListenersCommandInput,
  DescribeListenersCommandOutput,
  DescribeRulesCommand,
  DescribeRulesCommandInput,
  DescribeRulesCommandOutput,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import type {
  Connector,
  GenericState,
  AwsContext,
} from "@infrascan/shared-types";
import debug from "debug";

export async function DescribeLoadBalancers(
  client: ElasticLoadBalancingV2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("elastic-load-balancing-v2:DescribeLoadBalancers");
  const state: GenericState[] = [];
  getterDebug("DescribeLoadBalancers");
  const preparedParams: DescribeLoadBalancersCommandInput = {};
  try {
    const cmd = new DescribeLoadBalancersCommand(preparedParams);
    const result: DescribeLoadBalancersCommandOutput = await client.send(cmd);
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
    if (err instanceof ElasticLoadBalancingV2ServiceException) {
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
    "ElasticLoadBalancingV2",
    "DescribeLoadBalancers",
    state,
  );
}
export async function DescribeTargetGroups(
  client: ElasticLoadBalancingV2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("elastic-load-balancing-v2:DescribeTargetGroups");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [
    {
      Key: "LoadBalancerArn",
      Selector:
        "ElasticLoadBalancingV2|DescribeLoadBalancers|[]._result.LoadBalancers[].LoadBalancerArn",
    },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as DescribeTargetGroupsCommandInput[];
  for (const parameters of parameterQueue) {
    const preparedParams: DescribeTargetGroupsCommandInput = parameters;
    try {
      const cmd = new DescribeTargetGroupsCommand(preparedParams);
      const result: DescribeTargetGroupsCommandOutput = await client.send(cmd);
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
      if (err instanceof ElasticLoadBalancingV2ServiceException) {
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
    "ElasticLoadBalancingV2",
    "DescribeTargetGroups",
    state,
  );
}
export async function DescribeListeners(
  client: ElasticLoadBalancingV2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("elastic-load-balancing-v2:DescribeListeners");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [
    {
      Key: "LoadBalancerArn",
      Selector:
        "ElasticLoadBalancingV2|DescribeLoadBalancers|[]._result.LoadBalancers[].LoadBalancerArn",
    },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as DescribeListenersCommandInput[];
  for (const parameters of parameterQueue) {
    const preparedParams: DescribeListenersCommandInput = parameters;
    try {
      const cmd = new DescribeListenersCommand(preparedParams);
      const result: DescribeListenersCommandOutput = await client.send(cmd);
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
      if (err instanceof ElasticLoadBalancingV2ServiceException) {
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
    "ElasticLoadBalancingV2",
    "DescribeListeners",
    state,
  );
}
export async function DescribeRules(
  client: ElasticLoadBalancingV2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("elastic-load-balancing-v2:DescribeRules");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [
    {
      Key: "ListenerArn",
      Selector:
        "ElasticLoadBalancingV2|DescribeListeners|[]._result.Listeners[].ListenerArn",
    },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as DescribeRulesCommandInput[];
  for (const parameters of parameterQueue) {
    const preparedParams: DescribeRulesCommandInput = parameters;
    try {
      const cmd = new DescribeRulesCommand(preparedParams);
      const result: DescribeRulesCommandOutput = await client.send(cmd);
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
      if (err instanceof ElasticLoadBalancingV2ServiceException) {
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
    "ElasticLoadBalancingV2",
    "DescribeRules",
    state,
  );
}
