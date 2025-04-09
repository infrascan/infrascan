import { ECSClient } from "@aws-sdk/client-ecs";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./generated/client";
import {
  ListClusters,
  DescribeClusters,
  ListServices,
  DescribeServices,
  ListTasks,
  DescribeTasks,
  DescribeTaskDefinition,
  getIamRoles,
} from "./generated/getters";
import { entities } from "./graph";

const ECSScanner: ServiceModule<ECSClient, "aws"> = {
  provider: "aws",
  service: "ecs",
  key: "ECS",
  getClient,
  callPerRegion: true,
  getters: [
    ListClusters,
    DescribeClusters,
    ListServices,
    DescribeServices,
    ListTasks,
    DescribeTasks,
    DescribeTaskDefinition,
  ],
  getIamRoles,
  entities,
};

export default ECSScanner;
