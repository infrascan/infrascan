import { ApiGatewayV2Client } from "@aws-sdk/client-apigatewayv2";
import type { Connector, ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./generated/client";
import {
  GetApis,
  GetDomainNames,
  GetRoutes,
  GetIntegrations,
  GetAuthorizers,
  GetStages,
} from "./generated/getters";
import { getEdges as getDeclaredEdges } from "./generated/graph";
import { getRouteEdges, getIamRoles } from "./edges";
import {
  ApiGatewayEntity,
  ApiGatewayRouteEntity,
  ApiGatewayIntegrationEntity,
  ApiGatewayAuthorizerEntity,
  ApiGatewayStageEntity,
} from "./graph";

async function getEdges(stateConnector: Connector) {
  const [declaredEdges, routeEdges] = await Promise.all([
    getDeclaredEdges(stateConnector),
    getRouteEdges(stateConnector),
  ]);
  return declaredEdges.concat(routeEdges);
}

const ApiGatewayV2Scanner: ServiceModule<ApiGatewayV2Client, "aws"> = {
  provider: "aws",
  service: "apigatewayv2",
  key: "ApiGateway",
  arnLabel: "apigateway",
  getClient,
  callPerRegion: true,
  getters: [
    GetApis,
    GetDomainNames,
    GetRoutes,
    GetIntegrations,
    GetAuthorizers,
    GetStages,
  ],
  getEdges,
  getIamRoles,
  // The API entity must come first, as it is the parent of the other entities' nodes
  entities: [
    ApiGatewayEntity,
    ApiGatewayRouteEntity,
    ApiGatewayIntegrationEntity,
    ApiGatewayAuthorizerEntity,
    ApiGatewayStageEntity,
  ],
};

export type {
  GraphState,
  ApiGateway,
  ApiGatewayState,
  Cors,
  Selections,
  RouteDetails,
  IntegrationDetails,
  AuthorizerDetails,
  StageDetails,
} from "./graph";
export default ApiGatewayV2Scanner;
