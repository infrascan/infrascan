import { ApiGatewayV2Client } from "@aws-sdk/client-apigatewayv2";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./generated/client";
import {
  GetApis,
  GetDomainNames,
  GetRoutes,
  GetIntegrations,
} from "./generated/getters";
import { getRouteEdges, getIamRoles } from "./edges";
import {
  ApiGatewayEntity,
  ApiGatewayRouteEntity,
  ApiGatewayIntegrationEntity,
} from "./graph";

const ApiGatewayV2Scanner: ServiceModule<ApiGatewayV2Client, "aws"> = {
  provider: "aws",
  service: "apigatewayv2",
  key: "ApiGateway",
  arnLabel: "apigateway",
  getClient,
  callPerRegion: true,
  getters: [GetApis, GetDomainNames, GetRoutes, GetIntegrations],
  getEdges: getRouteEdges,
  getIamRoles,
  // The API entity must come first, as it is the parent of the other entities' nodes
  entities: [
    ApiGatewayEntity,
    ApiGatewayRouteEntity,
    ApiGatewayIntegrationEntity,
  ],
};

export type {
  GraphState,
  ApiGateway,
  ApiGatewayState,
  ApiReference,
  Cors,
  Selections,
  RouteDetails,
  IntegrationDetails,
} from "./graph";
export default ApiGatewayV2Scanner;
