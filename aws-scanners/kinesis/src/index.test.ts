import { mkdtempSync } from "fs";
import { env } from "process";
import { join } from "path";
import { tmpdir } from "os";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  ListStreamsCommand,
  ListStreamConsumersCommand,
} from "@aws-sdk/client-kinesis";
import { generateNodesFromEntity } from "@infrascan/core";
import buildFsConnector from "@infrascan/fs-connector";
import KinesisScanner from ".";

const stateDirectoryPrefix = "infrascan-test-state-";
const baseDirectory =
  env.DEBUG_STATE != null
    ? stateDirectoryPrefix
    : join(tmpdir(), stateDirectoryPrefix);
const tmpDir = mkdtempSync(baseDirectory);
const connector = buildFsConnector(tmpDir);

t.test(
  "State is pulled correctly from Kinesis, and formatted as expected",
  async ({ ok, equal }) => {
    const testContext = {
      region: "us-east-1",
      account: "0".repeat(8),
    };
    const kinesisClient = KinesisScanner.getClient(fromProcess(), testContext);

    const mockedKinesisClient = mockClient(kinesisClient);

    // Mock each of the functions used to pull state
    const kinesisStreamName = "test-stream";
    const kinesisStreamArn = `arn:aws:kinesis:us-east-1:123456789012:stream/${kinesisStreamName}`;
    const listStreamsPaginationToken = "next-stream-page";
    mockedKinesisClient
      .on(ListStreamsCommand)
      .resolvesOnce({
        StreamSummaries: [
          {
            StreamARN: kinesisStreamArn,
            StreamName: kinesisStreamName,
            StreamStatus: "ACTIVE",
            StreamCreationTimestamp: new Date().toISOString(),
            KeyId: "arn:aws:kms:us-east-1:0000000000:key:foobar",
          },
        ],
        NextToken: listStreamsPaginationToken,
      })
      .resolvesOnce({ StreamSummaries: [] });

    const consumerName = "test-consumer";
    const consumerArn = `${kinesisStreamArn}/consumer/${consumerName}`;
    const consumerPaginationToken = "next-consumer-page";
    mockedKinesisClient
      .on(ListStreamConsumersCommand)
      .resolvesOnce({
        Consumers: [
          {
            ConsumerStatus: "ACTIVE",
            ConsumerARN: consumerArn,
            ConsumerName: consumerName,
            ConsumerCreationTimestamp: new Date(),
          },
        ],
        NextToken: consumerPaginationToken,
      })
      .resolvesOnce({ Consumers: [] });

    for (const scannerFn of KinesisScanner.getters) {
      await scannerFn(kinesisClient, connector, testContext);
    }

    equal(mockedKinesisClient.commandCalls(ListStreamsCommand).length, 2);
    equal(
      mockedKinesisClient.commandCalls(ListStreamConsumersCommand).length,
      2,
    );

    const listStreamsCommandArgs = mockedKinesisClient
      .commandCalls(ListStreamsCommand)
      .at(1)?.args;
    equal(
      listStreamsCommandArgs?.[0].input.NextToken,
      listStreamsPaginationToken,
    );

    const listStreamsConsumerCommandArgs = mockedKinesisClient
      .commandCalls(ListStreamConsumersCommand)
      .at(1)?.args;
    equal(
      listStreamsConsumerCommandArgs?.[0].input.NextToken,
      consumerPaginationToken,
    );

    if (KinesisScanner.getEdges != null) {
      const edges = await KinesisScanner.getEdges(connector);
      equal(edges.length, 1);
      equal(edges[0].source, kinesisStreamArn);
      equal(edges[0].target, consumerArn);
    }

    for (const entity of KinesisScanner.entities ?? []) {
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
      }
    }
  },
);

t.test("No streams returned from ListStreamsCommand", async ({ equal }) => {
  const testContext = {
    region: "us-east-1",
    account: "0".repeat(8),
  };
  const kinesisClient = KinesisScanner.getClient(fromProcess(), testContext);

  const mockedKinesisClient = mockClient(kinesisClient);

  // Mock each of the functions used to pull state
  mockedKinesisClient.on(ListStreamsCommand).resolves({
    StreamSummaries: [],
  });

  for (const scannerFn of KinesisScanner.getters) {
    await scannerFn(kinesisClient, connector, testContext);
  }

  equal(mockedKinesisClient.commandCalls(ListStreamsCommand).length, 1);
  equal(mockedKinesisClient.commandCalls(ListStreamConsumersCommand).length, 0);
});
