import * as AutoScaling from "@aws-sdk/client-auto-scaling";
import type { ScannerDefinition } from "@infrascan/shared-types";

export type AutoscalingFunctions =
  | "DescribeAutoScalingGroups"
  | "DescribePolicies"
  | "DescribeLifecycleHooks";

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
      paginationToken: {
        request: "NextToken",
        response: "NextToken",
      },
    },
    {
      fn: "DescribePolicies",
      parameters: [
        {
          Key: "AutoScalingGroupName",
          Selector:
            "AutoScaling|DescribeAutoScalingGroups|[]._result.AutoScalingGroups[].AutoScalingGroupName",
        },
      ],
      paginationToken: {
        request: "NextToken",
        response: "NextToken",
      },
    },
    {
      fn: "DescribeLifecycleHooks",
      parameters: [
        {
          Key: "AutoScalingGroupName",
          Selector:
            "AutoScaling|DescribeAutoScalingGroups|[]._result.AutoScalingGroups[].AutoScalingGroupName",
        },
      ],
    },
  ],
};

export default AutoscalingScanner;
