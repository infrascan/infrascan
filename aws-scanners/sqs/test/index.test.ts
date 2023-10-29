import { mkdtempSync } from "fs";
import { env } from "process";
import { join } from "path";
import { tmpdir } from "os";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  ListQueuesCommand,
  ListQueueTagsCommand,
  GetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import buildFsConnector from "@infrascan/fs-connector";
import SQSScanner from "../src";

const stateDirectoryPrefix = "infrascan-test-state-";
const baseDirectory =
  env.DEBUG_STATE != null
    ? stateDirectoryPrefix
    : join(tmpdir(), stateDirectoryPrefix);
const tmpDir = mkdtempSync(baseDirectory);
const connector = buildFsConnector(tmpDir);

t.test(
  "State is pulled correctly from SQS, and formatted as expected",
  async () => {
    const testContext = {
      region: "us-east-1",
      account: "0".repeat(8),
    };
    const sqsClient = SQSScanner.getClient(fromProcess(), testContext);

    const mockedSQSClient = mockClient(sqsClient);

    // Mock each of the functions used to pull state
    const queueUrl = `https://queue-url.com`;
    const queueName = "test-queue";
    const queueArn = `arn:aws:sqs:${testContext.region}:${testContext.account}:queue:${queueName}`;
    mockedSQSClient.on(ListQueuesCommand).resolves({
      QueueUrls: [queueUrl],
    });

    mockedSQSClient.on(ListQueueTagsCommand).resolves({
      Tags: {
        Key: "test-key",
        Value: "test-value",
      },
    });

    mockedSQSClient.on(GetQueueAttributesCommand).resolves({
      Attributes: {
        QueueArn: queueArn,
      },
    });

    for (const scannerFn of SQSScanner.getters) {
      await scannerFn(sqsClient, connector, testContext);
    }

    t.equal(mockedSQSClient.commandCalls(ListQueuesCommand).length, 1);
    t.equal(mockedSQSClient.commandCalls(ListQueueTagsCommand).length, 1);
    t.equal(mockedSQSClient.commandCalls(GetQueueAttributesCommand).length, 1);

    const getAttributesArgs = mockedSQSClient.commandCalls(
      GetQueueAttributesCommand,
    )[0]?.args?.[0].input;
    t.equal(getAttributesArgs.QueueUrl, queueUrl);
    t.equal(getAttributesArgs.AttributeNames?.[0], "All");

    const listQueueTagArgs =
      mockedSQSClient.commandCalls(ListQueueTagsCommand)[0]?.args?.[0].input;
    t.equal(listQueueTagArgs.QueueUrl, queueUrl);

    if (SQSScanner.getNodes != null) {
      const nodes = await SQSScanner.getNodes(connector, testContext);
      t.equal(nodes.length, 1);
      t.equal(nodes[0].id, queueArn);
      t.equal(nodes[0].data.name, queueArn);
    }
  },
);

t.test("No SQS queues returned from ListQueuesCommand", async () => {
  const testContext = {
    region: "us-east-1",
    account: "0".repeat(8),
  };
  const sqsClient = SQSScanner.getClient(fromProcess(), testContext);

  const mockedSQSClient = mockClient(sqsClient);

  // Mock each of the functions used to pull state
  mockedSQSClient.on(ListQueuesCommand).resolves({
    QueueUrls: [],
  });

  for (const scannerFn of SQSScanner.getters) {
    await scannerFn(sqsClient, connector, testContext);
  }

  t.equal(mockedSQSClient.commandCalls(ListQueuesCommand).length, 1);
  t.equal(mockedSQSClient.commandCalls(ListQueueTagsCommand).length, 0);
  t.equal(mockedSQSClient.commandCalls(GetQueueAttributesCommand).length, 0);

  if (SQSScanner.getNodes != null) {
    const nodes = await SQSScanner.getNodes(connector, testContext);
    t.equal(nodes.length, 0);
  }
});
