import * as ElasticLoadBalancing from "@aws-sdk/client-elastic-load-balancing-v2";
import type { ScannerDefinition } from "@infrascan/shared-types";

export type ElasticLoadBalancingFunctions =
  | "DescribeLoadBalancers"
  | "DescribeTargetGroups"
  | "DescribeListeners"
  | "DescribeRules";
const ElasticLoadBalancingScanner: ScannerDefinition<
  "ElasticLoadBalancingV2",
  typeof ElasticLoadBalancing,
  ElasticLoadBalancingFunctions
> = {
  provider: "aws",
  service: "elastic-load-balancing-v2",
  clientKey: "ElasticLoadBalancingV2",
  key: "ELB",
  callPerRegion: true,
  getters: [
    {
      fn: "DescribeLoadBalancers",
    },
    {
      fn: "DescribeTargetGroups",
      parameters: [
        {
          Key: "LoadBalancerArn",
          Selector:
            "ElasticLoadBalancingV2|DescribeLoadBalancers|[]._result.LoadBalancers[].LoadBalancerArn",
        },
      ],
    },
    {
      fn: "DescribeListeners",
      parameters: [
        {
          Key: "LoadBalancerArn",
          Selector:
            "ElasticLoadBalancingV2|DescribeLoadBalancers|[]._result.LoadBalancers[].LoadBalancerArn",
        },
      ],
    },
    {
      fn: "DescribeRules",
      parameters: [
        {
          Key: "ListenerArn",
          Selector:
            "ElasticLoadBalancingV2|DescribeListeners|[]._result.Listeners[].ListenerArn",
        },
      ],
    },
  ],
  nodes: [
    "ElasticLoadBalancingV2|DescribeLoadBalancers|[]._result.LoadBalancers | [].{id:LoadBalancerArn,arn:LoadBalancerArn,name:LoadBalancerName}",
  ],
};

export default ElasticLoadBalancingScanner;
