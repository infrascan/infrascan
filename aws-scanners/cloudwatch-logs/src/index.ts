import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./generated/client";
import {
  DescribeLogGroups,
  DescribeSubscriptionFilters,
} from "./generated/getters";
import { getNodes, getEdges } from "./generated/graph";

const CloudWatchLogsScanner: ServiceModule<CloudWatchLogsClient, "aws"> = {
  provider: "aws",
  service: "cloudwatch-logs",
  key: "CloudWatchLogs",
  getClient,
  callPerRegion: true,
  getters: [DescribeLogGroups, DescribeSubscriptionFilters],
  getNodes,
  getEdges,
};

export default CloudWatchLogsScanner;
