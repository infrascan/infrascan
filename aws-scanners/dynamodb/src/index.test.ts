import { mkdtempSync } from "fs";
import t from "tap";
import { env } from "process";
import { join } from "path";
import { tmpdir } from "os";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  ListTablesCommand,
  DescribeTableCommand,
} from "@aws-sdk/client-dynamodb";
import { generateNodesFromEntity } from "@infrascan/core";
import buildFsConnector from "@infrascan/fs-connector";
import DynamoDBScanner from ".";
import { DynamoTable } from "./graph";

const stateDirectoryPrefix = "infrascan-test-state-";
const baseDirectory =
  env.DEBUG_STATE != null
    ? stateDirectoryPrefix
    : join(tmpdir(), stateDirectoryPrefix);
const tmpDir = mkdtempSync(baseDirectory);
const connector = buildFsConnector(tmpDir);

t.test(
  "State is pulled correctly from DynamoDB, and formatted as expected",
  async ({ ok, equal }) => {
    const testContext = {
      region: "us-east-1",
      account: "0".repeat(8),
    };
    const dynamoClient = DynamoDBScanner.getClient(fromProcess(), testContext);

    const mockedDynamoClient = mockClient(dynamoClient);

    // Mock each of the functions used to pull state
    const testTable = "test-dynamo-table";
    mockedDynamoClient.on(ListTablesCommand).resolves({
      TableNames: [testTable],
    });

    const tableArn = `arn:aws:dynamodb:${testContext.region}:${testContext.account}:table/${testTable}`;
    mockedDynamoClient.on(DescribeTableCommand).resolves({
      Table: {
        TableName: testTable,
        TableArn: tableArn,
        SSEDescription: {
          KMSMasterKeyArn: "arn:aws:kms:us-east-1:0000000000:key:abcdef",
        },
        CreationDateTime: new Date().toISOString(),
      },
    });

    for (const scannerFn of DynamoDBScanner.getters) {
      await scannerFn(dynamoClient, connector, testContext);
    }

    const logGroupCallCount =
      mockedDynamoClient.commandCalls(ListTablesCommand).length;
    equal(logGroupCallCount, 1);

    const describeTableCallCount =
      mockedDynamoClient.commandCalls(DescribeTableCommand).length;
    equal(describeTableCallCount, 1);
    const firstCallArgs = mockedDynamoClient
      .commandCalls(DescribeTableCommand)
      .at(0)?.args;
    equal(firstCallArgs?.[0].input.TableName, testTable);

    for (const entity of DynamoDBScanner.entities ?? []) {
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
        ok(node.audit);
        ok(node.encryption?.keyId);
      }
    }
  },
);

t.test("No Tables returned from ListTablesCommand", async ({ equal }) => {
  const testContext = {
    region: "us-east-1",
    account: "0".repeat(8),
  };
  const dynamoClient = DynamoDBScanner.getClient(fromProcess(), testContext);

  const mockedDynamoClient = mockClient(dynamoClient);

  // Mock each of the functions used to pull state
  mockedDynamoClient.on(ListTablesCommand).resolves({
    TableNames: [],
  });

  for (const scannerFn of DynamoDBScanner.getters) {
    await scannerFn(dynamoClient, connector, testContext);
  }

  const logGroupCallCount =
    mockedDynamoClient.commandCalls(ListTablesCommand).length;
  equal(logGroupCallCount, 1);

  const describeTableCallCount =
    mockedDynamoClient.commandCalls(DescribeTableCommand).length;
  equal(describeTableCallCount, 0);
});
