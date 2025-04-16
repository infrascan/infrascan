import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./generated/client";
import {
  DescribeLogGroups,
  DescribeSubscriptionFilters,
} from "./generated/getters";
import { getEdges } from "./generated/graph";
import { CloudwatchLogGroupEntity } from "./graph";

const CloudWatchLogsScanner: ServiceModule<CloudWatchLogsClient, "aws"> = {
  provider: "aws",
  service: "cloudwatch-logs",
  key: "CloudWatchLogs",
  arnLabel: "logs",
  getClient,
  callPerRegion: true,
  getters: [DescribeLogGroups, DescribeSubscriptionFilters],
  getEdges,
  entities: [CloudwatchLogGroupEntity],
};

export default CloudWatchLogsScanner;
