import { mkdtempSync } from "fs";
import { env } from "process";
import { join } from "path";
import { tmpdir } from "os";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  ListBucketsCommand,
  GetBucketTaggingCommand,
  GetBucketNotificationConfigurationCommand,
  GetBucketWebsiteCommand,
  GetBucketAclCommand,
} from "@aws-sdk/client-s3";
import buildFsConnector from "@infrascan/fs-connector";
import S3Scanner from ".";

const stateDirectoryPrefix = "infrascan-test-state-";
const baseDirectory =
  env.DEBUG_STATE != null
    ? stateDirectoryPrefix
    : join(tmpdir(), stateDirectoryPrefix);
const tmpDir = mkdtempSync(baseDirectory);
const connector = buildFsConnector(tmpDir);

t.test(
  "State is pulled correctly from RDS, and formatted as expected",
  async () => {
    const testContext = {
      region: "us-east-1",
      account: "0".repeat(8),
    };
    const s3Client = S3Scanner.getClient(fromProcess(), testContext);

    const mockedS3Client = mockClient(s3Client);

    // Mock each of the functions used to pull state
    const bucketName = "test-bucket";
    const bucketArn = `arn:aws:s3:::${bucketName}`;
    mockedS3Client.on(ListBucketsCommand).resolves({
      Buckets: [
        {
          Name: bucketName,
        },
      ],
    });

    const tagKey = "test-key";
    const tagValue = "test-value";
    mockedS3Client.on(GetBucketTaggingCommand).resolves({
      TagSet: [
        {
          Key: tagKey,
          Value: tagValue,
        },
      ],
    });

    const sqsQueueArn = `arn:aws:sqs:${testContext.region}:${testContext.account}:queue:test-queue`;
    const snsTopicArn = `arn:aws:sns:${testContext.region}:${testContext.account}:topic:test-topic`;
    const lambdaFunctionArn = `arn:aws:lambda:${testContext.region}:${testContext.account}:function:test-function`;
    mockedS3Client.on(GetBucketNotificationConfigurationCommand).resolves({
      QueueConfigurations: [{ QueueArn: sqsQueueArn, Events: [] }],
      TopicConfigurations: [{ TopicArn: snsTopicArn, Events: [] }],
      LambdaFunctionConfigurations: [
        { LambdaFunctionArn: lambdaFunctionArn, Events: [] },
      ],
    });

    mockedS3Client.on(GetBucketWebsiteCommand).resolves({});

    mockedS3Client.on(GetBucketAclCommand).resolves({});

    for (const scannerFn of S3Scanner.getters) {
      await scannerFn(s3Client, connector, testContext);
    }

    t.equal(mockedS3Client.commandCalls(ListBucketsCommand).length, 1);
    t.equal(mockedS3Client.commandCalls(GetBucketTaggingCommand).length, 1);
    t.equal(
      mockedS3Client.commandCalls(GetBucketNotificationConfigurationCommand)
        .length,
      1,
    );
    t.equal(mockedS3Client.commandCalls(GetBucketWebsiteCommand).length, 1);
    t.equal(mockedS3Client.commandCalls(GetBucketAclCommand).length, 1);

    const edges = await S3Scanner.getEdges!(connector);
    t.equal(edges.length, 3);

    t.ok(
      edges.find(
        (edge) => edge.source === bucketArn && edge.target === snsTopicArn,
      ),
    );
    t.ok(
      edges.find(
        (edge) => edge.source === bucketArn && edge.target === sqsQueueArn,
      ),
    );
    t.ok(
      edges.find(
        (edge) =>
          edge.source === bucketArn && edge.target === lambdaFunctionArn,
      ),
    );
  },
);

t.test("No Buckets returned from ListBucketsCommand", async () => {
  const testContext = {
    region: "us-east-1",
    account: "0".repeat(8),
  };
  const s3Client = S3Scanner.getClient(fromProcess(), testContext);

  const mockedS3Client = mockClient(s3Client);

  // Mock each of the functions used to pull state
  mockedS3Client.on(ListBucketsCommand).resolves({
    Buckets: [],
  });

  for (const scannerFn of S3Scanner.getters) {
    await scannerFn(s3Client, connector, testContext);
  }

  t.equal(mockedS3Client.commandCalls(ListBucketsCommand).length, 1);
  t.equal(mockedS3Client.commandCalls(GetBucketTaggingCommand).length, 0);
  t.equal(
    mockedS3Client.commandCalls(GetBucketNotificationConfigurationCommand)
      .length,
    0,
  );
  t.equal(mockedS3Client.commandCalls(GetBucketWebsiteCommand).length, 0);
  t.equal(mockedS3Client.commandCalls(GetBucketAclCommand).length, 0);

  const edges = await S3Scanner.getEdges!(connector);
  t.equal(edges.length, 0);
});
