import { mkdtempSync } from "fs";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  DescribeLogGroupsCommand,
  DescribeSubscriptionFiltersCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import buildFsConnector from "@infrascan/fs-connector";
import CloudwatchLogsScanner from "../src";

const tmpDir = mkdtempSync("infrascan-test-state-");
const connector = buildFsConnector(tmpDir);

t.test(
  "State is pulled correctly from Cloudwatch Logs, and formatted as expected",
  async () => {
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
          retentionInDays: 365,
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
    t.equal(logGroupCallCount, 1);
    const subscriptionCallCount = mockedCloudwatchLogsClient.commandCalls(
      DescribeSubscriptionFiltersCommand,
    ).length;
    t.equal(subscriptionCallCount, 1);
    const firstCallArgs = mockedCloudwatchLogsClient
      .commandCalls(DescribeSubscriptionFiltersCommand)
      .at(0)?.args;
    t.equal(firstCallArgs?.[0].input.logGroupName, logGroupName);

    if (CloudwatchLogsScanner.getNodes != null) {
      const nodes = await CloudwatchLogsScanner.getNodes(
        connector,
        testContext,
      );
      t.equal(nodes.length, 1);
      t.ok(nodes.find((node) => node.id === logGroupName));
    }

    if (CloudwatchLogsScanner.getEdges != null) {
      const edges = await CloudwatchLogsScanner.getEdges(connector);
      t.equal(edges.length, 1);
      t.ok(
        edges.find(
          (edge) =>
            edge.data.source === logGroupName &&
            edge.data.target === destinationLambdaArn,
        ),
      );
    }
  },
);
