import { createReadStream } from "fs";
import { mockClient } from "aws-sdk-client-mock";
import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import t from "tap";
import { sdkStreamMixin } from "@aws-sdk/util-stream-node";
import { resolve as resolvePath } from "path";
import S3Connector from "../src";

const testPrefix = "test-prefix";
const testBucket = "test-bucket";
t.test("Builds file path with correct hierarchy", (tap) => {
  const s3Client = new S3Client();
  const connector = new S3Connector({
    S3: s3Client,
    prefix: testPrefix,
    bucket: testBucket,
  });

  const testAccount = "0".repeat(12);
  const region = "us-east-1";
  const service = "lambda";
  const functionName = "ListFunctions";
  const resolvedFilePath = connector.buildFilePathForServiceCall(
    testAccount,
    region,
    service,
    functionName,
  );
  tap.equal(
    resolvedFilePath,
    `${testPrefix}/${service}-${functionName}/${testAccount}/${region}.json`,
  );
  tap.end();
});

t.test(
  "onServiceScanCompleteCallback sends the expected S3 put request",
  async (tap) => {
    const s3Client = new S3Client();
    const mockedS3Client = mockClient(s3Client);
    const connector = new S3Connector({
      S3: s3Client,
      prefix: testPrefix,
      bucket: testBucket,
    });

    const testAccount = "0".repeat(12);
    const region = "us-east-1";
    const service = "lambda";
    const functionName = "ListFunctions";
    const testState = { Functions: [] };
    const expectedFilePath = `${testPrefix}/${service}-${functionName}/${testAccount}/${region}.json`;
    mockedS3Client.on(PutObjectCommand).resolves({});
    await connector.onServiceScanCompleteCallback(
      testAccount,
      region,
      service,
      functionName,
      testState,
    );

    const putObjectCallInput = mockedS3Client.call(0).args[0].input;
    tap.match(putObjectCallInput, {
      Bucket: testBucket,
      Key: expectedFilePath,
      Body: JSON.stringify(testState),
    });
    return tap.end();
  },
);

t.test(
  "resolveStateForServiceFunction sends the expected get request",
  async (tap) => {
    const s3Client = new S3Client();
    const mockedS3Client = mockClient(s3Client);
    const connector = new S3Connector({
      S3: s3Client,
      prefix: testPrefix,
      bucket: testBucket,
    });

    const testAccount = "0".repeat(12);
    const region = "us-east-1";
    const service = "lambda";
    const functionName = "ListFunctions";
    const expectedFilePath = `${testPrefix}/${service}-${functionName}/${testAccount}/${region}.json`;
    mockedS3Client.on(GetObjectCommand).resolves({});
    await connector.resolveStateForServiceFunction(
      testAccount,
      region,
      service,
      functionName,
    );

    const getObjectCallInput = mockedS3Client.call(0).args[0].input;
    tap.match(getObjectCallInput, {
      Bucket: testBucket,
      Key: expectedFilePath,
    });
    return tap.end();
  },
);

t.test(
  "resolveStateForServiceFunction reads from cache if set",
  async (tap) => {
    const s3Client = new S3Client();
    const mockedS3Client = mockClient(s3Client);
    const connector = new S3Connector({
      S3: s3Client,
      prefix: testPrefix,
      bucket: testBucket,
    });
    const testAccount = "0".repeat(12);
    const region = "us-east-1";
    const service = "lambda";
    const functionName = "ListFunctions";
    mockedS3Client.on(PutObjectCommand).resolves({});

    const testState = {
      Functions: [
        {
          Name: "test-function",
        },
      ],
    };
    // setup cache
    await connector.onServiceScanCompleteCallback(
      testAccount,
      region,
      service,
      functionName,
      testState,
    );

    const resolvedState = await connector.resolveStateForServiceFunction(
      testAccount,
      region,
      service,
      functionName,
    );

    // assert that state resolves as expected
    tap.match(resolvedState, testState);

    // assert that no S3 get call are made when cache is hit
    const getCalls = mockedS3Client.commandCalls(GetObjectCommand);
    tap.equal(getCalls.length, 0);
    return tap.end();
  },
);

t.test(
  "getGlobalStateForServiceFunction lists the available keys and then reads their state",
  async (tap) => {
    const s3Client = new S3Client();
    const mockedS3Client = mockClient(s3Client);
    const connector = new S3Connector({
      S3: s3Client,
      prefix: testPrefix,
      bucket: testBucket,
    });

    const testAccount = "0".repeat(12);
    const usRegion = "us-east-1";
    const service = "lambda";
    const functionName = "ListFunctions";
    const expectedBasePath = `${testPrefix}/${service}-${functionName}`;
    const expectedUSFilePath = `${expectedBasePath}/${testAccount}/${usRegion}.json`;
    const euRegion = "eu-west-1";
    const expectedEUFilePath = `${expectedBasePath}/${testAccount}/${euRegion}.json`;
    mockedS3Client.on(ListObjectsV2Command).resolves({
      Contents: [{ Key: expectedUSFilePath }, { Key: expectedEUFilePath }],
    });

    const buildResponseBody = () =>
      sdkStreamMixin(
        createReadStream(
          resolvePath(__dirname, "./fixtures/ListFunctions.json"),
        ),
      );
    mockedS3Client
      .on(GetObjectCommand)
      .resolvesOnce({
        Body: buildResponseBody(),
      })
      .resolvesOnce({
        Body: buildResponseBody(),
      });
    await connector.getGlobalStateForServiceFunction(service, functionName);

    const listObjectsCall = mockedS3Client.call(0).args[0].input;
    tap.match(listObjectsCall, {
      Bucket: testBucket,
      Prefix: expectedBasePath,
    });

    const getObjectCallInputUS = mockedS3Client.call(1).args[0].input;
    tap.match(getObjectCallInputUS, {
      Bucket: testBucket,
      Key: expectedUSFilePath,
    });

    const getObjectCallInputEU = mockedS3Client.call(2).args[0].input;
    tap.match(getObjectCallInputEU, {
      Bucket: testBucket,
      Key: expectedEUFilePath,
    });
    return tap.end();
  },
);
