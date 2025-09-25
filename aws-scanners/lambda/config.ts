import * as Lambda from "@aws-sdk/client-lambda";
import type { ScannerDefinition } from "@infrascan/shared-types";

export type LambdaFunctions =
  | "ListFunctions"
  | "GetFunction"
  | "ListEventSourceMappings";

const LambdaScanner: ScannerDefinition<
  "Lambda",
  typeof Lambda,
  LambdaFunctions
> = {
  provider: "aws",
  service: "lambda",
  clientKey: "Lambda",
  key: "Lambda",
  callPerRegion: true,
  getters: [
    {
      fn: "ListFunctions",
      paginationToken: {
        request: "Marker",
        response: "NextMarker",
      },
    },
    {
      fn: "GetFunction",
      parameters: [
        {
          Key: "FunctionName",
          Selector: "Lambda|ListFunctions|[]._result.Functions[].FunctionArn",
        },
      ],
    },
    {
      fn: "ListEventSourceMappings",
      parameters: [
        {
          Key: "FunctionName",
          Selector: "Lambda|ListFunctions|[]._result.Functions[].FunctionArn",
        },
      ],
      paginationToken: {
        request: "Marker",
        response: "NextMarker",
      },
    },
  ],
  iamRoles: [
    "Lambda|GetFunction|[]._result.Configuration | [].{roleArn:Role,executor:FunctionArn}",
  ],
};

export default LambdaScanner;
