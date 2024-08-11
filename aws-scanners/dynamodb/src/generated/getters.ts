import { resolveFunctionCallParameters } from "@infrascan/core";
import {
  DynamoDBClient,
  DynamoDBServiceException,
  ListTablesCommand,
  ListTablesCommandInput,
  ListTablesCommandOutput,
  DescribeTableCommand,
  DescribeTableCommandInput,
  DescribeTableCommandOutput,
} from "@aws-sdk/client-dynamodb";
import type {
  Connector,
  GenericState,
  AwsContext,
} from "@infrascan/shared-types";
import debug from "debug";

export async function ListTables(
  client: DynamoDBClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("dynamodb:ListTables");
  const state: GenericState[] = [];
  getterDebug("ListTables");
  const preparedParams: ListTablesCommandInput = {};
  try {
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
  getterDebug("Recording state");
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
  const getterDebug = debug("dynamodb:DescribeTable");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [
    {
      Key: "TableName",
      Selector: "DynamoDB|ListTables|[]._result.TableNames[]",
    },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as DescribeTableCommandInput[];
  for (const parameters of parameterQueue) {
    const preparedParams: DescribeTableCommandInput = parameters;
    try {
      const cmd = new DescribeTableCommand(preparedParams);
      const result: DescribeTableCommandOutput = await client.send(cmd);
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
  }
  getterDebug("Recording state");
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "DynamoDB",
    "DescribeTable",
    state,
  );
}
