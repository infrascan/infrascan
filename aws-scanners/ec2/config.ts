import * as EC2 from "@aws-sdk/client-ec2";
import type { ScannerDefinition } from "@infrascan/shared-types";

export type EC2Functions =
  | "DescribeVpcs"
  | "DescribeAvailabilityZones"
  | "DescribeSubnets";
const CloudWatchLogsScanner: ScannerDefinition<
  "EC2",
  typeof EC2,
  EC2Functions
> = {
  provider: "aws",
  service: "ec2",
  clientKey: "EC2",
  key: "EC2-Networking",
  callPerRegion: true,
  getters: [
    {
      fn: "DescribeVpcs",
    },
    {
      fn: "DescribeSubnets",
      parameters: [
        {
          Key: "Filters",
          Selector: "EC2|DescribeVpcs|[]._result[].Vpcs[].VpcId"
        }
      ],
      paginationToken: {
        request: "NextToken",
        response: "NextToken"
      }
    },
  ]
};

export default CloudWatchLogsScanner;
