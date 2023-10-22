import * as CloudwatchLogs from "@aws-sdk/client-cloudwatch-logs";
import type { ScannerDefinition } from "@infrascan/shared-types";

export type CloudWatchLogsFunctions =
  | "DescribeLogGroups"
  | "DescribeSubscriptionFilters";
const CloudWatchLogsScanner: ScannerDefinition<
  "CloudWatchLogs",
  typeof CloudwatchLogs,
  CloudWatchLogsFunctions
> = {
  provider: "aws",
  service: "cloudwatch-logs",
  arnLabel: "logs",
  clientKey: "CloudWatchLogs",
  key: "CloudWatchLogs",
  callPerRegion: true,
  getters: [
    {
      fn: "DescribeLogGroups",
      paginationToken: {
        request: "nextToken",
        response: "nextToken",
      },
    },
    {
      fn: "DescribeSubscriptionFilters",
      parameters: [
        {
          Key: "logGroupName",
          Selector:
            "CloudWatchLogs|DescribeLogGroups|[]._result.logGroups[].logGroupName",
        },
      ],
      paginationToken: {
        request: "nextToken",
        response: "nextToken",
      },
    },
  ],
  nodes: [
    "CloudWatchLogs|DescribeSubscriptionFilters|[]._result.subscriptionFilters[].{id:logGroupName,name:logGroupName}",
  ],
  edges: [
    {
      state:
        "CloudWatchLogs|DescribeSubscriptionFilters|[]._result.subscriptionFilters[]",
      from: "logGroupName",
      to: "{target:destinationArn}",
    },
  ],
};

export default CloudWatchLogsScanner;
