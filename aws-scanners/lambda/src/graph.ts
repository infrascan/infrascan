import type {
  GetFunctionCommandInput,
  GetFunctionCommandOutput,
  PackageType,
} from "@aws-sdk/client-lambda";
import { evaluateSelector, toLowerCase, Size, Time } from "@infrascan/core";
import type {
  TranslatedEntity,
  BaseState,
  State,
  WithCallContext,
  QualifiedMeasure,
  SizeUnit,
  TimeUnit,
  KVPair,
} from "@infrascan/shared-types";

export interface CodeDetails {
  size?: QualifiedMeasure<SizeUnit>;
  sha256?: string;
  imageUri?: string;
  location?: string;
  repositoryType?: string;
  resolvedImageUri?: string;
  packageType?: PackageType;
}

interface Layer {
  arn?: string;
  size?: QualifiedMeasure<SizeUnit>;
}

export interface FunctionDetails {
  handler?: string;
  runtime?: string;
  memorySize?: QualifiedMeasure<SizeUnit>;
  timeout?: QualifiedMeasure<TimeUnit>;
  layers?: Layer[];
  environment?: KVPair[];
}

export interface ConcurrencyDetails {
  reservedConcurrentExecutions?: number;
}

export type LambdaFunction = BaseState<GetFunctionCommandInput> & {
  lambda: {
    concurrency?: ConcurrencyDetails;
    type?: Lowercase<PackageType>;
    supportedArchitectures?: string[];
    code?: CodeDetails;
    function?: FunctionDetails;
  };
};

export const LambdaFunctionEntity: TranslatedEntity<
  LambdaFunction,
  State<GetFunctionCommandOutput, GetFunctionCommandInput>,
  WithCallContext<GetFunctionCommandOutput, GetFunctionCommandInput>
> = {
  version: "0.1.0",
  debugLabel: "lambda",
  provider: "aws",
  command: "ListFunctions",
  category: "lambda",
  subcategory: "function",
  nodeType: "lambda-function",
  selector: "Lambda|GetFunction|[]",

  getState(state, context) {
    return evaluateSelector(
      context.account,
      context.region,
      LambdaFunctionEntity.selector,
      state,
    );
  },

  translate(val) {
    return [
      Object.assign(val._result, {
        $metadata: val._metadata,
        $parameters: val._parameters,
      }),
    ];
  },

  components: {
    $metadata(val) {
      return {
        version: LambdaFunctionEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: val.Configuration!.FunctionArn!,
        label: val.Configuration!.FunctionName!,
        nodeType: LambdaFunctionEntity.nodeType,
        parent: `${val.$metadata.account}-${val.$metadata.region}`,
      };
    },

    $source(val) {
      return {
        command: LambdaFunctionEntity.command,
        parameters: val.$parameters,
      };
    },

    tenant(val) {
      return {
        tenantId: val.$metadata.account,
        provider: LambdaFunctionEntity.provider,
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
        id: val.Configuration!.FunctionArn!,
        name: val.Configuration!.FunctionName!,
        category: LambdaFunctionEntity.category,
        subcategory: LambdaFunctionEntity.subcategory,
        description: val.Configuration?.Description,
      };
    },

    tags(val) {
      if (val.Tags == null) {
        return [];
      }
      return Object.entries(val.Tags).map(([key, value]) => ({
        key,
        value,
      }));
    },

    iam(val) {
      return {
        roles:
          val.Configuration?.Role != null
            ? [
                {
                  label: "default",
                  arn: val.Configuration.Role,
                },
              ]
            : [],
      };
    },

    encryption(val) {
      return {
        keyId: val.Configuration?.KMSKeyArn,
      };
    },

    deadLetter(val) {
      return {
        targetId: val.Configuration?.DeadLetterConfig?.TargetArn,
      };
    },

    lambda(val) {
      return {
        concurrency: {
          reservedConcurrentExecutions:
            val.Concurrency?.ReservedConcurrentExecutions,
        },
        type:
          val.Configuration?.PackageType != null
            ? toLowerCase(val.Configuration?.PackageType)
            : undefined,
        supportedArchitectures: val.Configuration?.Architectures,
        code: {
          size:
            val.Configuration?.CodeSize != null
              ? {
                  value: val.Configuration?.CodeSize,
                  unit: Size.Bytes,
                }
              : undefined,
          sha256: val.Configuration?.CodeSha256,
          imageUri: val.Code?.ImageUri,
          location: val.Code?.Location,
          repositoryType: val.Code?.RepositoryType,
          resolvedImageUri: val.Code?.ResolvedImageUri,
        },
        function: {
          handler: val.Configuration?.Handler,
          runtime: val.Configuration?.Runtime,
          memorySize:
            val.Configuration?.MemorySize != null
              ? {
                  value: val.Configuration?.MemorySize,
                  unit: Size.Megabytes,
                }
              : undefined,
          timeout:
            val.Configuration?.Timeout != null
              ? {
                  value: val.Configuration?.Timeout,
                  unit: Time.Seconds,
                }
              : undefined,
          layers: val.Configuration?.Layers?.map((layer) => ({
            arn: layer.Arn,
            size:
              layer.CodeSize != null
                ? {
                    value: layer.CodeSize,
                    unit: Size.Bytes,
                  }
                : undefined,
          })),
          environment: val.Configuration?.Environment?.Variables
            ? Object.entries(val.Configuration.Environment.Variables).map(
                ([key, value]) => ({
                  key,
                  value,
                }),
              )
            : [],
        },
      };
    },

    network(val) {
      return {
        vpc: {
          id: val.Configuration?.VpcConfig?.VpcId,
        },
        securityGroups: val.Configuration?.VpcConfig?.SecurityGroupIds,
        targetSubnets: val.Configuration?.VpcConfig?.SubnetIds,
      };
    },
  },
};
