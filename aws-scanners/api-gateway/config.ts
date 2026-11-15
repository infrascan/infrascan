import * as ApiGatewayV2 from "@aws-sdk/client-apigatewayv2";
import type { ScannerDefinition } from "@infrascan/shared-types";

export type ApiGatewayFunctions =
  | "GetApis"
  | "GetDomainNames"
  | "GetRoutes"
  | "GetIntegrations"
  | "GetAuthorizers";

const API_ID_SELECTOR = "ApiGatewayV2|GetApis|[]._result.Items[].ApiId";

const PAGINATION = {
  request: "NextToken",
  response: "NextToken",
};

// Route -> integration -> backend edges need routes and integrations to be
// joined, which the per-state edge selectors can't express. Those edges, and
// the IAM roles used by integrations and authorizers, are resolved in
// src/edges.ts.
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
    {
      fn: "GetRoutes",
      parameters: [{ Key: "ApiId", Selector: API_ID_SELECTOR }],
      paginationToken: PAGINATION,
    },
    {
      fn: "GetIntegrations",
      parameters: [{ Key: "ApiId", Selector: API_ID_SELECTOR }],
      paginationToken: PAGINATION,
    },
    {
      fn: "GetAuthorizers",
      parameters: [{ Key: "ApiId", Selector: API_ID_SELECTOR }],
      paginationToken: PAGINATION,
    },
  ],
};

export default ApiGatewayScanner;
