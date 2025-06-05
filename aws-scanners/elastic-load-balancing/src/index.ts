import { ElasticLoadBalancingV2Client } from "@aws-sdk/client-elastic-load-balancing-v2";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./generated/client";
import {
  DescribeLoadBalancers,
  DescribeTargetGroups,
  DescribeListeners,
  DescribeRules,
} from "./generated/getters";
import { getEdges } from "./edges";
import { ElasticLoadBalancerEntity } from "./graph";

const ElasticLoadBalancingV2Scanner: ServiceModule<
  ElasticLoadBalancingV2Client,
  "aws"
> = {
  provider: "aws",
  service: "elastic-load-balancing-v2",
  key: "ELB",
  getClient,
  callPerRegion: true,
  getters: [
    DescribeLoadBalancers,
    DescribeTargetGroups,
    DescribeListeners,
    DescribeRules,
  ],
  getEdges,
  entities: [ElasticLoadBalancerEntity],
};

export type { GraphState, ElasticLoadBalancerState } from "./graph";
export default ElasticLoadBalancingV2Scanner;
