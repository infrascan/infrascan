import type {
  DescribeStateMachineCommandInput,
  DescribeStateMachineCommandOutput,
} from "@aws-sdk/client-sfn";
import { evaluateSelector } from "@infrascan/core";
import {
  type TranslatedEntity,
  type BaseState,
  type State,
  type WithCallContext,
} from "@infrascan/shared-types";

export interface StepFunction {
  type: string;
  status: string;
  definition?: string;
  tracingConfig?: {
    enabled: boolean;
  };
  loggingConfig?: {
    level?: string;
    includeExecutionData?: boolean;
  };
}

export type StepFunctionState = BaseState<DescribeStateMachineCommandInput> & {
  stepFunction: StepFunction;
};

export const StepFunctionEntity: TranslatedEntity<
  StepFunctionState,
  State<DescribeStateMachineCommandOutput, DescribeStateMachineCommandInput>,
  WithCallContext<
    DescribeStateMachineCommandOutput,
    DescribeStateMachineCommandInput
  >
> = {
  version: "0.1.0",
  debugLabel: "step-function",
  provider: "aws",
  command: "DescribeStateMachine",
  category: "stepfunctions",
  subcategory: "state-machine",
  nodeType: "step-function",
  selector: "StepFunctions|DescribeStateMachine|[]",

  getState(state, context) {
    return evaluateSelector(
      context.account,
      context.region,
      StepFunctionEntity.selector,
      state,
    );
  },

  translate(val) {
    return [
      {
        ...val._result,
        $metadata: val._metadata,
        $parameters: val._parameters,
      },
    ];
  },

  components: {
    $metadata(val) {
      return {
        version: StepFunctionEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: val.stateMachineArn!,
        label: val.name!,
        nodeType: StepFunctionEntity.nodeType,
      };
    },

    $source(val) {
      return {
        command: StepFunctionEntity.command,
        parameters: val.$parameters,
      };
    },

    tenant(val) {
      return {
        tenantId: val.$metadata.account,
        provider: StepFunctionEntity.provider,
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
        id: val.stateMachineArn!,
        name: val.name!,
        description: val.description,
        category: StepFunctionEntity.category,
        subcategory: StepFunctionEntity.subcategory,
      };
    },

    audit(val) {
      return {
        createdAt: val.creationDate,
      };
    },

    encryption(val) {
      return {
        keyId: val.encryptionConfiguration?.kmsKeyId,
      };
    },

    iam(val) {
      const roles = [];
      if (val.roleArn != null) {
        roles.push({
          label: "default",
          arn: val.roleArn,
        });
      }
      return {
        roles,
      };
    },

    stepFunction(val) {
      return {
        type: val.type!,
        status: val.status!,
        definition: val.definition,
        tracingConfig: {
          enabled: val.tracingConfiguration?.enabled ?? false,
        },
        loggingConfig: {
          level: val.loggingConfiguration?.level,
          includeExecutionData:
            val.loggingConfiguration?.includeExecutionData ?? false,
        },
      };
    },
  },
};
