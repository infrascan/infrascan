import type {
  ConfigRule,
  ConfigurationAggregator,
  ConfigurationRecorder,
  ConfigurationRecorderStatus,
  ConformancePackDetail,
  DeliveryChannel,
  AggregationAuthorization,
  DescribeAggregationAuthorizationsCommandOutput,
  DescribeConfigRulesCommandOutput,
  DescribeConfigurationAggregatorsCommandOutput,
  DescribeConfigurationRecordersCommandOutput,
  DescribeConfigurationRecorderStatusCommandOutput,
  DescribeConformancePacksCommandOutput,
  DescribeDeliveryChannelsCommandOutput,
  DescribeOrganizationConfigRulesCommandOutput,
  DescribeOrganizationConformancePacksCommandOutput,
  OrganizationConfigRule,
  OrganizationConformancePack,
} from "@aws-sdk/client-config-service";
import { evaluateSelector, tryNormalizeDateEpoch } from "@infrascan/core";
import type {
  AwsContext,
  BaseState,
  CommandCallMetadata,
  Connector,
  Serialized,
  TranslatedEntity,
} from "@infrascan/shared-types";
import type { CallState } from "./state";

/**
 * Calls whose failure is reported on the status node, in getter order.
 */
export const CONFIG_CALLS = [
  "ListConfigurationRecorders",
  "DescribeConfigurationRecorders",
  "DescribeConfigurationRecorderStatus",
  "DescribeDeliveryChannels",
  "DescribeConfigurationAggregators",
  "DescribeAggregationAuthorizations",
  "DescribeOrganizationConfigRules",
  "DescribeOrganizationConformancePacks",
  "DescribeConformancePacks",
  "DescribeConfigRules",
] as const;

async function getOwnState<O, I = unknown>(
  connector: Connector,
  context: AwsContext,
  functionName: string,
): Promise<Serialized<CallState<O, I>>[]> {
  const state = await evaluateSelector<Serialized<CallState<O, I>>>(
    context.account,
    context.region,
    `ConfigService|${functionName}|[]`,
    connector,
  );
  return state ?? [];
}

interface Item {
  $metadata: CommandCallMetadata;
}

function metadata(version: string) {
  return (val: Item) => ({ version, timestamp: val.$metadata.timestamp });
}

function source(command: string) {
  return () => ({ command });
}

function tenant(val: Item) {
  return {
    provider: "aws",
    partition: val.$metadata.partition,
    tenantId: val.$metadata.account,
  };
}

function location(val: Item) {
  return { code: val.$metadata.region };
}

/* -------------------------------------------------------------------------- */
/*                                   Status                                   */
/* -------------------------------------------------------------------------- */

export interface ServiceStatus {
  service: string;
  status: "enabled" | "disabled" | "unknown";
  /** Error name when status is unknown, or AWS's own reason when it gives one */
  statusReason?: string;
  /** The account this account's administrator relationship points at, as reported by the service */
  administratorAccountId?: string;
  /** The service's own relationship status string, verbatim */
  relationshipStatus?: string;
  /** Calls that failed for this account and region, keyed by call name, valued by error name */
  failedCalls: Record<string, string>;
}

export interface RecorderDetails {
  name?: string;
  arn?: string;
  roleArn?: string;
  /** Set for service-linked recorders */
  servicePrincipal?: string;
  recordingScope?: string;
  recordingGroup?: {
    allSupported?: boolean;
    includeGlobalResourceTypes?: boolean;
    resourceTypes?: string[];
    exclusionByResourceTypes?: string[];
    recordingStrategy?: string;
  };
  recordingMode?: {
    recordingFrequency?: string;
    overrides: {
      description?: string;
      resourceTypes?: string[];
      recordingFrequency?: string;
    }[];
  };
  recording?: boolean;
  lastStatus?: string;
  lastErrorCode?: string;
  lastStartTime?: number | null;
  lastStopTime?: number | null;
  lastStatusChangeTime?: number | null;
}

export interface DeliveryChannelDetails {
  name?: string;
  s3BucketName?: string;
  s3KeyPrefix?: string;
  s3KmsKeyArn?: string;
  snsTopicArn?: string;
  deliveryFrequency?: string;
}

export interface AggregationAuthorizationDetails {
  arn?: string;
  authorizedAccountId?: string;
  authorizedAwsRegion?: string;
  createdAt?: number | null;
}

