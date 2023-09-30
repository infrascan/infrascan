import * as DynamoDB from "@aws-sdk/client-dynamodb";
import type { ScannerDefinition } from "@infrascan/shared-types";

export type DynamoDBFunctions =
  | "ListTables"
  | "DescribeTable";
const DynamoDBScanner: ScannerDefinition<
  "DynamoDB",
  typeof DynamoDB,
  DynamoDBFunctions
> = {
  provider: "aws",
  service: "dynamodb",
  clientKey: "DynamoDB",
  key: "DynamoDB",
  callPerRegion: true,
  getters: [
    {
      fn: "ListTables",
    },
    {
      fn: "DescribeTable",
      parameters: [
        {
          Key: "TableName",
          Selector:
            "DynamoDB|ListTables|[]._result[]",
        },
      ]
    },
  ],
  nodes: ["DynamoDB|DescribeTable|[].{id:_result.TableArn}",]
};

export default DynamoDBScanner;
