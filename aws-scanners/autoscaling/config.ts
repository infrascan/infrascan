import * as AutoScaling from "@aws-sdk/client-auto-scaling";
import type { ScannerDefinition } from "@infrascan/shared-types";

export type AutoscalingFunctions = "DescribeAutoScalingGroups";

const AutoscalingScanner: ScannerDefinition<
  "AutoScaling",
  typeof AutoScaling,
  AutoscalingFunctions
> = {
  provider: "aws",
  service: "auto-scaling",
  clientKey: "AutoScaling",
  key: "AutoScaling",
  callPerRegion: true,
  getters: [
    {
      fn: "DescribeAutoScalingGroups",
    },
  ]
};

export default AutoscalingScanner;