export interface OrganizationConfigRuleDetails {
  name?: string;
  arn?: string;
  excludedAccounts: string[];
  /** `managed`, `custom-lambda` or `custom-policy`, from the metadata block AWS returned */
  ruleType?: "managed" | "custom-lambda" | "custom-policy";
  /** The AWS managed rule identifier for managed rules */
  ruleIdentifier?: string;
  /** The Lambda function for custom Lambda rules */
  lambdaFunctionArn?: string;
  description?: string;
  lastUpdatedAt?: number | null;
}

export interface OrganizationConformancePackDetails {
  name?: string;
  arn?: string;
  excludedAccounts: string[];
  deliveryS3Bucket?: string;
  deliveryS3KeyPrefix?: string;
  lastUpdatedAt?: number | null;
}

export interface ConformancePackDetails {
  name?: string;
  arn?: string;
  id?: string;
  deliveryS3Bucket?: string;
  deliveryS3KeyPrefix?: string;
  createdBy?: string;
  lastUpdateRequestedAt?: number | null;
}

export interface ConfigRuleDetails {
  name?: string;
  arn?: string;
  sourceOwner?: string;
  sourceIdentifier?: string;
  createdBy?: string;
  state?: string;
}

export interface ConfigStatusDetails {
  recorders: RecorderDetails[];
  deliveryChannels: DeliveryChannelDetails[];
  aggregatorArns: string[];
  aggregationAuthorizations: AggregationAuthorizationDetails[];
  organizationConfigRules: OrganizationConfigRuleDetails[];
  organizationConformancePacks: OrganizationConformancePackDetails[];
  conformancePacks: ConformancePackDetails[];
  configRules: ConfigRuleDetails[];
}

export type StatusState = BaseState & {
  serviceStatus: ServiceStatus;
  config: { status: ConfigStatusDetails };
};

interface StatusItem extends Item {
  serviceStatus: ServiceStatus;
  recorders: Serialized<ConfigurationRecorder>[];
  recorderStatuses: Serialized<ConfigurationRecorderStatus>[];
  deliveryChannels: Serialized<DeliveryChannel>[];
  aggregators: Serialized<ConfigurationAggregator>[];
  aggregationAuthorizations: Serialized<AggregationAuthorization>[];
  organizationConfigRules: Serialized<OrganizationConfigRule>[];
  organizationConformancePacks: Serialized<OrganizationConformancePack>[];
  conformancePacks: Serialized<ConformancePackDetail>[];
  configRules: Serialized<ConfigRule>[];
}

function collect<O, T>(
  pages: Serialized<CallState<O, unknown>>[],
  pick: (result: Serialized<O>) => T[] | undefined,
): T[] {
  return pages.flatMap((page) =>
    page._result != null ? pick(page._result) ?? [] : [],
  );
}

/**
 * Enabled when any recorder is recording; disabled when there is no recorder or none is recording; unknown when a
 * status call failed and no recorder was seen recording.
 */
function resolveStatus(
  statusPages: Serialized<
    CallState<DescribeConfigurationRecorderStatusCommandOutput, unknown>
  >[],
  failedCalls: Record<string, string>,
): ServiceStatus {
  const statuses = collect(statusPages, (r) => r.ConfigurationRecordersStatus);
  if (statuses.some(({ recording }) => recording === true)) {
    return { service: "config", status: "enabled", failedCalls };
  }
  const failed = statusPages.find((page) => page._error != null);
  if (failed?._error != null) {
    return {
      service: "config",
      status: "unknown",
      statusReason: failed._error.name,
      failedCalls,
    };
  }
  return { service: "config", status: "disabled", failedCalls };
}

export const StatusEntity: TranslatedEntity<
  StatusState,
  StatusItem,
  StatusItem
