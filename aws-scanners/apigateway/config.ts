import * as ApiGatewayV2 from "@aws-sdk/client-apigatewayv2";
import type { ScannerDefinition } from "@infrascan/shared-types";

export type ApiGatewayFunctions = "GetApis" | "GetDomainNames";

const ApiGatewayScanner: ScannerDefinition<
  "ApiGatewayV2",
  typeof ApiGatewayV2,
  ApiGatewayFunctions
> = {
  provider: "aws",
  service: "apigatewayv2",
  clientKey: "ApiGatewayV2",
  key: "ApiGateway",
  callPerRegion: false,
  getters: [
    {
      fn: "GetApis",
    },
    {
      fn: "GetDomainNames",
    },
  ],
  nodes: ["ApiGatewayV2|GetApis|[]._result | [].{id:ApiEndpoint}"],
};

export default ApiGatewayScanner;
