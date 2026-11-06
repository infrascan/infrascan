import type {
  GetRoutesCommandInput,
  GetRoutesCommandOutput,
  Route,
} from "@aws-sdk/client-apigatewayv2";
import { evaluateSelector } from "@infrascan/core";
import type {
  State,
  TranslatedEntity,
  WithCallContext,
} from "@infrascan/shared-types";
import { getIntegrationIdFromRouteTarget } from "../targets";
import { getApiChildArn, getParentApiArn } from "./common";
import type { ApiGateway } from "./types";

export const ApiGatewayRouteEntity: TranslatedEntity<
  ApiGateway,
  State<GetRoutesCommandOutput, GetRoutesCommandInput>,
  WithCallContext<Route, GetRoutesCommandInput>
> = {
  version: "0.1.0",
  debugLabel: "api-gateway-route",
  provider: "aws",
  command: "GetRoutes",
  category: "api-gateway",
  subcategory: "route",
  nodeType: "api-gateway-route",
  selector: "ApiGatewayV2|GetRoutes|[]",

  getState(stateConnector, context) {
    return evaluateSelector(
      context.account,
      context.region,
      ApiGatewayRouteEntity.selector,
      stateConnector,
    );
  },

  translate(val) {
    if (val._parameters?.ApiId == null) {
      return [];
    }
    return (val._result.Items ?? [])
      .filter((route) => route.RouteId != null)
      .map((route) => ({
        ...route,
        $parameters: val._parameters,
        $metadata: val._metadata,
      }));
  },

  components: {
    $metadata(val) {
      return {
        version: ApiGatewayRouteEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: getApiChildArn(val, "routes", val.RouteId!),
        label: val.RouteKey ?? val.RouteId!,
        nodeClass: "informational",
        nodeType: ApiGatewayRouteEntity.nodeType,
        parent: getParentApiArn(val),
      };
    },

    $source(val) {
      return {
        command: ApiGatewayRouteEntity.command,
        parameters: val.$parameters,
      };
    },

    tenant(val) {
      return {
        tenantId: val.$metadata.account,
        provider: ApiGatewayRouteEntity.provider,
        partition: val.$metadata.partition,
      };
    },

    location(val) {
      return {
        code: val.$metadata.region,
      };
    },

    resource(val) {
      return {
        id: getApiChildArn(val, "routes", val.RouteId!),
        name: val.RouteKey ?? val.RouteId!,
        category: ApiGatewayRouteEntity.category,
        subcategory: ApiGatewayRouteEntity.subcategory,
      };
    },

    apiGateway(val) {
      return {
        route: {
          apiId: val.$parameters?.ApiId,
          routeId: val.RouteId,
          routeKey: val.RouteKey,
          target: val.Target,
          integrationId: getIntegrationIdFromRouteTarget(val.Target),
          authorizerId: val.AuthorizerId,
          authorizationType: val.AuthorizationType,
          authorizationScopes: val.AuthorizationScopes,
          apiKeyRequired: val.ApiKeyRequired,
          operationName: val.OperationName,
          managed: val.ApiGatewayManaged ?? false,
        },
      };
    },
  },
};
