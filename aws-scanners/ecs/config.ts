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
          Selector: "ECS|ListClusters|[]._result.clusterArns",
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
          Selector: "ECS|ListServices|[]._result.serviceArns",
        },
        {
          Key: "include",
          Value: ["TAGS"],
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
          Selector: "ECS|ListTasks|[]._result.taskArns",
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
      iamRoleSelectors: [
        "taskDefinition.taskRoleArn",
        "taskDefinition.executionRoleArn",
      ],
    },
  ],
  nodes: [
    "ECS|DescribeClusters|[]._result.clusters | [].{id:clusterArn,name:clusterName,info:@}",
    "ECS|DescribeServices|[]._result.services | [].{id:serviceArn,parent:clusterArn,name:serviceName,info:@}",
    "ECS|DescribeServices|[]._result.services | [].{id:taskDefinition,parent:serviceArn}",
    "ECS|DescribeTasks|[]._result.tasks | [].{id:taskDefinitionArn,parent:clusterArn}",
  ],
  iamRoles: [
    "ECS|DescribeTaskDefinition|[]._result.taskDefinition | [].{arn:taskRoleArn,executor:taskDefinitionArn}",
    "ECS|DescribeTaskDefinition|[]._result.taskDefinition | [].{arn:executionRoleArn,executor:taskDefinitionArn}",
  ],
};

export default ECSScanner;
