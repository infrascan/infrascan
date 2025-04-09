import { mkdtempSync } from "fs";
import { env } from "process";
import { join } from "path";
import { tmpdir } from "os";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  ListTopicsCommand,
  GetTopicAttributesCommand,
  ListSubscriptionsByTopicCommand,
  ListTagsForResourceCommand,
} from "@aws-sdk/client-sns";
import buildFsConnector from "@infrascan/fs-connector";
import SNSScanner from ".";

const stateDirectoryPrefix = "infrascan-test-state-";
const baseDirectory =
  env.DEBUG_STATE != null
    ? stateDirectoryPrefix
    : join(tmpdir(), stateDirectoryPrefix);
const tmpDir = mkdtempSync(baseDirectory);
const connector = buildFsConnector(tmpDir);

t.test(
  "State is pulled correctly from SNS, and formatted as expected",
  async () => {
    const testContext = {
      region: "us-east-1",
      account: "0".repeat(8),
    };
    const snsClient = SNSScanner.getClient(fromProcess(), testContext);

    const mockedSNSClient = mockClient(snsClient);

    // Mock each of the functions used to pull state
    const topicArn = `arn:aws:sns:${testContext.region}:${testContext.account}:topic:test-topic`;
    mockedSNSClient.on(ListTopicsCommand).resolves({
      Topics: [
        {
          TopicArn: topicArn,
        },
      ],
    });

    mockedSNSClient.on(GetTopicAttributesCommand).resolves({
      Attributes: {},
    });

    const subscriptionArnFactory = (idx: number) =>
      `${topicArn}/test-subscription${idx}`;
    const sqsArn = `arn:aws:sqs:${testContext.region}:${testContext.account}:queue:test-queue`;
    const snsArn = `arn:aws:sns:${testContext.region}:${testContext.account}:topic:test-topic-2`;
    mockedSNSClient.on(ListSubscriptionsByTopicCommand).resolves({
      Subscriptions: [
        {
          Protocol: "sqs",
          TopicArn: topicArn,
          SubscriptionArn: subscriptionArnFactory(1),
          Endpoint: sqsArn,
        },
        {
          Protocol: "sns",
          TopicArn: topicArn,
          SubscriptionArn: subscriptionArnFactory(2),
          Endpoint: snsArn,
        },
      ],
    });

    mockedSNSClient.on(ListTagsForResourceCommand).resolves({
      Tags: [
        {
          Key: "test-key",
          Value: "test-value",
        },
      ],
    });

    for (const scannerFn of SNSScanner.getters) {
      await scannerFn(snsClient, connector, testContext);
    }

    t.equal(mockedSNSClient.commandCalls(ListTopicsCommand).length, 1);
    t.equal(mockedSNSClient.commandCalls(GetTopicAttributesCommand).length, 1);
    t.equal(
      mockedSNSClient.commandCalls(ListSubscriptionsByTopicCommand).length,
      1,
    );
    t.equal(mockedSNSClient.commandCalls(ListTagsForResourceCommand).length, 1);

    const getAttributesArgs = mockedSNSClient.commandCalls(
      GetTopicAttributesCommand,
    )[0]?.args?.[0].input;
    t.equal(getAttributesArgs.TopicArn, topicArn);

    const listSubscriptionsByTopicArgs = mockedSNSClient.commandCalls(
      ListSubscriptionsByTopicCommand,
    )[0]?.args?.[0].input;
    t.equal(listSubscriptionsByTopicArgs.TopicArn, topicArn);

    const listTagsForResourceArgs = mockedSNSClient.commandCalls(
      ListTagsForResourceCommand,
    )[0]?.args?.[0].input;
    t.equal(listTagsForResourceArgs.ResourceArn, topicArn);

    if (SNSScanner.getEdges != null) {
      const edges = await SNSScanner.getEdges(connector);
      t.equal(edges.length, 2);

      t.ok(
        edges.find(
          (edge) => edge.source === topicArn && edge.target === snsArn,
        ),
      );
      t.ok(
        edges.find(
          (edge) => edge.source === topicArn && edge.target === sqsArn,
        ),
      );
    }
  },
);

t.test("No sns topics returned from ListTopicsCommand", async () => {
  const testContext = {
    region: "us-east-1",
    account: "0".repeat(8),
  };
  const snsClient = SNSScanner.getClient(fromProcess(), testContext);

  const mockedSNSClient = mockClient(snsClient);

  // Mock each of the functions used to pull state
  mockedSNSClient.on(ListTopicsCommand).resolves({
    Topics: [],
  });

  for (const scannerFn of SNSScanner.getters) {
    await scannerFn(snsClient, connector, testContext);
  }

  t.equal(mockedSNSClient.commandCalls(ListTopicsCommand).length, 1);
  t.equal(mockedSNSClient.commandCalls(GetTopicAttributesCommand).length, 0);
  t.equal(
    mockedSNSClient.commandCalls(ListSubscriptionsByTopicCommand).length,
    0,
  );
  t.equal(mockedSNSClient.commandCalls(ListTagsForResourceCommand).length, 0);

  if (SNSScanner.getEdges != null) {
    const edges = await SNSScanner.getEdges(connector);
    t.equal(edges.length, 0);
  }
});
