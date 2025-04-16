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
  DescribeClustersCommandInput,
} from "@aws-sdk/client-ecs";
import { generateNodesFromEntity } from "@infrascan/core";
import buildFsConnector from "@infrascan/fs-connector";
import ECSScanner from ".";
import { ECSState } from "./graph";

const stateDirectoryPrefix = "infrascan-test-state-";
const baseDirectory =
  env.DEBUG_STATE != null
    ? stateDirectoryPrefix
    : join(tmpdir(), stateDirectoryPrefix);
const tmpDir = mkdtempSync(baseDirectory);
const connector = buildFsConnector(tmpDir);

t.test(
  "State is pulled correctly from ECS, and formatted as expected",
  async ({ ok, equal }) => {
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

    equal(mockedEcsClient.commandCalls(ListClustersCommand).length, 1);
    equal(mockedEcsClient.commandCalls(DescribeClustersCommand).length, 1);
    equal(mockedEcsClient.commandCalls(ListServicesCommand).length, 1);
    equal(mockedEcsClient.commandCalls(DescribeServicesCommand).length, 1);
    equal(mockedEcsClient.commandCalls(ListTasksCommand).length, 1);
    equal(mockedEcsClient.commandCalls(DescribeTasksCommand).length, 1);
    equal(
      mockedEcsClient.commandCalls(DescribeTaskDefinitionCommand).length,
      1,
    );

    if (ECSScanner.getIamRoles != null) {
      const iamRoles = await ECSScanner.getIamRoles(connector);
      equal(iamRoles.length, 2);
      ok(
        iamRoles.find(
          (role) =>
            role.executor === scheduledTaskDefArn &&
            role.roleArn === taskRoleArn,
        ),
      );

      ok(
        iamRoles.find(
          (role) =>
            role.executor === scheduledTaskDefArn &&
            role.roleArn === executionRoleArn,
        ),
      );
    }

    for (const entity of ECSScanner.entities ?? []) {
      const nodeProducer = generateNodesFromEntity(
        connector,
        testContext,
        entity,
      );
      for await (const node of nodeProducer) {
        ok(node.$graph.id);
        ok(node.$graph.label);
        ok(node.$metadata.version);
        equal(node.tenant.tenantId, testContext.account);
        equal(node.tenant.provider, "aws");
        ok(node.location?.code);
        equal(node.$source?.command, entity.command);
        equal(node.resource.category, entity.category);
        equal(node.resource.subcategory, entity.subcategory);
        ok((node as unknown as ECSState<unknown>).ecs);
      }
    }
  },
);

t.test(
  "No Clusters in the account, should skip subsequent calls",
  async ({ equal }) => {
    const testContext = {
      region: "us-east-1",
      account: "0".repeat(8),
    };
    const ecsClient = ECSScanner.getClient(fromProcess(), testContext);

    const mockedEcsClient = mockClient(ecsClient);

    // Mock each of the functions used to pull state
    mockedEcsClient.on(ListClustersCommand).resolves({
      clusterArns: [],
    });

    for (const scannerFn of ECSScanner.getters) {
      await scannerFn(ecsClient, connector, testContext);
    }

    equal(mockedEcsClient.commandCalls(ListClustersCommand).length, 1);
    equal(mockedEcsClient.commandCalls(DescribeClustersCommand).length, 0);
    equal(mockedEcsClient.commandCalls(ListServicesCommand).length, 0);
    // Scanner should skip ListServices if no services given
    equal(mockedEcsClient.commandCalls(DescribeServicesCommand).length, 0);
    equal(mockedEcsClient.commandCalls(ListTasksCommand).length, 0);
    equal(mockedEcsClient.commandCalls(DescribeTasksCommand).length, 0);
    equal(
      mockedEcsClient.commandCalls(DescribeTaskDefinitionCommand).length,
      0,
    );

    if (ECSScanner.getIamRoles != null) {
      const iamRoles = await ECSScanner.getIamRoles(connector);
      equal(iamRoles.length, 0);
    }
  },
);

t.test("No Services defined in the ECS Cluster", async ({ equal, ok }) => {
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

  mockedEcsClient.on(ListServicesCommand).resolves({
    serviceArns: [],
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

  equal(mockedEcsClient.commandCalls(ListClustersCommand).length, 1);
  equal(mockedEcsClient.commandCalls(DescribeClustersCommand).length, 1);
  equal(mockedEcsClient.commandCalls(ListServicesCommand).length, 1);
  // Scanner should skip ListServices if no services given
  equal(mockedEcsClient.commandCalls(DescribeServicesCommand).length, 0);
  equal(mockedEcsClient.commandCalls(ListTasksCommand).length, 1);
  equal(mockedEcsClient.commandCalls(DescribeTasksCommand).length, 1);
  equal(mockedEcsClient.commandCalls(DescribeTaskDefinitionCommand).length, 1);

  if (ECSScanner.getIamRoles != null) {
    const iamRoles = await ECSScanner.getIamRoles(connector);
    equal(iamRoles.length, 2);
    ok(
      iamRoles.find(
        (role) =>
          role.executor === scheduledTaskDefArn && role.roleArn === taskRoleArn,
      ),
    );

    ok(
      iamRoles.find(
        (role) =>
          role.executor === scheduledTaskDefArn &&
          role.roleArn === executionRoleArn,
      ),
    );
  }
});

t.test("No Tasks found in the cluster", async ({ equal }) => {
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

  mockedEcsClient.on(ListServicesCommand).resolves({
    serviceArns: [],
  });

  mockedEcsClient.on(ListTasksCommand).resolves({
    taskArns: [],
  });

  for (const scannerFn of ECSScanner.getters) {
    await scannerFn(ecsClient, connector, testContext);
  }

  equal(mockedEcsClient.commandCalls(ListClustersCommand).length, 1);
  equal(mockedEcsClient.commandCalls(DescribeClustersCommand).length, 1);
  equal(mockedEcsClient.commandCalls(ListServicesCommand).length, 1);
  // Scanner should skip ListServices if no services given
  equal(mockedEcsClient.commandCalls(DescribeServicesCommand).length, 0);
  equal(mockedEcsClient.commandCalls(ListTasksCommand).length, 1);
  equal(mockedEcsClient.commandCalls(DescribeTasksCommand).length, 0);
  equal(mockedEcsClient.commandCalls(DescribeTaskDefinitionCommand).length, 0);

  const iamRoles = await ECSScanner.getIamRoles!(connector);
  equal(iamRoles.length, 0);
});
