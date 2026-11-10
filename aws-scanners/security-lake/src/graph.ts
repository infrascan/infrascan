import type {
  DataLakeResource,
  GetDataLakeOrganizationConfigurationCommandOutput,
  ListDataLakesCommandOutput,
  ListLogSourcesCommandOutput,
  ListSubscribersCommandOutput,
  LogSourceResource,
  SubscriberResource,
} from "@aws-sdk/client-securitylake";
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
 * Header shared by the status node of every organisation governance scanner.
 */
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

/**
 * Calls whose failure is reported in `serviceStatus.failedCalls`.
 */
export const SECURITY_LAKE_CALLS = [
  "ListDataLakes",
  "ListLogSources",
  "GetDataLakeOrganizationConfiguration",
  "ListSubscribers",
] as const;

async function getOwnState<O, I = unknown>(
  connector: Connector,
  context: AwsContext,
  functionName: string,
): Promise<Serialized<CallState<O, I>>[]> {
  const state = await evaluateSelector<Serialized<CallState<O, I>>>(
    context.account,
    context.region,
    `SecurityLake|${functionName}|[]`,
    connector,
  );
  return state ?? [];
}

/**
 * Results of a call, or `undefined` when the call was not made or any page of it failed, so that "could not read" is
 * not reported as "none".
 */
function results<O>(pages: Serialized<CallState<O, unknown>>[]) {
  if (pages.length === 0 || pages.some((page) => page._error != null)) {
    return undefined;
  }
  return pages.flatMap((page) => (page._result != null ? [page._result] : []));
}

export interface SecurityLakeSource {
  /** `aws` for a native AWS source, `custom` for a custom source */
  type: "aws" | "custom";
  name?: string;
  version?: string;
}

export interface SecurityLakeDataLake {
  arn: string;
  region: string;
  s3BucketArn?: string;
  /** The KMS key id, or `S3_MANAGED_KEY`, as reported by AWS */
  kmsKeyId?: string;
  lifecycle?: {
    expirationDays?: number;
    transitions: { storageClass?: string; days?: number }[];
  };
  replication?: { regions: string[]; roleArn?: string };
  createStatus?: string;
  updateStatus?: string;
}

export interface SecurityLakeSubscriber {
  id: string;
  arn: string;
  name: string;
  description?: string;
  /** The principal (usually an account id) the subscriber identity names. The external id is not recorded. */
  principal?: string;
  accessTypes: string[];
  sources: SecurityLakeSource[];
  status?: string;
  createdAt?: number | null;
  updatedAt?: number | null;
}

export interface SecurityLakeDetails {
  /** The data lake in the scanned region, if one exists */
  dataLake?: SecurityLakeDataLake;
  /** Log sources collected in the scanned region, per contributing account. Absent when not read. */
  logSources?: {
    account?: string;
    region?: string;
    sources: SecurityLakeSource[];
  }[];
  /**
   * Sources enabled automatically for accounts that join the organization, in the scanned region. Only readable by
   * the Security Lake delegated administrator; absent when not read.
   */
  organizationAutoEnableSources?: SecurityLakeSource[];
  /** Subscribers to the data lake. Absent when not read. */
  subscribers?: SecurityLakeSubscriber[];
}

export type SecurityLakeStatusState = BaseState & {
  serviceStatus: ServiceStatus;
  securitylake: SecurityLakeDetails;
};

interface StatusItem {
  $metadata: CommandCallMetadata;
  serviceStatus: ServiceStatus;
  securitylake: SecurityLakeDetails;
}

function toSource(
  resource: Serialized<LogSourceResource>,
): SecurityLakeSource[] {
  if (resource.awsLogSource != null) {
    return [
      {
        type: "aws",
        name: resource.awsLogSource.sourceName,
        version: resource.awsLogSource.sourceVersion,
      },
    ];
  }
  if (resource.customLogSource != null) {
    return [
      {
        type: "custom",
        name: resource.customLogSource.sourceName,
        version: resource.customLogSource.sourceVersion,
      },
    ];
  }
  return [];
}

function toDataLake(lake: Serialized<DataLakeResource>): SecurityLakeDataLake {
  return {
    arn: lake.dataLakeArn!,
    region: lake.region!,
    s3BucketArn: lake.s3BucketArn,
    kmsKeyId: lake.encryptionConfiguration?.kmsKeyId,
    lifecycle:
      lake.lifecycleConfiguration != null
        ? {
            expirationDays: lake.lifecycleConfiguration.expiration?.days,
            transitions: (lake.lifecycleConfiguration.transitions ?? []).map(
              ({ storageClass, days }) => ({ storageClass, days }),
            ),
          }
        : undefined,
    replication:
      lake.replicationConfiguration != null
        ? {
            regions: lake.replicationConfiguration.regions ?? [],
            roleArn: lake.replicationConfiguration.roleArn,
          }
        : undefined,
    createStatus: lake.createStatus,
    updateStatus: lake.updateStatus?.status,
  };
}

