import { AutoScalingClient } from "@aws-sdk/client-auto-scaling";
import type { ServiceModule } from "@infrascan/shared-types";

import { getClient } from "./generated/client";
import { DescribeAutoScalingGroups } from "./generated/getters";

const AutoScalingScanner: ServiceModule<AutoScalingClient, "aws"> = {
  provider: "aws",
  service: "auto-scaling",
  key: "AutoScaling",
  getClient,
  callPerRegion: true,
  getters: [DescribeAutoScalingGroups],
};

export default AutoScalingScanner;
