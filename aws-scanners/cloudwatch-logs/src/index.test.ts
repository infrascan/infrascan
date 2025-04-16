import { mkdtempSync } from "fs";
import t from "tap";
import { env } from "process";
import { join } from "path";
import { tmpdir } from "os";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  DescribeLogGroupsCommand,
  DescribeSubscriptionFiltersCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { generateNodesFromEntity } from "@infrascan/core";
import buildFsConnector from "@infrascan/fs-connector";
import CloudwatchLogsScanner from ".";
import { CloudwatchLogGroup } from "./graph";

const stateDirectoryPrefix = "infrascan-test-state-";
const baseDirectory =
  env.DEBUG_STATE != null
    ? stateDirectoryPrefix
    : join(tmpdir(), stateDirectoryPrefix);
const tmpDir = mkdtempSync(baseDirectory);
const connector = buildFsConnector(tmpDir);

t.test(
  "State is pulled correctly from Cloudwatch Logs, and formatted as expected",
  async ({ ok, equal }) => {
    const testContext = {
      region: "us-east-1",
      account: "0".repeat(8),
    };
    const cloudwatchLogsClient = CloudwatchLogsScanner.getClient(
      fromProcess(),
      testContext,
    );

    const mockedCloudwatchLogsClient = mockClient(cloudwatchLogsClient);

    // Mock each of the functions used to pull state
    const logGroupName = "test-log-group";
    const logGroupArn = `arn:aws:logs:${testContext.region}:${testContext.account}:log-group:${logGroupName}`;
    mockedCloudwatchLogsClient.on(DescribeLogGroupsCommand).resolves({
      logGroups: [
        {
          logGroupName,
          arn: logGroupArn,
          logGroupArn,
          retentionInDays: 365,
          creationTime: Date.now(),
          kmsKeyId: "arn:aws:kms:us-east-1:0000000000:key:abcdef",
        },
      ],
    });

    const destinationLambdaArn = `arn:aws:lambda:${testContext.region}:${testContext.account}:function:test-lambda`;
    mockedCloudwatchLogsClient.on(DescribeSubscriptionFiltersCommand).resolves({
      subscriptionFilters: [
        {
          logGroupName,
          destinationArn: destinationLambdaArn,
        },
      ],
    });

    for (const scannerFn of CloudwatchLogsScanner.getters) {
      await scannerFn(cloudwatchLogsClient, connector, testContext);
    }

    const logGroupCallCount = mockedCloudwatchLogsClient.commandCalls(
      DescribeLogGroupsCommand,
    ).length;
    equal(logGroupCallCount, 1);
    const subscriptionCallCount = mockedCloudwatchLogsClient.commandCalls(
      DescribeSubscriptionFiltersCommand,
    ).length;
    equal(subscriptionCallCount, 1);
    const firstCallArgs = mockedCloudwatchLogsClient
      .commandCalls(DescribeSubscriptionFiltersCommand)
      .at(0)?.args;
    equal(firstCallArgs?.[0].input.logGroupName, logGroupName);

    if (CloudwatchLogsScanner.getEdges != null) {
      const edges = await CloudwatchLogsScanner.getEdges(connector);
      equal(edges.length, 1);
      ok(
        edges.find(
          (edge) =>
            edge.source === logGroupName &&
            edge.target === destinationLambdaArn,
        ),
      );
    }

    for (const entity of CloudwatchLogsScanner.entities ?? []) {
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
        ok(node.audit?.createdAt);
        ok(node.encryption?.keyId);
        equal(
          (node as unknown as CloudwatchLogGroup).logGroup.retentionPeriod
            ?.unit,
          "d",
        );
        equal(
          (node as unknown as CloudwatchLogGroup).logGroup.retentionPeriod
            ?.value,
          365,
        );
      }
    }
  },
);

t.test(
  "No Log groups returned from DescribeLogGroups command",
  async ({ equal }) => {
    const testContext = {
      region: "us-east-1",
      account: "0".repeat(8),
    };
    const cloudwatchLogsClient = CloudwatchLogsScanner.getClient(
      fromProcess(),
      testContext,
    );

    const mockedCloudwatchLogsClient = mockClient(cloudwatchLogsClient);

    // Mock each of the functions used to pull state
    mockedCloudwatchLogsClient.on(DescribeLogGroupsCommand).resolves({
      logGroups: [],
    });

    for (const scannerFn of CloudwatchLogsScanner.getters) {
      await scannerFn(cloudwatchLogsClient, connector, testContext);
    }

    const logGroupCallCount = mockedCloudwatchLogsClient.commandCalls(
      DescribeLogGroupsCommand,
    ).length;
    equal(logGroupCallCount, 1);
    const subscriptionCallCount = mockedCloudwatchLogsClient.commandCalls(
      DescribeSubscriptionFiltersCommand,
    ).length;
    equal(subscriptionCallCount, 0);

    if (CloudwatchLogsScanner.getEdges != null) {
      const edges = await CloudwatchLogsScanner.getEdges(connector);
      equal(edges.length, 0);
    }
  },
);
