import { mkdtempSync } from "fs";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  ListTablesCommand,
  DescribeTableCommand,
} from "@aws-sdk/client-dynamodb";
import buildFsConnector from "@infrascan/fs-connector";
import DynamoDBScanner from "../src";

const tmpDir = mkdtempSync("infrascan-test-state-");
const connector = buildFsConnector(tmpDir);

t.test(
  "State is pulled correctly from DynamoDB, and formatted as expected",
  async () => {
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
      },
    });

    for (const scannerFn of DynamoDBScanner.getters) {
      await scannerFn(dynamoClient, connector, testContext);
    }

    const logGroupCallCount =
      mockedDynamoClient.commandCalls(ListTablesCommand).length;
    t.equal(logGroupCallCount, 1);

    const describeTableCallCount =
      mockedDynamoClient.commandCalls(DescribeTableCommand).length;
    t.equal(describeTableCallCount, 1);
    const firstCallArgs = mockedDynamoClient
      .commandCalls(DescribeTableCommand)
      .at(0)?.args;
    t.equal(firstCallArgs?.[0].input.TableName, testTable);

    if (DynamoDBScanner.getNodes != null) {
      const nodes = await DynamoDBScanner.getNodes(connector, testContext);
      t.equal(nodes.length, 1);
      t.ok(nodes.find((node) => node.id === tableArn));
    }
  },
);
