import type {
  Authorizer,
  GetAuthorizersCommandInput,
  GetAuthorizersCommandOutput,
} from "@aws-sdk/client-apigatewayv2";
import { evaluateSelector } from "@infrascan/core";
import type {
  State,
  TranslatedEntity,
  WithCallContext,
} from "@infrascan/shared-types";
import { resolveAuthorizerTarget } from "../targets";
import { getApiChildArn, getParentApiArn } from "./common";
import type { ApiGateway } from "./types";

export const ApiGatewayAuthorizerEntity: TranslatedEntity<
  ApiGateway,
  State<GetAuthorizersCommandOutput, GetAuthorizersCommandInput>,
  WithCallContext<Authorizer, GetAuthorizersCommandInput>
> = {
  version: "0.1.0",
  debugLabel: "api-gateway-authorizer",
  provider: "aws",
  command: "GetAuthorizers",
  category: "api-gateway",
  subcategory: "authorizer",
  nodeType: "api-gateway-authorizer",
  selector: "ApiGatewayV2|GetAuthorizers|[]",

  getState(stateConnector, context) {
    return evaluateSelector(
      context.account,
      context.region,
      ApiGatewayAuthorizerEntity.selector,
      stateConnector,
    );
  },

  translate(val) {
    if (val._parameters?.ApiId == null) {
      return [];
    }
    return (val._result.Items ?? [])
      .filter((authorizer) => authorizer.AuthorizerId != null)
      .map((authorizer) => ({
        ...authorizer,
        $parameters: val._parameters,
        $metadata: val._metadata,
      }));
  },

  components: {
    $metadata(val) {
      return {
        version: ApiGatewayAuthorizerEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: getApiChildArn(val, "authorizers", val.AuthorizerId!),
        label: val.Name ?? val.AuthorizerId!,
        nodeClass: "informational",
        nodeType: ApiGatewayAuthorizerEntity.nodeType,
        parent: getParentApiArn(val),
      };
    },

    $source(val) {
      return {
        command: ApiGatewayAuthorizerEntity.command,
        parameters: val.$parameters,
      };
    },

    tenant(val) {
      return {
        tenantId: val.$metadata.account,
        provider: ApiGatewayAuthorizerEntity.provider,
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
        id: getApiChildArn(val, "authorizers", val.AuthorizerId!),
        name: val.Name ?? val.AuthorizerId!,
        category: ApiGatewayAuthorizerEntity.category,
        subcategory: ApiGatewayAuthorizerEntity.subcategory,
      };
    },

    iam(val) {
      if (val.AuthorizerCredentialsArn == null) {
        return undefined;
      }
      return {
        roles: [
          {
            arn: val.AuthorizerCredentialsArn,
            label: "authorizer-credentials",
          },
        ],
      };
    },

    apiGateway(val) {
      return {
        authorizer: {
          apiId: val.$parameters?.ApiId,
          authorizerId: val.AuthorizerId,
          type: val.AuthorizerType,
          uri: val.AuthorizerUri,
          credentialsArn: val.AuthorizerCredentialsArn,
          identitySource: val.IdentitySource,
          payloadFormatVersion: val.AuthorizerPayloadFormatVersion,
          resultTtlInSeconds: val.AuthorizerResultTtlInSeconds,
          enableSimpleResponses: val.EnableSimpleResponses,
          jwt:
            val.JwtConfiguration != null
              ? {
                  audience: val.JwtConfiguration.Audience,
                  issuer: val.JwtConfiguration.Issuer,
                }
              : undefined,
          resolvedTarget: resolveAuthorizerTarget(val),
        },
      };
    },
  },
};
