import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./generated/client";
import { ListTables, DescribeTable } from "./generated/getters";
import { DynamoDbTableEntity } from "./graph";

const DynamoDBScanner: ServiceModule<DynamoDBClient, "aws"> = {
  provider: "aws",
  service: "dynamodb",
  key: "DynamoDB",
  getClient,
  callPerRegion: true,
  getters: [ListTables, DescribeTable],
  entities: [DynamoDbTableEntity],
};

export type { GraphState, DynamoState } from "./graph";
export default DynamoDBScanner;
