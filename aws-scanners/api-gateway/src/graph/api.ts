import type {
  State,
  TranslatedEntity,
  WithCallContext,
} from "@infrascan/shared-types";
import type {
  Api,
  GetApisCommandInput,
  GetApisCommandOutput,
} from "@aws-sdk/client-apigatewayv2";
import { evaluateSelector, tryNormalizeDateEpoch } from "@infrascan/core";
import { formatApiArn } from "../targets";
import { formatTags } from "./common";
import type { ApiGateway } from "./types";

export const ApiGatewayEntity: TranslatedEntity<
  ApiGateway,
  State<GetApisCommandOutput, GetApisCommandInput>,
  WithCallContext<Api, GetApisCommandInput>
> = {
  version: "0.2.0",
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
    return (val._result.Items ?? [])
      .filter((api) => api.ApiId != null)
      .map((api) => ({
        ...api,
        $parameters: val._parameters,
        $metadata: val._metadata,
      }));
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
        id: formatApiArn(
          val.$metadata.region,
          val.ApiId!,
          val.$metadata.partition,
        ),
        label: val.Name ?? val.ApiId!,
        nodeClass: "visual",
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
        id: formatApiArn(
          val.$metadata.region,
          val.ApiId!,
          val.$metadata.partition,
        ),
        name: val.Name ?? val.ApiId!,
        category: ApiGatewayEntity.category,
        subcategory: ApiGatewayEntity.subcategory,
        description: val.Description,
      };
    },

    audit(val) {
      return {
        createdAt: tryNormalizeDateEpoch(val.CreatedDate),
      };
    },

    apiGateway(val) {
      return {
        apiId: val.ApiId,
        endpoint: val.ApiEndpoint,
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
      return formatTags(val.Tags);
    },
  },
};
