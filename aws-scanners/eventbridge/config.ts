import * as EventBridge from "@aws-sdk/client-eventbridge";
import type { ScannerDefinition } from "@infrascan/shared-types";

export type EventBridgeFunctions =
  | "ListEventBuses"
  | "DescribeEventBus"
  | "ListRules"
  | "ListTargetsByRule"
  | "ListApiDestinations"
  | "ListConnections";

// ListTargetsByRule is deliberately absent from the getters below: it needs the
// rule name and the bus it was listed on as a correlated pair, which the
// index-paired parameter resolver can't express. It's implemented by hand in
// src/getters.ts.
const EventBridgeScanner: ScannerDefinition<
  "EventBridge",
  typeof EventBridge,
  EventBridgeFunctions
> = {
  provider: "aws",
  service: "eventbridge",
  clientKey: "EventBridge",
  key: "EventBridge",
  callPerRegion: true,
  getters: [
    {
      fn: "ListEventBuses",
      paginationToken: {
        request: "NextToken",
        response: "NextToken",
      },
    },
    {
      fn: "DescribeEventBus",
      parameters: [
        {
          Key: "Name",
          Selector: "EventBridge|ListEventBuses|[]._result.EventBuses[].Name",
        },
      ],
    },
    {
      fn: "ListRules",
      parameters: [
        {
          Key: "EventBusName",
          Selector: "EventBridge|ListEventBuses|[]._result.EventBuses[].Name",
        },
      ],
      paginationToken: {
        request: "NextToken",
        response: "NextToken",
      },
    },
    {
      fn: "ListApiDestinations",
      paginationToken: {
        request: "NextToken",
        response: "NextToken",
      },
    },
    {
      fn: "ListConnections",
      paginationToken: {
        request: "NextToken",
        response: "NextToken",
      },
    },
  ],
  iamRoles: [
    "EventBridge|ListRules|[]._result.Rules[?RoleArn] | [].{roleArn:RoleArn,executor:Arn}",
  ],
};

export default EventBridgeScanner;
