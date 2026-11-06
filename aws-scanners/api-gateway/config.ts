import * as ApiGatewayV2 from "@aws-sdk/client-apigatewayv2";
import type { ScannerDefinition } from "@infrascan/shared-types";

export type ApiGatewayFunctions =
  | "GetApis"
  | "GetDomainNames"
  | "GetRoutes"
  | "GetIntegrations"
  | "GetAuthorizers"
  | "GetStages";

/**
 * JMESPath expression which builds the ARN of the API a piece of per-API state
 * (routes, integrations, stages, authorizers) was pulled for. Matches the node
 * id produced by the API entity in src/graph.
 */
const API_ARN_FROM_PARAMETERS =
  "join('', ['arn:', _metadata.partition || 'aws', ':apigateway:', _metadata.region, '::/apis/', _parameters.ApiId])";

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
    {
      fn: "GetStages",
      parameters: [{ Key: "ApiId", Selector: API_ID_SELECTOR }],
      paginationToken: PAGINATION,
    },
  ],
  edges: [
    {
      state: "ApiGatewayV2|GetStages|[]",
      from: API_ARN_FROM_PARAMETERS,
      to: "_result.Items[?AccessLogSettings.DestinationArn] | [].{target:AccessLogSettings.DestinationArn,name:join('', ['Access logs (', StageName, ')'])}",
    },
  ],
};

export default ApiGatewayScanner;
