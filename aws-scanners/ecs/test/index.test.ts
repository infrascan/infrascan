import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { env } from "process";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  ListClustersCommand,
  DescribeClustersCommand,
  ListServicesCommand,
  DescribeServicesCommand,
  ListTasksCommand,
  DescribeTasksCommand,
  DescribeTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";
import buildFsConnector from "@infrascan/fs-connector";
import ECSScanner from "../src";

const stateDirectoryPrefix = "infrascan-test-state-";
const baseDirectory =
  env["DEBUG_STATE"] != null
    ? stateDirectoryPrefix
    : join(tmpdir(), stateDirectoryPrefix);
const tmpDir = mkdtempSync(baseDirectory);
const connector = buildFsConnector(tmpDir);

t.test(
  "State is pulled correctly from ECS, and formatted as expected",
  async () => {
    const testContext = {
      region: "us-east-1",
      account: "0".repeat(8),
    };
    const ecsClient = ECSScanner.getClient(fromProcess(), testContext);

    const mockedEcsClient = mockClient(ecsClient);

    // Mock each of the functions used to pull state
    const clusterName = "test-cluster";
    const clusterArn = `arn:aws:ecs:${testContext.region}:${testContext.account}:cluster/${clusterName}`;
    mockedEcsClient.on(ListClustersCommand).resolves({
      clusterArns: [clusterArn],
    });

    mockedEcsClient.on(DescribeClustersCommand).resolves({
      clusters: [
        {
          clusterName,
          clusterArn,
        },
      ],
    });

    const serviceName = "test-service";
    const serviceArn = `arn:aws:ecs:${testContext.region}:${testContext.account}:service/${serviceName}`;
    const taskDefArn = `arn:aws:ecs:${testContext.region}:${testContext.account}:task-definition/${serviceName}:1`;
    mockedEcsClient.on(ListServicesCommand).resolves({
      serviceArns: [serviceArn],
    });

    mockedEcsClient.on(DescribeServicesCommand).resolves({
      services: [
        {
          serviceName,
          serviceArn,
          taskDefinition: taskDefArn,
          clusterArn,
        },
      ],
    });

    const taskArn = `arn:aws:ecs:${testContext.region}:${testContext.account}:task/${clusterName}/test-task`;
    mockedEcsClient.on(ListTasksCommand).resolves({
      taskArns: [taskArn],
    });

    const executionRoleArn = `arn:aws:iam::${testContext.account}:role/test-exec-role`;
    const taskRoleArn = `arn:aws:iam::${testContext.account}:role/test-task-role`;
    const scheduledTaskDefArn = `arn:aws:ecs:${testContext.region}:${testContext.account}:task-definition/scheduled:1`;
    mockedEcsClient.on(DescribeTasksCommand).resolves({
      tasks: [
        {
          taskArn,
          taskDefinitionArn: scheduledTaskDefArn,
          clusterArn,
        },
      ],
    });

    mockedEcsClient.on(DescribeTaskDefinitionCommand).resolves({
      taskDefinition: {
        taskRoleArn,
        executionRoleArn,
        taskDefinitionArn: scheduledTaskDefArn,
      },
    });

    for (const scannerFn of ECSScanner.getters) {
      await scannerFn(ecsClient, connector, testContext);
    }

    t.equal(mockedEcsClient.commandCalls(ListClustersCommand).length, 1);
    t.equal(mockedEcsClient.commandCalls(DescribeClustersCommand).length, 1);
    t.equal(mockedEcsClient.commandCalls(ListServicesCommand).length, 1);
    t.equal(mockedEcsClient.commandCalls(DescribeServicesCommand).length, 1);
    t.equal(mockedEcsClient.commandCalls(ListTasksCommand).length, 1);
    t.equal(mockedEcsClient.commandCalls(DescribeTasksCommand).length, 1);
    t.equal(
      mockedEcsClient.commandCalls(DescribeTaskDefinitionCommand).length,
      1,
    );

    if (ECSScanner.getNodes != null) {
      const nodes = await ECSScanner.getNodes(connector, testContext);
      t.equal(nodes.length, 4);
      // successfully found cluster node
      t.ok(
        nodes.find(
          (node) => node.id === clusterArn && node.data.type === "ecs-cluster",
        ),
      );

      // successfully found service node with cluster as parent
      t.ok(
        nodes.find(
          (node) =>
            node.id === serviceArn &&
            node.data.parent === clusterArn &&
            node.data.type === "ecs-service",
        ),
      );
      // successfully found task node with service as parent
      t.ok(
        nodes.find(
          (node) =>
            node.id === taskDefArn &&
            node.data.parent === serviceArn &&
            node.data.type === "ecs-task",
        ),
      );
      // successfully found task node with cluster as parent
      t.ok(
        nodes.find(
          (node) =>
            node.id === scheduledTaskDefArn &&
            node.data.parent === clusterArn &&
            node.data.type === "ecs-task",
        ),
      );
    }

    if (ECSScanner.getIamRoles != null) {
      const iamRoles = await ECSScanner.getIamRoles(connector);
      t.equal(iamRoles.length, 2);
      t.ok(
        iamRoles.find(
          (role) =>
            role.executor === scheduledTaskDefArn &&
            role.roleArn === taskRoleArn,
        ),
      );

      t.ok(
        iamRoles.find(
          (role) =>
            role.executor === scheduledTaskDefArn &&
            role.roleArn === executionRoleArn,
        ),
      );
    }
  },
);
