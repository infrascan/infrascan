import {
  DynamoDBClient,
  ListTablesCommand,
  DescribeTableCommand,
  DynamoDBServiceException,
} from "@aws-sdk/client-dynamodb";
import { resolveFunctionCallParameters } from "@infrascan/core";
import type {
  Connector,
  GenericState,
  AwsContext,
} from "@infrascan/shared-types";
import type {
  ListTablesCommandInput,
  ListTablesCommandOutput,
  DescribeTableCommandInput,
  DescribeTableCommandOutput,
} from "@aws-sdk/client-dynamodb";

export async function ListTables(
  client: DynamoDBClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const state: GenericState[] = [];
  try {
    console.log("dynamodb ListTables");
    const preparedParams: ListTablesCommandInput = {};
    const cmd = new ListTablesCommand(preparedParams);
    const result: ListTablesCommandOutput = await client.send(cmd);
    state.push({
      _metadata: { account: context.account, region: context.region },
      _parameters: preparedParams,
      _result: result,
    });
  } catch (err: unknown) {
    if (err instanceof DynamoDBServiceException) {
      if (err?.$retryable) {
        console.log("Encountered retryable error", err);
      } else {
        console.log("Encountered unretryable error", err);
      }
    } else {
      console.log("Encountered unexpected error", err);
    }
  }
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "DynamoDB",
    "ListTables",
    state,
  );
}

export async function DescribeTable(
  client: DynamoDBClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const state: GenericState[] = [];
  try {
    console.log("dynamodb DescribeTable");
    const resolvers = [
      { Key: "TableName", Selector: "DynamoDB|ListTables|[]._result[]" },
    ];
    const parameterQueue = (await resolveFunctionCallParameters(
      context.account,
      context.region,
      resolvers,
      stateConnector,
    )) as DescribeTableCommandInput[];
    for (const parameters of parameterQueue) {
      const preparedParams: DescribeTableCommandInput = parameters;
      const cmd = new DescribeTableCommand(preparedParams);
      const result: DescribeTableCommandOutput = await client.send(cmd);
      state.push({
        _metadata: { account: context.account, region: context.region },
        _parameters: preparedParams,
        _result: result,
      });
    }
  } catch (err: unknown) {
    if (err instanceof DynamoDBServiceException) {
      if (err?.$retryable) {
        console.log("Encountered retryable error", err);
      } else {
        console.log("Encountered unretryable error", err);
      }
    } else {
      console.log("Encountered unexpected error", err);
    }
  }
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "DynamoDB",
    "DescribeTable",
    state,
  );
}
