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
import { generateNodesFromEntity } from "@infrascan/core";
import buildFsConnector from "@infrascan/fs-connector";
import SQSScanner from ".";
import { SQSSchema } from "./graph";

const stateDirectoryPrefix = "infrascan-test-state-";
const baseDirectory =
  env.DEBUG_STATE != null
    ? stateDirectoryPrefix
    : join(tmpdir(), stateDirectoryPrefix);
const tmpDir = mkdtempSync(baseDirectory);
const connector = buildFsConnector(tmpDir);

t.test(
  "State is pulled correctly from SQS, and formatted as expected",
  async ({ equal, ok }) => {
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

    const createdTs = Math.floor(Date.now() / 1e3);
    mockedSQSClient.on(GetQueueAttributesCommand).resolves({
      Attributes: {
        QueueArn: queueArn,
        CreatedTimestamp: createdTs.toString(),
      },
    });

    for (const scannerFn of SQSScanner.getters) {
      await scannerFn(sqsClient, connector, testContext);
    }

    equal(mockedSQSClient.commandCalls(ListQueuesCommand).length, 1);
    equal(mockedSQSClient.commandCalls(ListQueueTagsCommand).length, 1);
    equal(mockedSQSClient.commandCalls(GetQueueAttributesCommand).length, 1);

    const getAttributesArgs = mockedSQSClient.commandCalls(
      GetQueueAttributesCommand,
    )[0]?.args?.[0].input;
    equal(getAttributesArgs.QueueUrl, queueUrl);
    equal(getAttributesArgs.AttributeNames?.[0], "All");

    const listQueueTagArgs =
      mockedSQSClient.commandCalls(ListQueueTagsCommand)[0]?.args?.[0].input;
    equal(listQueueTagArgs.QueueUrl, queueUrl);

    for (const entity of SQSScanner.entities ?? []) {
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
        equal(node.audit?.createdAt, `${createdTs * 1e3}`);
        ok((node as unknown as SQSSchema).sqs);
      }
    }
  },
);

t.test(
  "No SQS queues returned from ListQueuesCommand",
  async ({ equal, ok }) => {
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

    equal(mockedSQSClient.commandCalls(ListQueuesCommand).length, 1);
    equal(mockedSQSClient.commandCalls(ListQueueTagsCommand).length, 0);
    equal(mockedSQSClient.commandCalls(GetQueueAttributesCommand).length, 0);
  },
);
