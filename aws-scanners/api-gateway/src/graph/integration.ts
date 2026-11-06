import type {
  GetIntegrationsCommandInput,
  GetIntegrationsCommandOutput,
  Integration,
} from "@aws-sdk/client-apigatewayv2";
import { evaluateSelector } from "@infrascan/core";
import type {
  State,
  TranslatedEntity,
  WithCallContext,
} from "@infrascan/shared-types";
import { resolveIntegrationTarget } from "../targets";
import { getApiChildArn, getParentApiArn } from "./common";
import type { ApiGateway } from "./types";

export const ApiGatewayIntegrationEntity: TranslatedEntity<
  ApiGateway,
  State<GetIntegrationsCommandOutput, GetIntegrationsCommandInput>,
  WithCallContext<Integration, GetIntegrationsCommandInput>
> = {
  version: "0.1.0",
  debugLabel: "api-gateway-integration",
  provider: "aws",
  command: "GetIntegrations",
  category: "api-gateway",
  subcategory: "integration",
  nodeType: "api-gateway-integration",
  selector: "ApiGatewayV2|GetIntegrations|[]",

  getState(stateConnector, context) {
    return evaluateSelector(
      context.account,
      context.region,
      ApiGatewayIntegrationEntity.selector,
      stateConnector,
    );
  },

  translate(val) {
    if (val._parameters?.ApiId == null) {
      return [];
    }
    return (val._result.Items ?? [])
      .filter((integration) => integration.IntegrationId != null)
      .map((integration) => ({
        ...integration,
        $parameters: val._parameters,
        $metadata: val._metadata,
      }));
  },

  components: {
    $metadata(val) {
      return {
        version: ApiGatewayIntegrationEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: getApiChildArn(val, "integrations", val.IntegrationId!),
        label: val.IntegrationId!,
        nodeClass: "informational",
        nodeType: ApiGatewayIntegrationEntity.nodeType,
        parent: getParentApiArn(val),
      };
    },

    $source(val) {
      return {
        command: ApiGatewayIntegrationEntity.command,
        parameters: val.$parameters,
      };
    },

    tenant(val) {
      return {
        tenantId: val.$metadata.account,
        provider: ApiGatewayIntegrationEntity.provider,
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
        id: getApiChildArn(val, "integrations", val.IntegrationId!),
        name: val.IntegrationId!,
        description: val.Description,
        category: ApiGatewayIntegrationEntity.category,
        subcategory: ApiGatewayIntegrationEntity.subcategory,
      };
    },

    iam(val) {
      if (val.CredentialsArn == null) {
        return undefined;
      }
      return {
        roles: [{ arn: val.CredentialsArn, label: "integration-credentials" }],
      };
    },

    apiGateway(val) {
      return {
        integration: {
          apiId: val.$parameters?.ApiId,
          integrationId: val.IntegrationId,
          type: val.IntegrationType,
          subtype: val.IntegrationSubtype,
          uri: val.IntegrationUri,
          method: val.IntegrationMethod,
          connectionType: val.ConnectionType,
          connectionId: val.ConnectionId,
          credentialsArn: val.CredentialsArn,
          payloadFormatVersion: val.PayloadFormatVersion,
          timeoutInMillis: val.TimeoutInMillis,
          resolvedTarget: resolveIntegrationTarget(val, val.$metadata),
          managed: val.ApiGatewayManaged ?? false,
        },
      };
    },
  },
};
