import type {
  GetStagesCommandInput,
  GetStagesCommandOutput,
  Stage,
} from "@aws-sdk/client-apigatewayv2";
import { evaluateSelector, tryNormalizeDateEpoch } from "@infrascan/core";
import type {
  State,
  TranslatedEntity,
  WithCallContext,
} from "@infrascan/shared-types";
import { formatTags, getApiChildArn, getParentApiArn } from "./common";
import type { ApiGateway } from "./types";

export const ApiGatewayStageEntity: TranslatedEntity<
  ApiGateway,
  State<GetStagesCommandOutput, GetStagesCommandInput>,
  WithCallContext<Stage, GetStagesCommandInput>
> = {
  version: "0.1.0",
  debugLabel: "api-gateway-stage",
  provider: "aws",
  command: "GetStages",
  category: "api-gateway",
  subcategory: "stage",
  nodeType: "api-gateway-stage",
  selector: "ApiGatewayV2|GetStages|[]",

  getState(stateConnector, context) {
    return evaluateSelector(
      context.account,
      context.region,
      ApiGatewayStageEntity.selector,
      stateConnector,
    );
  },

  translate(val) {
    if (val._parameters?.ApiId == null) {
      return [];
    }
    return (val._result.Items ?? [])
      .filter((stage) => stage.StageName != null)
      .map((stage) => ({
        ...stage,
        $parameters: val._parameters,
        $metadata: val._metadata,
      }));
  },

  components: {
    $metadata(val) {
      return {
        version: ApiGatewayStageEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: getApiChildArn(val, "stages", val.StageName!),
        label: val.StageName!,
        nodeClass: "informational",
        nodeType: ApiGatewayStageEntity.nodeType,
        parent: getParentApiArn(val),
      };
    },

    $source(val) {
      return {
        command: ApiGatewayStageEntity.command,
        parameters: val.$parameters,
      };
    },

    tenant(val) {
      return {
        tenantId: val.$metadata.account,
        provider: ApiGatewayStageEntity.provider,
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
        id: getApiChildArn(val, "stages", val.StageName!),
        name: val.StageName!,
        description: val.Description,
        category: ApiGatewayStageEntity.category,
        subcategory: ApiGatewayStageEntity.subcategory,
      };
    },

    audit(val) {
      return {
        createdAt: tryNormalizeDateEpoch(val.CreatedDate),
      };
    },

    apiGateway(val) {
      return {
        stage: {
          apiId: val.$parameters?.ApiId,
          stageName: val.StageName,
          autoDeploy: val.AutoDeploy,
          deploymentId: val.DeploymentId,
          lastDeploymentStatusMessage: val.LastDeploymentStatusMessage,
          stageVariables: val.StageVariables,
          accessLogs:
            val.AccessLogSettings != null
              ? {
                  destinationArn: val.AccessLogSettings.DestinationArn,
                  format: val.AccessLogSettings.Format,
                }
              : undefined,
          defaultRouteSettings:
            val.DefaultRouteSettings != null
              ? {
                  detailedMetricsEnabled:
                    val.DefaultRouteSettings.DetailedMetricsEnabled,
                  throttlingBurstLimit:
                    val.DefaultRouteSettings.ThrottlingBurstLimit,
                  throttlingRateLimit:
                    val.DefaultRouteSettings.ThrottlingRateLimit,
                }
              : undefined,
          managed: val.ApiGatewayManaged ?? false,
        },
      };
    },

    tags(val) {
      return formatTags(val.Tags);
    },
  },
};
