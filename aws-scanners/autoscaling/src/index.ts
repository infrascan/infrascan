import { AutoScalingClient } from "@aws-sdk/client-auto-scaling";
import type { ServiceModule } from "@infrascan/shared-types";

import { getClient } from "./generated/client";
import {
  DescribeAutoScalingGroups,
  DescribePolicies,
  DescribeLifecycleHooks,
} from "./generated/getters";
import { getEdges } from "./edges";
import { AutoScalingGroupEntity } from "./graph";

const AutoScalingScanner: ServiceModule<AutoScalingClient, "aws"> = {
  provider: "aws",
  service: "auto-scaling",
  key: "AutoScaling",
  getClient,
  callPerRegion: true,
  getters: [
    DescribeAutoScalingGroups,
    DescribePolicies,
    DescribeLifecycleHooks,
  ],
  getEdges,
  entities: [AutoScalingGroupEntity],
};

export type {
  GraphState,
  AutoScalingGroupState,
  AutoScalingGroupDetails,
} from "./graph";
export default AutoScalingScanner;
