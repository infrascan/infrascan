import * as ECS from "@aws-sdk/client-ecs";
import type { ScannerDefinition } from "@infrascan/shared-types";

type ECSClusterFunctions = "ListClusters" | "DescribeClusters";
type ECSServiceFunctions = "ListServices" | "DescribeServices";
type ECSTaskFunctions =
  | "ListTasks"
  | "DescribeTasks"
  | "DescribeTaskDefinition";
export type ECSFunctions =
  | ECSClusterFunctions
  | ECSServiceFunctions
  | ECSTaskFunctions;

const ECSScanner: ScannerDefinition<"ECS", typeof ECS, ECSFunctions> = {
  provider: "aws",
  service: "ecs",
  clientKey: "ECS",
  key: "ECS",
  callPerRegion: true,
  getters: [
    {
      fn: "ListClusters",
    },
    {
      fn: "DescribeClusters",
      parameters: [
        {
          Key: "clusters",
          Selector:
            "ECS|ListClusters|[]._result.clusterArns | [?length(@)>`0`]",
        },
        {
          Key: "include",
          Value: [
            "ATTACHMENTS",
            "SETTINGS",
            "CONFIGURATIONS",
            "STATISTICS",
            "TAGS",
          ],
        },
      ],
    },
    {
      fn: "ListServices",
      parameters: [
        {
          Key: "cluster",
          Selector: "ECS|ListClusters|[]._result.clusterArns[]",
        },
        {
          Key: "maxResults",
          Value: 100,
        },
      ],
    },
    {
      fn: "DescribeServices",
      parameters: [
        {
          Key: "cluster",
          Selector: "ECS|ListServices|[]._parameters.cluster",
        },
        {
          Key: "services",
          Selector:
            "ECS|ListServices|[]._result.serviceArns | [?length(@)>`0`]",
        },
        {
          Key: "include",
          Value: ["TAGS"],
        },
      ],
    },
    {
      fn: "ListTasks",
      parameters: [
        {
          Key: "cluster",
          Selector: "ECS|ListClusters|[]._result.clusterArns[]",
        },
      ],
    },
    {
      fn: "DescribeTasks",
      parameters: [
        {
          Key: "cluster",
          Selector: "ECS|ListTasks|[]._parameters.cluster",
        },
        {
          Key: "tasks",
          Selector: "ECS|ListTasks|[]._result.taskArns | [?length(@)>`0`]",
        },
      ],
    },
    {
      fn: "DescribeTaskDefinition",
      parameters: [
        {
          Key: "taskDefinition",
          Selector: "ECS|DescribeTasks|[]._result.tasks[].taskDefinitionArn",
        },
        {
          Key: "include",
          Value: ["TAGS"],
        },
      ],
    },
  ],
  iamRoles: [
    "ECS|DescribeTaskDefinition|[]._result.taskDefinition | [].{roleArn:taskRoleArn,executor:taskDefinitionArn}",
    "ECS|DescribeTaskDefinition|[]._result.taskDefinition | [].{roleArn:executionRoleArn,executor:taskDefinitionArn}",
  ],
};

export default ECSScanner;
