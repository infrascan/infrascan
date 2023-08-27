import {
  ElasticLoadBalancingV2Client,
  DescribeLoadBalancersCommandInput,
  DescribeLoadBalancersCommandOutput,
  DescribeLoadBalancersCommand,
  DescribeTargetGroupsCommandInput,
  DescribeTargetGroupsCommandOutput,
  DescribeTargetGroupsCommand,
  DescribeListenersCommandInput,
  DescribeListenersCommandOutput,
  DescribeListenersCommand,
  DescribeRulesCommandInput,
  DescribeRulesCommandOutput,
  DescribeRulesCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import { scanIamRole, IAMStorage } from "../helpers/iam";
import { IAM } from "@aws-sdk/client-iam";
import { resolveFunctionCallParameters } from "../helpers/state";
import { Formatters } from "@infrascan/config";
import type {
  ServiceScanCompleteCallbackFn,
  ResolveStateForServiceFunction,
  GenericState,
} from "@infrascan/shared-types";
import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";

// This file is autogenerated using infrascan-codegen. Do not manually edit this file.
async function performScan(
  credentials: AwsCredentialIdentityProvider,
  account: string,
  region: string,
  iamClient: IAM,
  iamStorage: IAMStorage,
  onServiceCallComplete: ServiceScanCompleteCallbackFn,
  resolveStateForServiceCall: ResolveStateForServiceFunction,
) {
  const ElasticLoadBalancingV2 = new ElasticLoadBalancingV2Client({
    region,
    credentials,
  });
  const DescribeLoadBalancersState: GenericState[] = [];
  try {
    console.log("elastic-load-balancing-v2 DescribeLoadBalancers");
    let DescribeLoadBalancersPagingToken: string | undefined = undefined;
    do {
      const DescribeLoadBalancersCmd = new DescribeLoadBalancersCommand(
        {} as DescribeLoadBalancersCommandInput,
      );
      const result: DescribeLoadBalancersCommandOutput =
        await ElasticLoadBalancingV2.send(DescribeLoadBalancersCmd);
      const formattedResult =
        Formatters.ElasticLoadBalancingV2.describeLoadBalancers(result);
      DescribeLoadBalancersState.push({
        _metadata: { account, region },
        _parameters: {},
        _result: formattedResult,
      });
    } while (DescribeLoadBalancersPagingToken != null);
  } catch (err: any) {
    if (err?.retryable) {
      console.log("Encountered retryable error", err);
    } else {
      console.log("Encountered unretryable error", err);
    }
  }
  await onServiceCallComplete(
    account,
    region,
    "ElasticLoadBalancingV2",
    "DescribeLoadBalancers",
    DescribeLoadBalancersState,
  );

  const DescribeTargetGroupsState: GenericState[] = [];
  const DescribeTargetGroupsParameterResolvers = [
    {
      Key: "LoadBalancerArn",
      Selector:
        "ElasticLoadBalancingV2|DescribeLoadBalancers|[]._result[].LoadBalancerArn",
    },
  ];
  const DescribeTargetGroupsParameters = (await resolveFunctionCallParameters(
    account,
    region,
    DescribeTargetGroupsParameterResolvers,
    resolveStateForServiceCall,
  )) as DescribeTargetGroupsCommandInput[];
  for (const requestParameters of DescribeTargetGroupsParameters) {
    try {
      console.log("elastic-load-balancing-v2 DescribeTargetGroups");
      let DescribeTargetGroupsPagingToken: string | undefined = undefined;
      do {
        const DescribeTargetGroupsCmd = new DescribeTargetGroupsCommand(
          requestParameters,
        );
        const result: DescribeTargetGroupsCommandOutput =
          await ElasticLoadBalancingV2.send(DescribeTargetGroupsCmd);
        const formattedResult =
          Formatters.ElasticLoadBalancingV2.describeTargetGroups(result);
        DescribeTargetGroupsState.push({
          _metadata: { account, region },
          _parameters: requestParameters,
          _result: formattedResult,
        });
      } while (DescribeTargetGroupsPagingToken != null);
    } catch (err: any) {
      if (err?.retryable) {
        console.log("Encountered retryable error", err);
      } else {
        console.log("Encountered unretryable error", err);
      }
    }
  }
  await onServiceCallComplete(
    account,
    region,
    "ElasticLoadBalancingV2",
    "DescribeTargetGroups",
    DescribeTargetGroupsState,
  );

  const DescribeListenersState: GenericState[] = [];
  const DescribeListenersParameterResolvers = [
    {
      Key: "LoadBalancerArn",
      Selector:
        "ElasticLoadBalancingV2|DescribeLoadBalancers|[]._result[].LoadBalancerArn",
    },
  ];
  const DescribeListenersParameters = (await resolveFunctionCallParameters(
    account,
    region,
    DescribeListenersParameterResolvers,
    resolveStateForServiceCall,
  )) as DescribeListenersCommandInput[];
  for (const requestParameters of DescribeListenersParameters) {
    try {
      console.log("elastic-load-balancing-v2 DescribeListeners");
      let DescribeListenersPagingToken: string | undefined = undefined;
      do {
        const DescribeListenersCmd = new DescribeListenersCommand(
          requestParameters,
        );
        const result: DescribeListenersCommandOutput =
          await ElasticLoadBalancingV2.send(DescribeListenersCmd);
        const formattedResult =
          Formatters.ElasticLoadBalancingV2.describeListeners(result);
        DescribeListenersState.push({
          _metadata: { account, region },
          _parameters: requestParameters,
          _result: formattedResult,
        });
      } while (DescribeListenersPagingToken != null);
    } catch (err: any) {
      if (err?.retryable) {
        console.log("Encountered retryable error", err);
      } else {
        console.log("Encountered unretryable error", err);
      }
    }
  }
  await onServiceCallComplete(
    account,
    region,
    "ElasticLoadBalancingV2",
    "DescribeListeners",
    DescribeListenersState,
  );

  const DescribeRulesState: GenericState[] = [];
  const DescribeRulesParameterResolvers = [
    {
      Key: "ListenerArn",
      Selector:
        "ElasticLoadBalancingV2|DescribeListeners|[]._result[].ListenerArn",
    },
  ];
  const DescribeRulesParameters = (await resolveFunctionCallParameters(
    account,
    region,
    DescribeRulesParameterResolvers,
    resolveStateForServiceCall,
  )) as DescribeRulesCommandInput[];
  for (const requestParameters of DescribeRulesParameters) {
    try {
      console.log("elastic-load-balancing-v2 DescribeRules");
      let DescribeRulesPagingToken: string | undefined = undefined;
      do {
        const DescribeRulesCmd = new DescribeRulesCommand(requestParameters);
        const result: DescribeRulesCommandOutput =
          await ElasticLoadBalancingV2.send(DescribeRulesCmd);
        const formattedResult =
          Formatters.ElasticLoadBalancingV2.describeRules(result);
        DescribeRulesState.push({
          _metadata: { account, region },
          _parameters: requestParameters,
          _result: formattedResult,
        });
      } while (DescribeRulesPagingToken != null);
    } catch (err: any) {
      if (err?.retryable) {
        console.log("Encountered retryable error", err);
      } else {
        console.log("Encountered unretryable error", err);
      }
    }
  }
  await onServiceCallComplete(
    account,
    region,
    "ElasticLoadBalancingV2",
    "DescribeRules",
    DescribeRulesState,
  );
}

const NODE_SELECTORS = [
  "ElasticLoadBalancingV2|DescribeLoadBalancers|[]._result | [].{id:LoadBalancerArn,name:LoadBalancerName}",
];

export { performScan, NODE_SELECTORS };
