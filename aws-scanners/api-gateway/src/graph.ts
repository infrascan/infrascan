import type {
  BaseState,
  TranslatedEntity,
  WithCallContext,
  State,
} from "@infrascan/shared-types";
import {
  Api,
  GetApisCommandInput,
  GetApisCommandOutput,
} from "@aws-sdk/client-apigatewayv2";
import { evaluateSelector } from "@infrascan/core";

export interface Selections {
  route?: string;
  apiKey?: string;
}

export interface Cors {
  AllowCredentials?: boolean;
  AllowHeaders?: string[];
  AllowMethods?: string[];
  AllowOrigins?: string[];
  ExposeHeaders?: string[];
  MaxAge?: number;
}

export interface ApiGatewayState {
  protocol?: string;
  selections?: Selections;
  managed?: boolean;
  cors?: Cors;
  disableExecuteApiEndpoint?: boolean;
  disableSchemaValidation?: boolean;
  importInfo?: string[];
  version?: string;
  warnings?: string[];
}

export type ApiGateway = BaseState<GetApisCommandInput> & {
  apiGateway: ApiGatewayState;
};
export type GraphState = ApiGateway;

export const ApiGatewayEntity: TranslatedEntity<
  ApiGateway,
  State<GetApisCommandOutput, GetApisCommandInput>,
  WithCallContext<Api, GetApisCommandInput>
> = {
  version: "0.1.0",
  debugLabel: "api-gateway",
  provider: "aws",
  command: "GetApis",
  category: "api-gateway",
  subcategory: "apis",
  nodeType: "api-gateway",
  selector: "ApiGatewayV2|GetApis|[]",

  getState(stateConnector, context) {
    return evaluateSelector(
      context.account,
      context.region,
      ApiGatewayEntity.selector,
      stateConnector,
    );
  },

  translate(val) {
    return (val._result.Items ?? []).map((api) =>
      Object.assign(api, {
        $parameters: val._parameters,
        $metadata: val._metadata,
      }),
    );
  },

  components: {
    $metadata(val) {
      return {
        version: ApiGatewayEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: val.ApiEndpoint!,
        label: val.ApiEndpoint!,
        nodeType: ApiGatewayEntity.nodeType,
        parent: `${val.$metadata.account}-${val.$metadata.region}`,
      };
    },

    $source(val) {
      return { command: ApiGatewayEntity.command, parameters: val.$parameters };
    },

    tenant(val) {
      return {
        tenantId: val.$metadata.account,
        provider: ApiGatewayEntity.provider,
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
        id: val.ApiEndpoint!,
        name: val.ApiEndpoint!,
        category: ApiGatewayEntity.category,
        subcategory: ApiGatewayEntity.subcategory,
        description: val.Description,
      };
    },

    apiGateway(val) {
      return {
        protocol: val.ProtocolType,
        selections: {
          route: val.RouteSelectionExpression,
          apiKey: val.ApiKeySelectionExpression,
        },
        managed: val.ApiGatewayManaged ?? false,
        cors: val.CorsConfiguration,
        disableExecuteApiEndpoint: val.DisableExecuteApiEndpoint,
        disableSchemaValidation: val.DisableSchemaValidation,
        importInfo: val.ImportInfo,
        version: val.Version,
        warnings: val.Warnings,
      };
    },

    dns(val) {
      return {
        domains:
          val.DisableExecuteApiEndpoint === false && val.ApiEndpoint != null
            ? [val.ApiEndpoint]
            : [],
      };
    },

    tags(val) {
      if (val.Tags == null) {
        return undefined;
      }
      return Object.entries(val.Tags).map(([key, value]) => ({
        key,
        value,
      }));
    },
  },
};
