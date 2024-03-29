import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./generated/client";
import { ListTables, DescribeTable } from "./generated/getters";
import { getNodes } from "./generated/graph";

const DynamoDBScanner: ServiceModule<DynamoDBClient, "aws"> = {
  provider: "aws",
  service: "dynamodb",
  key: "DynamoDB",
  getClient,
  callPerRegion: true,
  getters: [ListTables, DescribeTable],
  getNodes,
};

export default DynamoDBScanner;
