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
import { generateNodesFromEntity } from "@infrascan/core";
import buildFsConnector from "@infrascan/fs-connector";
import SNSScanner from ".";
import { SNSEntity } from "./graph";

const stateDirectoryPrefix = "infrascan-test-state-";
const baseDirectory =
  env.DEBUG_STATE != null
    ? stateDirectoryPrefix
    : join(tmpdir(), stateDirectoryPrefix);
const tmpDir = mkdtempSync(baseDirectory);
const connector = buildFsConnector(tmpDir);

t.test(
  "State is pulled correctly from SNS, and formatted as expected",
  async ({ equal, ok }) => {
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
      Attributes: {
        TopicArn: topicArn,
        Policy: "{}",
        FifoTopic: "false",
      },
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

    equal(mockedSNSClient.commandCalls(ListTopicsCommand).length, 1);
    equal(mockedSNSClient.commandCalls(GetTopicAttributesCommand).length, 1);
    equal(
      mockedSNSClient.commandCalls(ListSubscriptionsByTopicCommand).length,
      1,
    );
    equal(mockedSNSClient.commandCalls(ListTagsForResourceCommand).length, 1);

    const getAttributesArgs = mockedSNSClient.commandCalls(
      GetTopicAttributesCommand,
    )[0]?.args?.[0].input;
    equal(getAttributesArgs.TopicArn, topicArn);

    const listSubscriptionsByTopicArgs = mockedSNSClient.commandCalls(
      ListSubscriptionsByTopicCommand,
    )[0]?.args?.[0].input;
    equal(listSubscriptionsByTopicArgs.TopicArn, topicArn);

    const listTagsForResourceArgs = mockedSNSClient.commandCalls(
      ListTagsForResourceCommand,
    )[0]?.args?.[0].input;
    equal(listTagsForResourceArgs.ResourceArn, topicArn);

    if (SNSScanner.getEdges != null) {
      const edges = await SNSScanner.getEdges(connector);
      equal(edges.length, 2);

      ok(
        edges.find(
          (edge) => edge.source === topicArn && edge.target === snsArn,
        ),
      );
      ok(
        edges.find(
          (edge) => edge.source === topicArn && edge.target === sqsArn,
        ),
      );
    }

    for (const entity of SNSScanner.entities ?? []) {
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

        if (node.resource.subcategory === "topic") {
          ok(node.resource.policy);
          ok((node as unknown as SNSEntity).sns);
          equal((node as unknown as SNSEntity).sns.fifo, false);
        }
      }
    }
  },
);

t.test("No sns topics returned from ListTopicsCommand", async ({ equal }) => {
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

  equal(mockedSNSClient.commandCalls(ListTopicsCommand).length, 1);
  equal(mockedSNSClient.commandCalls(GetTopicAttributesCommand).length, 0);
  equal(
    mockedSNSClient.commandCalls(ListSubscriptionsByTopicCommand).length,
    0,
  );
  equal(mockedSNSClient.commandCalls(ListTagsForResourceCommand).length, 0);

  if (SNSScanner.getEdges != null) {
    const edges = await SNSScanner.getEdges(connector);
    equal(edges.length, 0);
  }
});