> = {
  version: "0.1.0",
  debugLabel: "config-status",
  provider: "aws",
  command: "DescribeConfigurationRecorderStatus",
  category: "config",
  subcategory: "status",
  nodeType: "config-status",
  selector: "ConfigService|DescribeConfigurationRecorderStatus|[]",

  async getState(connector, context) {
    const statusPages =
      await getOwnState<DescribeConfigurationRecorderStatusCommandOutput>(
        connector,
        context,
        "DescribeConfigurationRecorderStatus",
      );
    if (statusPages.length === 0) {
      return [];
    }
    const failedCalls: Record<string, string> = {};
    for (const functionName of CONFIG_CALLS) {
      const failed = (await getOwnState(connector, context, functionName)).find(
        (entry) => entry._error != null,
      );
      if (failed?._error != null) {
        failedCalls[functionName] = failed._error.name;
      }
    }
    const own = <O>(functionName: string) =>
      getOwnState<O>(connector, context, functionName);
    return [
      {
        $metadata: statusPages[0]._metadata,
        serviceStatus: resolveStatus(statusPages, failedCalls),
        recorders: collect(
          await own<DescribeConfigurationRecordersCommandOutput>(
            "DescribeConfigurationRecorders",
          ),
          (r) => r.ConfigurationRecorders,
        ),
        recorderStatuses: collect(
          statusPages,
          (r) => r.ConfigurationRecordersStatus,
        ),
        deliveryChannels: collect(
          await own<DescribeDeliveryChannelsCommandOutput>(
            "DescribeDeliveryChannels",
          ),
          (r) => r.DeliveryChannels,
        ),
        aggregators: collect(
          await own<DescribeConfigurationAggregatorsCommandOutput>(
            "DescribeConfigurationAggregators",
          ),
          (r) => r.ConfigurationAggregators,
        ),
        aggregationAuthorizations: collect(
          await own<DescribeAggregationAuthorizationsCommandOutput>(
            "DescribeAggregationAuthorizations",
          ),
          (r) => r.AggregationAuthorizations,
        ),
        organizationConfigRules: collect(
          await own<DescribeOrganizationConfigRulesCommandOutput>(
            "DescribeOrganizationConfigRules",
          ),
          (r) => r.OrganizationConfigRules,
        ),
        organizationConformancePacks: collect(
          await own<DescribeOrganizationConformancePacksCommandOutput>(
            "DescribeOrganizationConformancePacks",
          ),
          (r) => r.OrganizationConformancePacks,
        ),
        conformancePacks: collect(
          await own<DescribeConformancePacksCommandOutput>(
            "DescribeConformancePacks",
          ),
          (r) => r.ConformancePackDetails,
        ),
        configRules: collect(
          await own<DescribeConfigRulesCommandOutput>("DescribeConfigRules"),
          (r) => r.ConfigRules,
        ),
      },
    ];
  },

  translate(val) {
    return [val];
  },

  components: {
    $metadata: metadata("0.1.0"),
    $source: source("DescribeConfigurationRecorderStatus"),
    $graph(val) {
      return {
        id: `${val.$metadata.account}-${val.$metadata.region}-config`,
        label: `Config (${val.$metadata.region})`,
        nodeClass: "informational",
        nodeType: StatusEntity.nodeType,
        parent: val.$metadata.account,
      };
    },
    tenant,
    location,
    resource(val) {
      return {
        id: `${val.$metadata.account}-${val.$metadata.region}-config`,
        name: `Config (${val.$metadata.region})`,
        category: StatusEntity.category,
        subcategory: StatusEntity.subcategory,
      };
    },
    serviceStatus(val) {
      return val.serviceStatus;
    },
    config(val) {
      const statusByRecorder = new Map(
        val.recorderStatuses.map((status) => [
          status.arn ?? status.name,
          status,
        ]),
      );
      const seenRecorders = new Set<string>();
      const recorders = val.recorders
        .filter((recorder) => {
          const key = recorder.arn ?? recorder.name ?? "";
          if (seenRecorders.has(key)) {
            return false;
          }
          seenRecorders.add(key);
          return true;
        })
        .map((recorder): RecorderDetails => {
          const status =
            statusByRecorder.get(recorder.arn) ??
            val.recorderStatuses.find(({ name }) => name === recorder.name);
          return {
            name: recorder.name,
            arn: recorder.arn,
            roleArn: recorder.roleARN,
            servicePrincipal: recorder.servicePrincipal,
            recordingScope: recorder.recordingScope,
            recordingGroup:
              recorder.recordingGroup != null
                ? {
                    allSupported: recorder.recordingGroup.allSupported,
                    includeGlobalResourceTypes:
                      recorder.recordingGroup.includeGlobalResourceTypes,
                    resourceTypes: recorder.recordingGroup.resourceTypes,
                    exclusionByResourceTypes:
                      recorder.recordingGroup.exclusionByResourceTypes
                        ?.resourceTypes,
                    recordingStrategy:
                      recorder.recordingGroup.recordingStrategy?.useOnly,
                  }
                : undefined,
            recordingMode:
              recorder.recordingMode != null
                ? {
                    recordingFrequency:
                      recorder.recordingMode.recordingFrequency,
                    overrides: (
                      recorder.recordingMode.recordingModeOverrides ?? []
                    ).map((override) => ({
                      description: override.description,
                      resourceTypes: override.resourceTypes,
                      recordingFrequency: override.recordingFrequency,
                    })),
                  }
                : undefined,
            recording: status?.recording,
            lastStatus: status?.lastStatus,
            lastErrorCode: status?.lastErrorCode,
            lastStartTime: tryNormalizeDateEpoch(status?.lastStartTime),
            lastStopTime: tryNormalizeDateEpoch(status?.lastStopTime),
            lastStatusChangeTime: tryNormalizeDateEpoch(
              status?.lastStatusChangeTime,
            ),
          };
        });
      return {
        status: {
          recorders,
          deliveryChannels: val.deliveryChannels.map((channel) => ({
            name: channel.name,
            s3BucketName: channel.s3BucketName,
            s3KeyPrefix: channel.s3KeyPrefix,
            s3KmsKeyArn: channel.s3KmsKeyArn,
            snsTopicArn: channel.snsTopicARN,
            deliveryFrequency:
              channel.configSnapshotDeliveryProperties?.deliveryFrequency,
          })),
          aggregatorArns: val.aggregators
            .map(({ ConfigurationAggregatorArn }) => ConfigurationAggregatorArn)
            .filter((arn): arn is string => arn != null),
          aggregationAuthorizations: val.aggregationAuthorizations.map(
            (authorization) => ({
              arn: authorization.AggregationAuthorizationArn,
              authorizedAccountId: authorization.AuthorizedAccountId,
              authorizedAwsRegion: authorization.AuthorizedAwsRegion,
              createdAt: tryNormalizeDateEpoch(authorization.CreationTime),
            }),
          ),
          organizationConfigRules: val.organizationConfigRules.map(
            (rule): OrganizationConfigRuleDetails => {
              const managed = rule.OrganizationManagedRuleMetadata;
              const lambda = rule.OrganizationCustomRuleMetadata;
              const policy = rule.OrganizationCustomPolicyRuleMetadata;
              let ruleType: OrganizationConfigRuleDetails["ruleType"];
              if (managed != null) {
                ruleType = "managed";
              } else if (lambda != null) {
                ruleType = "custom-lambda";
              } else if (policy != null) {
                ruleType = "custom-policy";
              }
              return {
                name: rule.OrganizationConfigRuleName,
                arn: rule.OrganizationConfigRuleArn,
                excludedAccounts: rule.ExcludedAccounts ?? [],
                ruleType,
                ruleIdentifier: managed?.RuleIdentifier,
                lambdaFunctionArn: lambda?.LambdaFunctionArn,
                description:
                  managed?.Description ??
                  lambda?.Description ??
                  policy?.Description,
                lastUpdatedAt: tryNormalizeDateEpoch(rule.LastUpdateTime),
              };
            },
          ),
          organizationConformancePacks: val.organizationConformancePacks.map(
            (pack) => ({
              name: pack.OrganizationConformancePackName,
              arn: pack.OrganizationConformancePackArn,
              excludedAccounts: pack.ExcludedAccounts ?? [],
              deliveryS3Bucket: pack.DeliveryS3Bucket,
              deliveryS3KeyPrefix: pack.DeliveryS3KeyPrefix,
              lastUpdatedAt: tryNormalizeDateEpoch(pack.LastUpdateTime),
            }),
          ),
          conformancePacks: val.conformancePacks.map((pack) => ({
            name: pack.ConformancePackName,
            arn: pack.ConformancePackArn,
            id: pack.ConformancePackId,
            deliveryS3Bucket: pack.DeliveryS3Bucket,
            deliveryS3KeyPrefix: pack.DeliveryS3KeyPrefix,
            createdBy: pack.CreatedBy,
            lastUpdateRequestedAt: tryNormalizeDateEpoch(
              pack.LastUpdateRequestedTime,
            ),
          })),
          configRules: val.configRules.map((rule) => ({
            name: rule.ConfigRuleName,
            arn: rule.ConfigRuleArn,
            sourceOwner: rule.Source?.Owner,
            sourceIdentifier: rule.Source?.SourceIdentifier,
            createdBy: rule.CreatedBy,
            state: rule.ConfigRuleState,
          })),
        },
      };
    },
  },
};

