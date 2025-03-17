import type {
  DescribeLogGroupsCommandInput,
  DescribeLogGroupsCommandOutput,
  LogGroup,
} from "@aws-sdk/client-cloudwatch-logs";
import { evaluateSelector, toLowerCase } from "@infrascan/core";
import {
  type TranslatedEntity,
  type BaseState,
  type State,
  type WithCallContext,
  type QualifiedMeasure,
  TimeUnit,
  SizeUnit,
} from "@infrascan/shared-types";

export type CloudwatchLogGroup = BaseState<DescribeLogGroupsCommandInput> & {
  logGroup: {
    dataProtectionStatus?: string;
    accessClass?: string;
    metricFilterCount?: number;
    retentionPeriod?: QualifiedMeasure<TimeUnit>;
    size?: QualifiedMeasure<SizeUnit>;
  };
};

export const CloudwatchLogGroupEntity: TranslatedEntity<
  CloudwatchLogGroup,
  State<DescribeLogGroupsCommandOutput[], DescribeLogGroupsCommandInput>,
  WithCallContext<LogGroup, DescribeLogGroupsCommandInput>
> = {
  version: "0.1.0",
  debugLabel: "cloudwatch-logs",
  provider: "aws",
  command: "DescribeLogGroups",
  category: "cloudwatch",
  subcategory: "logs",
  nodeType: "cloudwatch-logs",
  selector: "CloudWatchLogs|DescribeLogGroups|[]",

  getState(state, context) {
    return evaluateSelector(
      context.account,
      context.region,
      CloudwatchLogGroupEntity.selector,
      state,
    );
  },

  translate(val) {
    return val._result
      .flatMap(({ logGroups }) => logGroups ?? [])
      .map((group) =>
        Object.assign(group, {
          $metadata: val._metadata,
          $parameters: val._parameters,
        }),
      );
  },

  components: {
    $metadata(val) {
      return {
        version: CloudwatchLogGroupEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: val.logGroupArn!,
        label: val.logGroupName!,
        nodeType: CloudwatchLogGroupEntity.nodeType,
      };
    },

    $source(val) {
      return {
        command: CloudwatchLogGroupEntity.command,
        parameters: val.$parameters,
      };
    },

    tenant(val) {
      return {
        tenantId: val.$metadata.account,
        provider: CloudwatchLogGroupEntity.provider,
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
        id: val.logGroupArn!,
        name: val.logGroupName!,
        category: CloudwatchLogGroupEntity.category,
        subcategory: CloudwatchLogGroupEntity.subcategory,
      };
    },

    audit(val) {
      return {
        createdAt:
          val.creationTime != null ? new Date(val.creationTime) : undefined,
      };
    },

    encryption(val) {
      return {
        keyId: val.kmsKeyId,
      };
    },

    logGroup(val) {
      return {
        accessClass:
          val.logGroupClass != null
            ? toLowerCase(val.logGroupClass)
            : undefined,
        dataProtectionStatus:
          val.dataProtectionStatus != null
            ? toLowerCase(val.dataProtectionStatus)
            : undefined,
        retentionPeriod:
          val.retentionInDays != null
            ? {
                unit: TimeUnit.Day,
                value: val.retentionInDays,
              }
            : undefined,
        size:
          val.storedBytes != null
            ? {
                unit: SizeUnit.Bytes,
                value: val.storedBytes,
              }
            : undefined,
        metricFilterCount: val.metricFilterCount,
      };
    },
  },
};
