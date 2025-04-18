import * as SFN from "@aws-sdk/client-sfn";
import type { ScannerDefinition } from "@infrascan/shared-types";

export type SFNFunctions = "ListStateMachines" | "DescribeStateMachine";
const SFNScanner: ScannerDefinition<"SFN", typeof SFN, SFNFunctions> = {
  provider: "aws",
  service: "sfn",
  clientKey: "SFN",
  key: "SFN",
  callPerRegion: true,
  getters: [
    {
      fn: "ListStateMachines",
      paginationToken: {
        request: "nextToken",
        response: "nextToken",
      },
    },
    {
      fn: "DescribeStateMachine",
      parameters: [
        {
          Key: "stateMachineArn",
          Selector:
            "SFN|ListStateMachines|[]._result.stateMachines | [].stateMachineArn",
        },
      ],
    },
  ],
  iamRoles: [
    "SFN|DescribeStateMachine|[]._result.{roleArn:roleArn,executor:stateMachineArn}",
  ],
};

export default SFNScanner;
