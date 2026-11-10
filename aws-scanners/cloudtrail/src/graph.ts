import type {
  AdvancedEventSelector,
  DescribeTrailsCommandOutput,
  EventSelector,
  GetEventDataStoreCommandInput,
  GetEventDataStoreCommandOutput,
  GetEventSelectorsCommandInput,
  GetEventSelectorsCommandOutput,
  GetTrailStatusCommandInput,
  GetTrailStatusCommandOutput,
  ListEventDataStoresCommandOutput,
  Trail,
} from "@aws-sdk/client-cloudtrail";
import { evaluateSelector, tryNormalizeDateEpoch } from "@infrascan/core";
import type {
  AwsContext,
  BaseState,
  CommandCallMetadata,
  Connector,
  Serialized,
  TranslatedEntity,
} from "@infrascan/shared-types";
import { parseArn } from "./arn";
import { isOwnHomeTrail } from "./getters";
import type { CallState } from "./state";

/**
 * Calls whose failure is reported on the status node, in getter order.
 */
export const CLOUDTRAIL_CALLS = [
  "DescribeTrails",
  "GetTrailStatus",
  "GetEventSelectors",
  "ListEventDataStores",
  "GetEventDataStore",
] as const;

async function getOwnState<O, I = unknown>(
  connector: Connector,
  context: AwsContext,
  functionName: string,
): Promise<Serialized<CallState<O, I>>[]> {
  const state = await evaluateSelector<Serialized<CallState<O, I>>>(
    context.account,
    context.region,
    `CloudTrail|${functionName}|[]`,
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

function visibleTrails(
  pages: Serialized<CallState<DescribeTrailsCommandOutput, unknown>>[],
): Serialized<Trail>[] {
  const seen = new Set<string>();
  return pages
    .flatMap((page) => page._result?.trailList ?? [])
    .filter(({ TrailARN }) => {
      if (TrailARN == null || seen.has(TrailARN)) {
        return false;
      }
      seen.add(TrailARN);
      return true;
    });
}

/**
 * Every event data store listed here, with the settings `GetEventDataStore` returned for it.
 */
async function getVisibleEventDataStores(
  connector: Connector,
  context: AwsContext,
): Promise<VisibleEventDataStore[]> {
  const details = new Map<string, Serialized<GetEventDataStoreCommandOutput>>();
  for (const page of await getOwnState<
    GetEventDataStoreCommandOutput,
    GetEventDataStoreCommandInput
  >(connector, context, "GetEventDataStore")) {
    const arn = page._parameters?.EventDataStore;
    if (arn != null && page._result != null) {
      details.set(arn, page._result);
    }
  }
  const listed = await getOwnState<ListEventDataStoresCommandOutput>(
    connector,
    context,
    "ListEventDataStores",
  );
  const seen = new Set<string>();
  return listed
    .flatMap((page) => page._result?.EventDataStores ?? [])
    .filter(({ EventDataStoreArn: arn }) => {
      if (arn == null || seen.has(arn)) {
        return false;
      }
      seen.add(arn);
      return true;
    })
    .map(({ EventDataStoreArn: arn, Name }) => {
      const store = details.get(arn!);
      return {
        arn: arn!,
        name: store?.Name ?? Name,
        owningAccountId: parseArn(arn).account,
        organizationEnabled: store?.OrganizationEnabled,
        multiRegionEnabled: store?.MultiRegionEnabled,
        status: store?.Status,
      };
    });
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

export interface VisibleTrail {
  arn: string;
  name?: string;
  /** The account in the trail ARN */
  owningAccountId?: string;
  homeRegion?: string;
  isOrganizationTrail?: boolean;
  isMultiRegionTrail?: boolean;
}

export interface VisibleEventDataStore {
  arn: string;
  name?: string;
  /** The account in the event data store ARN */
  owningAccountId?: string;
  organizationEnabled?: boolean;
  multiRegionEnabled?: boolean;
  status?: string;
}

export interface CloudTrailStatusDetails {
  /** Every trail `DescribeTrails` returned here, including shadow copies of trails homed elsewhere */
  trails: VisibleTrail[];
  eventDataStores: VisibleEventDataStore[];
}

export type StatusState = BaseState & {
  serviceStatus: ServiceStatus;
  cloudtrail: { status: CloudTrailStatusDetails };
};

interface StatusItem extends Item {
  serviceStatus: ServiceStatus;
  trails: Serialized<Trail>[];
  eventDataStores: VisibleEventDataStore[];
}

export const StatusEntity: TranslatedEntity<
  StatusState,
  StatusItem,
  StatusItem
> = {
  version: "0.1.0",
  debugLabel: "cloudtrail-status",
  provider: "aws",
  command: "DescribeTrails",
  category: "cloudtrail",
  subcategory: "status",
  nodeType: "cloudtrail-status",
  selector: "CloudTrail|DescribeTrails|[]",

  async getState(connector, context) {
    const trailPages = await getOwnState<DescribeTrailsCommandOutput>(
      connector,
      context,
      "DescribeTrails",
    );
    if (trailPages.length === 0) {
      return [];
    }
    const failedCalls: Record<string, string> = {};
    for (const functionName of CLOUDTRAIL_CALLS) {
      const failed = (await getOwnState(connector, context, functionName)).find(
        (entry) => entry._error != null,
      );
      if (failed?._error != null) {
        failedCalls[functionName] = failed._error.name;
      }
    }
    const trails = visibleTrails(trailPages);
    const failed = trailPages.find((page) => page._error != null);
    let serviceStatus: ServiceStatus;
    if (failed?._error != null) {
      serviceStatus = {
        service: "cloudtrail",
        status: "unknown",
        statusReason: failed._error.name,
        failedCalls,
      };
    } else {
      serviceStatus = {
        service: "cloudtrail",
        status: trails.length > 0 ? "enabled" : "disabled",
        failedCalls,
      };
    }
    return [
      {
        $metadata: trailPages[0]._metadata,
        serviceStatus,
        trails,
        eventDataStores: await getVisibleEventDataStores(connector, context),
      },
    ];
  },

  translate(val) {
    return [val];
  },

  components: {
    $metadata: metadata("0.1.0"),
    $source: source("DescribeTrails"),
    $graph(val) {
      return {
        id: `${val.$metadata.account}-${val.$metadata.region}-cloudtrail`,
        label: `CloudTrail (${val.$metadata.region})`,
        nodeClass: "informational",
        nodeType: StatusEntity.nodeType,
        parent: val.$metadata.account,
      };
    },
    tenant,
    location,
    resource(val) {
      return {
        id: `${val.$metadata.account}-${val.$metadata.region}-cloudtrail`,
        name: `CloudTrail (${val.$metadata.region})`,
        category: StatusEntity.category,
        subcategory: StatusEntity.subcategory,
      };
    },
    serviceStatus(val) {
      return val.serviceStatus;
    },
    cloudtrail(val) {
      return {
        status: {
          trails: val.trails.map((trail) => ({
            arn: trail.TrailARN!,
            name: trail.Name,
            owningAccountId: parseArn(trail.TrailARN).account,
            homeRegion: trail.HomeRegion,
            isOrganizationTrail: trail.IsOrganizationTrail,
            isMultiRegionTrail: trail.IsMultiRegionTrail,
          })),
          eventDataStores: val.eventDataStores,
        },
      };
    },
  },
};

/* -------------------------------------------------------------------------- */
/*                                   Trails                                   */
/* -------------------------------------------------------------------------- */

export interface EventSelectorSummary {
  /** Basic event selectors, as returned */
  eventSelectors: {
    readWriteType?: string;
    includeManagementEvents?: boolean;
    excludeManagementEventSources?: string[];
    dataResources: { type?: string; values?: string[] }[];
  }[];
  /** Advanced event selectors, as returned */
  advancedEventSelectors: {
    name?: string;
    fieldSelectors: {
      field?: string;
      equals?: string[];
      startsWith?: string[];
      endsWith?: string[];
      notEquals?: string[];
      notStartsWith?: string[];
      notEndsWith?: string[];
    }[];
  }[];
}

export interface TrailDetails {
  name?: string;
  arn?: string;
  homeRegion?: string;
  isOrganizationTrail?: boolean;
  isMultiRegionTrail?: boolean;
  includeGlobalServiceEvents?: boolean;
  s3BucketName?: string;
  s3KeyPrefix?: string;
  snsTopicArn?: string;
  kmsKeyId?: string;
  cloudWatchLogsLogGroupArn?: string;
  cloudWatchLogsRoleArn?: string;
  logFileValidationEnabled?: boolean;
  hasCustomEventSelectors?: boolean;
  hasInsightSelectors?: boolean;
  /** From `GetTrailStatus`; undefined when the call failed */
  isLogging?: boolean;
  /** AWS's latest S3 delivery error, verbatim */
  latestDeliveryError?: string;
  latestCloudWatchLogsDeliveryError?: string;
  latestDigestDeliveryError?: string;
  latestDeliveryTime?: number | null;
  startLoggingTime?: number | null;
  stopLoggingTime?: number | null;
  /** From `GetEventSelectors`; undefined when the call failed */
  selectors?: EventSelectorSummary;
}

export type TrailState = BaseState & { cloudtrail: { trail: TrailDetails } };

interface TrailItem extends Item {
  trail: Serialized<Trail>;
  trailStatus?: Serialized<GetTrailStatusCommandOutput>;
  selectors?: Serialized<GetEventSelectorsCommandOutput>;
}

function summarizeAdvancedSelectors(
  selectors: Serialized<AdvancedEventSelector>[],
): EventSelectorSummary["advancedEventSelectors"] {
  return selectors.map((selector) => ({
    name: selector.Name,
    fieldSelectors: (selector.FieldSelectors ?? []).map((field) => ({
      field: field.Field,
      equals: field.Equals,
      startsWith: field.StartsWith,
      endsWith: field.EndsWith,
      notEquals: field.NotEquals,
      notStartsWith: field.NotStartsWith,
      notEndsWith: field.NotEndsWith,
    })),
  }));
}

function summarizeSelectors(
  eventSelectors: Serialized<EventSelector>[],
  advancedEventSelectors: Serialized<AdvancedEventSelector>[],
): EventSelectorSummary {
  return {
    eventSelectors: eventSelectors.map((selector) => ({
      readWriteType: selector.ReadWriteType,
      includeManagementEvents: selector.IncludeManagementEvents,
      excludeManagementEventSources: selector.ExcludeManagementEventSources,
      dataResources: (selector.DataResources ?? []).map(({ Type, Values }) => ({
        type: Type,
        values: Values,
      })),
    })),
    advancedEventSelectors: summarizeAdvancedSelectors(advancedEventSelectors),
  };
}

export const TrailEntity: TranslatedEntity<TrailState, TrailItem, TrailItem> = {
  version: "0.1.0",
  debugLabel: "cloudtrail-trail",
  provider: "aws",
  command: "DescribeTrails",
  category: "cloudtrail",
  subcategory: "trail",
  nodeType: "cloudtrail-trail",
  selector: "CloudTrail|DescribeTrails|[]",

  async getState(connector, context) {
    const trailPages = await getOwnState<DescribeTrailsCommandOutput>(
      connector,
      context,
      "DescribeTrails",
    );
    const statuses = new Map<string, Serialized<GetTrailStatusCommandOutput>>();
    for (const page of await getOwnState<
      GetTrailStatusCommandOutput,
      GetTrailStatusCommandInput
    >(connector, context, "GetTrailStatus")) {
      if (page._parameters?.Name != null && page._result != null) {
        statuses.set(page._parameters.Name, page._result);
      }
    }
    const selectors = new Map<
      string,
      Serialized<GetEventSelectorsCommandOutput>
    >();
    for (const page of await getOwnState<
      GetEventSelectorsCommandOutput,
      GetEventSelectorsCommandInput
    >(connector, context, "GetEventSelectors")) {
      if (page._parameters?.TrailName != null && page._result != null) {
        selectors.set(page._parameters.TrailName, page._result);
      }
    }
    // Shadow copies of trails homed in another region or owned by another account are listed on the status node only.
    return visibleTrails(trailPages)
      .filter((trail) => isOwnHomeTrail(trail, context))
      .map((trail) => ({
        $metadata: trailPages[0]._metadata,
        trail,
        trailStatus: statuses.get(trail.TrailARN!),
        selectors: selectors.get(trail.TrailARN!),
      }));
  },

  translate(val) {
    return [val];
  },

  components: {
    $metadata: metadata("0.1.0"),
    $source: source("DescribeTrails"),
    $graph(val) {
      return {
        id: val.trail.TrailARN!,
        label: val.trail.Name ?? val.trail.TrailARN!,
        nodeClass: "informational",
        nodeType: TrailEntity.nodeType,
        parent: val.$metadata.account,
      };
    },
    tenant,
    location,
    resource(val) {
      return {
        id: val.trail.TrailARN!,
        name: val.trail.Name ?? val.trail.TrailARN!,
        category: TrailEntity.category,
        subcategory: TrailEntity.subcategory,
      };
    },
    encryption(val) {
      return { keyId: val.trail.KmsKeyId };
    },
    cloudtrail(val) {
      const { trail, trailStatus, selectors } = val;
      return {
        trail: {
          name: trail.Name,
          arn: trail.TrailARN,
          homeRegion: trail.HomeRegion,
          isOrganizationTrail: trail.IsOrganizationTrail,
          isMultiRegionTrail: trail.IsMultiRegionTrail,
          includeGlobalServiceEvents: trail.IncludeGlobalServiceEvents,
          s3BucketName: trail.S3BucketName,
          s3KeyPrefix: trail.S3KeyPrefix,
          snsTopicArn: trail.SnsTopicARN,
          kmsKeyId: trail.KmsKeyId,
          cloudWatchLogsLogGroupArn: trail.CloudWatchLogsLogGroupArn,
          cloudWatchLogsRoleArn: trail.CloudWatchLogsRoleArn,
          logFileValidationEnabled: trail.LogFileValidationEnabled,
          hasCustomEventSelectors: trail.HasCustomEventSelectors,
          hasInsightSelectors: trail.HasInsightSelectors,
          isLogging: trailStatus?.IsLogging,
          latestDeliveryError: trailStatus?.LatestDeliveryError,
          latestCloudWatchLogsDeliveryError:
            trailStatus?.LatestCloudWatchLogsDeliveryError,
          latestDigestDeliveryError: trailStatus?.LatestDigestDeliveryError,
          latestDeliveryTime:
            trailStatus != null
              ? tryNormalizeDateEpoch(trailStatus.LatestDeliveryTime)
              : undefined,
          startLoggingTime:
            trailStatus != null
              ? tryNormalizeDateEpoch(trailStatus.StartLoggingTime)
              : undefined,
          stopLoggingTime:
            trailStatus != null
              ? tryNormalizeDateEpoch(trailStatus.StopLoggingTime)
              : undefined,
          selectors:
            selectors != null
              ? summarizeSelectors(
                  selectors.EventSelectors ?? [],
                  selectors.AdvancedEventSelectors ?? [],
                )
              : undefined,
        },
      };
    },
  },
};

/* -------------------------------------------------------------------------- */
/*                              Event data stores                             */
/* -------------------------------------------------------------------------- */

export interface EventDataStoreDetails {
  name?: string;
  arn?: string;
  status?: string;
  organizationEnabled?: boolean;
  multiRegionEnabled?: boolean;
  retentionPeriodDays?: number;
  terminationProtectionEnabled?: boolean;
  kmsKeyId?: string;
  billingMode?: string;
  federationStatus?: string;
  advancedEventSelectors: EventSelectorSummary["advancedEventSelectors"];
  createdAt?: number | null;
  updatedAt?: number | null;
}

export type EventDataStoreState = BaseState & {
  cloudtrail: { eventDataStore: EventDataStoreDetails };
};

interface EventDataStoreItem extends Item {
  store: Serialized<GetEventDataStoreCommandOutput>;
}

export const EventDataStoreEntity: TranslatedEntity<
  EventDataStoreState,
  EventDataStoreItem,
  EventDataStoreItem
> = {
  version: "0.1.0",
  debugLabel: "cloudtrail-event-data-store",
  provider: "aws",
  command: "GetEventDataStore",
  category: "cloudtrail",
  subcategory: "event-data-store",
  nodeType: "cloudtrail-event-data-store",
  selector: "CloudTrail|GetEventDataStore|[]",

  async getState(connector, context) {
    const pages = await getOwnState<GetEventDataStoreCommandOutput>(
      connector,
      context,
      "GetEventDataStore",
    );
    const seen = new Set<string>();
    return pages
      .filter((page) => {
        const arn = page._result?.EventDataStoreArn;
        if (arn == null || seen.has(arn)) {
          return false;
        }
        seen.add(arn);
        // Only the owning account in the store's region emits the node.
        const parsed = parseArn(arn);
        return (
          parsed.account === context.account && parsed.region === context.region
        );
      })
      .map((page) => ({ $metadata: page._metadata, store: page._result! }));
  },

  translate(val) {
    return [val];
  },

  components: {
    $metadata: metadata("0.1.0"),
    $source: source("GetEventDataStore"),
    $graph(val) {
      return {
        id: val.store.EventDataStoreArn!,
        label: val.store.Name ?? val.store.EventDataStoreArn!,
        nodeClass: "informational",
        nodeType: EventDataStoreEntity.nodeType,
        parent: val.$metadata.account,
      };
    },
    tenant,
    location,
    resource(val) {
      return {
        id: val.store.EventDataStoreArn!,
        name: val.store.Name ?? val.store.EventDataStoreArn!,
        category: EventDataStoreEntity.category,
        subcategory: EventDataStoreEntity.subcategory,
      };
    },
    encryption(val) {
      return { keyId: val.store.KmsKeyId };
    },
    audit(val) {
      return { createdAt: tryNormalizeDateEpoch(val.store.CreatedTimestamp) };
    },
    cloudtrail(val) {
      const { store } = val;
      return {
        eventDataStore: {
          name: store.Name,
          arn: store.EventDataStoreArn,
          status: store.Status,
          organizationEnabled: store.OrganizationEnabled,
          multiRegionEnabled: store.MultiRegionEnabled,
          retentionPeriodDays: store.RetentionPeriod,
          terminationProtectionEnabled: store.TerminationProtectionEnabled,
          kmsKeyId: store.KmsKeyId,
          billingMode: store.BillingMode,
          federationStatus: store.FederationStatus,
          advancedEventSelectors: summarizeAdvancedSelectors(
            store.AdvancedEventSelectors ?? [],
          ),
          createdAt: tryNormalizeDateEpoch(store.CreatedTimestamp),
          updatedAt: tryNormalizeDateEpoch(store.UpdatedTimestamp),
        },
      };
    },
  },
};

export type GraphState = StatusState | TrailState | EventDataStoreState;