function toSubscriber(
  subscriber: Serialized<SubscriberResource>,
): SecurityLakeSubscriber {
  return {
    id: subscriber.subscriberId!,
    arn: subscriber.subscriberArn!,
    name: subscriber.subscriberName!,
    description: subscriber.subscriberDescription,
    principal: subscriber.subscriberIdentity?.principal,
    accessTypes: [...(subscriber.accessTypes ?? [])],
    sources: (subscriber.sources ?? []).flatMap(toSource),
    status: subscriber.subscriberStatus,
    createdAt: tryNormalizeDateEpoch(subscriber.createdAt),
    updatedAt: tryNormalizeDateEpoch(subscriber.updatedAt),
  };
}

/**
 * Status mapping for Security Lake, decided by `ListDataLakes` for the scanned region:
 * - `enabled`: a data lake exists in the region, whatever its `createStatus`.
 * - `disabled`: the call succeeded and returned no data lake for the region.
 * - `unknown`: the call failed. `statusReason` is the error name. No exception is mapped to `disabled`.
 *
 * Security Lake has no administrator/member relationship API in scope, so `administratorAccountId` and
 * `relationshipStatus` are never set. Accounts whose logs are collected by another account's data lake appear in that
 * account's `logSources`.
 */
export const SecurityLakeStatusEntity: TranslatedEntity<
  SecurityLakeStatusState,
  StatusItem,
  StatusItem
> = {
  version: "0.1.0",
  debugLabel: "securitylake-status",
  provider: "aws",
  command: "ListDataLakes",
  category: "securitylake",
  subcategory: "status",
  nodeType: "securitylake-status",
  selector: "SecurityLake|ListDataLakes|[]",

  async getState(connector, context) {
    const lakePages = await getOwnState<ListDataLakesCommandOutput>(
      connector,
      context,
      "ListDataLakes",
    );
    if (lakePages.length === 0) {
      return [];
    }

    const failedCalls: Record<string, string> = {};
    for (const functionName of SECURITY_LAKE_CALLS) {
      const failed = (await getOwnState(connector, context, functionName)).find(
        (page) => page._error != null,
      );
      if (failed?._error != null) {
        failedCalls[functionName] = failed._error.name;
      }
    }

    const lake = lakePages
      .flatMap((page) => page._result?.dataLakes ?? [])
      .find(
        (entry) => entry.region === context.region && entry.dataLakeArn != null,
      );
    const statusError = lakePages.find((page) => page._error != null)?._error;
    let status: Pick<ServiceStatus, "status" | "statusReason">;
    if (statusError != null) {
      status = { status: "unknown", statusReason: statusError.name };
    } else {
      status = { status: lake != null ? "enabled" : "disabled" };
    }

    const logSources = results(
      await getOwnState<ListLogSourcesCommandOutput>(
        connector,
        context,
        "ListLogSources",
      ),
    )?.flatMap((page) =>
      (page.sources ?? []).map((entry) => ({
        account: entry.account,
        region: entry.region,
        sources: (entry.sources ?? []).flatMap(toSource),
      })),
    );
    const organizationAutoEnableSources = results(
      await getOwnState<GetDataLakeOrganizationConfigurationCommandOutput>(
        connector,
        context,
        "GetDataLakeOrganizationConfiguration",
      ),
    )?.flatMap((page) =>
      (page.autoEnableNewAccount ?? [])
        .filter((entry) => entry.region === context.region)
        .flatMap((entry) =>
          (entry.sources ?? []).map((source) => ({
            type: "aws" as const,
            name: source.sourceName,
            version: source.sourceVersion,
          })),
        ),
    );
    const subscribers = results(
      await getOwnState<ListSubscribersCommandOutput>(
        connector,
        context,
        "ListSubscribers",
      ),
    )?.flatMap((page) => (page.subscribers ?? []).map(toSubscriber));

    return [
      {
        $metadata: lakePages[0]._metadata,
        serviceStatus: {
          service: "securitylake",
          ...status,
          failedCalls,
        },
        securitylake: {
          dataLake: lake != null ? toDataLake(lake) : undefined,
          logSources,
          organizationAutoEnableSources,
          subscribers,
        },
      },
    ];
  },

  translate(val) {
    return [val];
  },

  components: {
    $metadata(val) {
      return { version: "0.1.0", timestamp: val.$metadata.timestamp };
    },
    $source() {
      return { command: "ListDataLakes" };
    },
    $graph(val) {
      return {
        id: `${val.$metadata.account}-${val.$metadata.region}-securitylake`,
        label: `Security Lake (${val.$metadata.region})`,
        nodeClass: "informational",
        nodeType: SecurityLakeStatusEntity.nodeType,
        parent: val.$metadata.account,
      };
    },
    tenant(val) {
      return {
        provider: SecurityLakeStatusEntity.provider,
        partition: val.$metadata.partition,
        tenantId: val.$metadata.account,
      };
    },
    location(val) {
      return { code: val.$metadata.region };
    },
    resource(val) {
      return {
        id: `${val.$metadata.account}-${val.$metadata.region}-securitylake`,
        name: `Security Lake (${val.$metadata.region})`,
        category: SecurityLakeStatusEntity.category,
        subcategory: SecurityLakeStatusEntity.subcategory,
      };
    },
    encryption(val) {
      return { keyId: val.securitylake.dataLake?.kmsKeyId };
    },
    serviceStatus(val) {
      return val.serviceStatus;
    },
    securitylake(val) {
      return val.securitylake;
    },
  },
};

export type GraphState = SecurityLakeStatusState;
