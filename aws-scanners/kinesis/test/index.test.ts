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
import buildFsConnector from "@infrascan/fs-connector";
import KinesisScanner from "../src";

const stateDirectoryPrefix = "infrascan-test-state-";
const baseDirectory =
  env.DEBUG_STATE != null
    ? stateDirectoryPrefix
    : join(tmpdir(), stateDirectoryPrefix);
const tmpDir = mkdtempSync(baseDirectory);
const connector = buildFsConnector(tmpDir);

t.test(
  "State is pulled correctly from Kinesis, and formatted as expected",
  async () => {
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

    t.equal(mockedKinesisClient.commandCalls(ListStreamsCommand).length, 2);
    t.equal(
      mockedKinesisClient.commandCalls(ListStreamConsumersCommand).length,
      2,
    );

    const listStreamsCommandArgs = mockedKinesisClient
      .commandCalls(ListStreamsCommand)
      .at(1)?.args;
    t.equal(
      listStreamsCommandArgs?.[0].input.NextToken,
      listStreamsPaginationToken,
    );

    const listStreamsConsumerCommandArgs = mockedKinesisClient
      .commandCalls(ListStreamConsumersCommand)
      .at(1)?.args;
    t.equal(
      listStreamsConsumerCommandArgs?.[0].input.NextToken,
      consumerPaginationToken,
    );

    if (KinesisScanner.getNodes != null) {
      const nodes = await KinesisScanner.getNodes(connector, testContext);
      t.equal(nodes.length, 2);
      t.equal(nodes[0].id, kinesisStreamArn);
      t.equal(nodes[0].data.name, kinesisStreamName);
      t.equal(nodes[1].id, consumerArn);
      t.equal(nodes[1].data.name, consumerName);
    }

    if (KinesisScanner.getEdges != null) {
      const edges = await KinesisScanner.getEdges(connector);
      t.equal(edges.length, 1);
      t.equal(edges[0].data.source, kinesisStreamArn);
      t.equal(edges[0].data.target, consumerArn);
    }
  },
);
