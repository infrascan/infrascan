import * as ApiGatewayV2 from "@aws-sdk/client-apigatewayv2";
import type { ScannerDefinition } from "@infrascan/shared-types";

export type ApiGatewayFunctions = "GetApis" | "GetDomainNames";

const PAGINATION = {
  request: "NextToken",
  response: "NextToken",
};

const ApiGatewayScanner: ScannerDefinition<
  "ApiGatewayV2",
  typeof ApiGatewayV2,
  ApiGatewayFunctions
> = {
  provider: "aws",
  service: "apigatewayv2",
  clientKey: "ApiGatewayV2",
  key: "ApiGateway",
  arnLabel: "apigateway",
  callPerRegion: true,
  getters: [
    {
      fn: "GetApis",
      paginationToken: PAGINATION,
    },
    {
      fn: "GetDomainNames",
      paginationToken: PAGINATION,
    },
  ],
};

export default ApiGatewayScanner;
