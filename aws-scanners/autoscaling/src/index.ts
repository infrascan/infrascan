import { AutoScalingClient } from "@aws-sdk/client-auto-scaling"; 
import { getClient } from "./generated/client";
import { DescribeAutoScalingGroups } from "./generated/getters";

import type { ServiceModule } from "@infrascan/shared-types";

const AutoScalingScanner: ServiceModule<AutoScalingClient, "aws"> = {
  provider: "aws",
  service: "auto-scaling",
  key: "AutoScaling",
  getClient,
  callPerRegion: true,
  getters: [DescribeAutoScalingGroups],
};

export default AutoScalingScanner;