/* -------------------------------------------------------------------------- */
/*                                 Aggregators                                */
/* -------------------------------------------------------------------------- */

export interface AggregatorDetails {
  name?: string;
  arn?: string;
  accountSources: {
    accountIds: string[];
    allAwsRegions?: boolean;
    awsRegions?: string[];
  }[];
  organizationSource?: {
    roleArn?: string;
    allAwsRegions?: boolean;
    awsRegions?: string[];
  };
  filters?: {
    resourceType?: { type?: string; value?: string[] };
    servicePrincipal?: { type?: string; value?: string[] };
  };
  /** The service principal that created the aggregator, when a service did */
  createdBy?: string;
  createdAt?: number | null;
  lastUpdatedAt?: number | null;
}

export type AggregatorState = BaseState & {
  config: { aggregator: AggregatorDetails };
};

interface AggregatorItem extends Item {
  aggregator: Serialized<ConfigurationAggregator>;
}

export const AggregatorEntity: TranslatedEntity<
  AggregatorState,
  AggregatorItem,
  AggregatorItem
> = {
  version: "0.1.0",
  debugLabel: "config-aggregator",
  provider: "aws",
  command: "DescribeConfigurationAggregators",
  category: "config",
  subcategory: "aggregator",
  nodeType: "config-aggregator",
  selector: "ConfigService|DescribeConfigurationAggregators|[]",

  async getState(connector, context) {
    const pages =
      await getOwnState<DescribeConfigurationAggregatorsCommandOutput>(
        connector,
        context,
        "DescribeConfigurationAggregators",
      );
    const seen = new Set<string>();
    return pages.flatMap((page) =>
      (page._result?.ConfigurationAggregators ?? [])
        .filter(({ ConfigurationAggregatorArn: arn }) => {
          if (arn == null || seen.has(arn)) {
            return false;
          }
          seen.add(arn);
          return true;
        })
        .map((aggregator) => ({ $metadata: page._metadata, aggregator })),
    );
  },

  translate(val) {
    return [val];
  },

  components: {
    $metadata: metadata("0.1.0"),
    $source: source("DescribeConfigurationAggregators"),
    $graph(val) {
      return {
        id: val.aggregator.ConfigurationAggregatorArn!,
        label:
          val.aggregator.ConfigurationAggregatorName ??
          val.aggregator.ConfigurationAggregatorArn!,
        nodeClass: "informational",
        nodeType: AggregatorEntity.nodeType,
        parent: val.$metadata.account,
      };
    },
    tenant,
    location,
    resource(val) {
      return {
        id: val.aggregator.ConfigurationAggregatorArn!,
        name:
          val.aggregator.ConfigurationAggregatorName ??
          val.aggregator.ConfigurationAggregatorArn!,
        category: AggregatorEntity.category,
        subcategory: AggregatorEntity.subcategory,
      };
    },
    audit(val) {
      return {
        createdAt: tryNormalizeDateEpoch(val.aggregator.CreationTime),
        createdBy: val.aggregator.CreatedBy,
      };
    },
    config(val) {
      const { aggregator } = val;
      const organization = aggregator.OrganizationAggregationSource;
      const filters = aggregator.AggregatorFilters;
      return {
        aggregator: {
          name: aggregator.ConfigurationAggregatorName,
          arn: aggregator.ConfigurationAggregatorArn,
          accountSources: (aggregator.AccountAggregationSources ?? []).map(
            (accountSource) => ({
              accountIds: accountSource.AccountIds ?? [],
              allAwsRegions: accountSource.AllAwsRegions,
              awsRegions: accountSource.AwsRegions,
            }),
          ),
          organizationSource:
            organization != null
              ? {
                  roleArn: organization.RoleArn,
                  allAwsRegions: organization.AllAwsRegions,
                  awsRegions: organization.AwsRegions,
                }
              : undefined,
          filters:
            filters != null
              ? {
                  resourceType:
                    filters.ResourceType != null
                      ? {
                          type: filters.ResourceType.Type,
                          value: filters.ResourceType.Value,
                        }
                      : undefined,
                  servicePrincipal:
                    filters.ServicePrincipal != null
                      ? {
                          type: filters.ServicePrincipal.Type,
                          value: filters.ServicePrincipal.Value,
                        }
                      : undefined,
                }
              : undefined,
          createdBy: aggregator.CreatedBy,
          createdAt: tryNormalizeDateEpoch(aggregator.CreationTime),
          lastUpdatedAt: tryNormalizeDateEpoch(aggregator.LastUpdatedTime),
        },
      };
    },
  },
};

export type GraphState = StatusState | AggregatorState;
