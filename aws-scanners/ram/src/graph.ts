import type {
  GetResourceSharesCommandInput,
  GetResourceSharesCommandOutput,
  ListPrincipalsCommandOutput,
  ListResourcesCommandOutput,
  Principal,
  Resource,
  ResourceShare,
} from "@aws-sdk/client-ram";
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

export const SERVICE = "ram";

/**
 * Every call this scanner makes. A failure of any of them is listed on the status node.
 */
export const CALLS = [
  "GetResourceShares",
  "ListPrincipals",
  "ListResources",
] as const;

async function getOwnState<O, I = unknown>(
  connector: Connector,
  context: AwsContext,
  functionName: string,
): Promise<Serialized<CallState<O, I>>[]> {
  const state = await evaluateSelector<Serialized<CallState<O, I>>>(
    context.account,
    context.region,
    `RAM|${functionName}|[]`,
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

export interface IncomingResourceShare {
  arn?: string;
  name?: string;
  owningAccountId?: string;
  status?: string;
}

export interface RamStatusDetails {
  /** Shares other accounts have shared with this account (`resourceOwner: OTHER-ACCOUNTS`), as listed */
  incomingResourceShares: IncomingResourceShare[];
}

export type StatusState = BaseState & {
  serviceStatus: ServiceStatus;
  ram: { status: RamStatusDetails };
};

interface StatusItem extends Item {
  serviceStatus: ServiceStatus;
  details: RamStatusDetails;
}

async function getFailedCalls(
  connector: Connector,
  context: AwsContext,
): Promise<Record<string, string>> {
  const failedCalls: Record<string, string> = {};
  for (const functionName of CALLS) {
    const failed = (await getOwnState(connector, context, functionName)).find(
      (entry) => entry._error != null,
    );
    if (failed?._error != null) {
      failedCalls[functionName] = failed._error.name;
    }
  }
  return failedCalls;
}

export const StatusEntity: TranslatedEntity<
  StatusState,
  StatusItem,
  StatusItem
> = {
  version: "0.1.0",
  debugLabel: "ram-status",
  provider: "aws",
  command: "GetResourceShares",
  category: SERVICE,
  subcategory: "status",
  nodeType: `${SERVICE}-status`,
  selector: "RAM|GetResourceShares|[]",

  async getState(connector, context) {
    const pages = await getOwnState<
      GetResourceSharesCommandOutput,
      GetResourceSharesCommandInput
    >(connector, context, "GetResourceShares");
    if (pages.length === 0) {
      return [];
    }
    const shares = pages.flatMap((page) => page._result?.resourceShares ?? []);
    const failed = pages.find((page) => page._error != null);
    let status: ServiceStatus["status"];
    let statusReason: string | undefined;
    // A share in DELETED status no longer exists; it is still listed on the node or status details as AWS returns it.
    if (shares.some((share) => share.status !== "DELETED")) {
      status = "enabled";
    } else if (failed?._error != null) {
      status = "unknown";
      statusReason = failed._error.name;
    } else {
      status = "disabled";
    }
    const incomingResourceShares = pages
      .filter((page) => page._parameters?.resourceOwner === "OTHER-ACCOUNTS")
      .flatMap((page) => page._result?.resourceShares ?? [])
      .map((share) => ({
        arn: share.resourceShareArn,
        name: share.name,
        owningAccountId: share.owningAccountId,
        status: share.status,
      }));
    return [
      {
        $metadata: pages[0]._metadata,
        serviceStatus: {
          service: SERVICE,
          status,
          statusReason,
          failedCalls: await getFailedCalls(connector, context),
        },
        details: { incomingResourceShares },
      },
    ];
  },

  translate(val) {
    return [val];
  },

  components: {
    $metadata: metadata("0.1.0"),
    $source: source("GetResourceShares"),
    $graph(val) {
      return {
        id: `${val.$metadata.account}-${val.$metadata.region}-${SERVICE}`,
        label: `RAM (${val.$metadata.region})`,
        nodeClass: "informational",
        nodeType: StatusEntity.nodeType,
        parent: val.$metadata.account,
      };
    },
    tenant(val) {
      return {
        provider: StatusEntity.provider,
        partition: val.$metadata.partition,
        tenantId: val.$metadata.account,
      };
    },
    location(val) {
      return { code: val.$metadata.region };
    },
    resource(val) {
      return {
        id: `${val.$metadata.account}-${val.$metadata.region}-${SERVICE}`,
        name: `RAM (${val.$metadata.region})`,
        category: StatusEntity.category,
        subcategory: StatusEntity.subcategory,
      };
    },
    serviceStatus(val) {
      return val.serviceStatus;
    },
    ram(val) {
      return { status: val.details };
    },
  },
};

/* -------------------------------------------------------------------------- */
/*                               Resource shares                              */
/* -------------------------------------------------------------------------- */

export interface ResourceSharePrincipal {
  /** An account id, organization or OU ARN, IAM role or user ARN, or service principal, verbatim */
  id?: string;
  external?: boolean;
}

export interface SharedResource {
  arn?: string;
  type?: string;
  status?: string;
  regionScope?: string;
  resourceGroupArn?: string;
}

export interface ResourceShareDetails {
  arn?: string;
  name?: string;
  owningAccountId?: string;
  status?: string;
  statusMessage?: string;
  allowExternalPrincipals?: boolean;
  featureSet?: string;
  createdAt?: number | null;
  lastUpdatedAt?: number | null;
  principals: ResourceSharePrincipal[];
  resources: SharedResource[];
}

export type ResourceShareState = BaseState & {
  ram: { resourceShare: ResourceShareDetails };
};

interface ResourceShareItem extends Item {
  share: Serialized<ResourceShare>;
  principals: Serialized<Principal>[];
  resources: Serialized<Resource>[];
}

function groupByShare<T extends { resourceShareArn?: string }>(
  items: T[],
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    if (item.resourceShareArn != null) {
      const existing = grouped.get(item.resourceShareArn) ?? [];
      existing.push(item);
      grouped.set(item.resourceShareArn, existing);
    }
  }
  return grouped;
}

export const ResourceShareEntity: TranslatedEntity<
  ResourceShareState,
  ResourceShareItem,
  ResourceShareItem
> = {
  version: "0.1.0",
  debugLabel: "ram-resource-share",
  provider: "aws",
  command: "GetResourceShares",
  category: SERVICE,
  subcategory: "resource-share",
  nodeType: `${SERVICE}-resource-share`,
  selector: "RAM|GetResourceShares|[]",

  async getState(connector, context) {
    const principals = groupByShare(
      (
        await getOwnState<ListPrincipalsCommandOutput>(
          connector,
          context,
          "ListPrincipals",
        )
      ).flatMap((page) => page._result?.principals ?? []),
    );
    const resources = groupByShare(
      (
        await getOwnState<ListResourcesCommandOutput>(
          connector,
          context,
          "ListResources",
        )
      ).flatMap((page) => page._result?.resources ?? []),
    );
    const pages = await getOwnState<
      GetResourceSharesCommandOutput,
      GetResourceSharesCommandInput
    >(connector, context, "GetResourceShares");
    const seen = new Set<string>();
    // Only owned shares become nodes; incoming shares are listed on the status node.
    return pages
      .filter((page) => page._parameters?.resourceOwner === "SELF")
      .flatMap((page) =>
        (page._result?.resourceShares ?? [])
          .filter((share) => {
            if (
              share.resourceShareArn == null ||
              seen.has(share.resourceShareArn)
            ) {
              return false;
            }
            seen.add(share.resourceShareArn);
            return true;
          })
          .map((share) => ({
            $metadata: page._metadata,
            share,
            principals: principals.get(share.resourceShareArn!) ?? [],
            resources: resources.get(share.resourceShareArn!) ?? [],
          })),
      );
  },

  translate(val) {
    return [val];
  },

  components: {
    $metadata: metadata("0.1.0"),
    $source: source("GetResourceShares"),
    $graph(val) {
      return {
        id: val.share.resourceShareArn!,
        label: val.share.name ?? val.share.resourceShareArn!,
        nodeClass: "informational",
        nodeType: ResourceShareEntity.nodeType,
        parent: val.$metadata.account,
      };
    },
    tenant(val) {
      return {
        provider: ResourceShareEntity.provider,
        partition: val.$metadata.partition,
        tenantId: val.share.owningAccountId ?? val.$metadata.account,
      };
    },
    location(val) {
      return { code: val.$metadata.region };
    },
    resource(val) {
      return {
        id: val.share.resourceShareArn!,
        name: val.share.name ?? val.share.resourceShareArn!,
        category: ResourceShareEntity.category,
        subcategory: ResourceShareEntity.subcategory,
      };
    },
    audit(val) {
      return { createdAt: tryNormalizeDateEpoch(val.share.creationTime) };
    },
    tags(val) {
      return (val.share.tags ?? []).map((tag) => ({
        key: tag.key,
        value: tag.value,
      }));
    },
    ram(val) {
      const { share } = val;
      return {
        resourceShare: {
          arn: share.resourceShareArn,
          name: share.name,
          owningAccountId: share.owningAccountId,
          status: share.status,
          statusMessage: share.statusMessage,
          allowExternalPrincipals: share.allowExternalPrincipals,
          featureSet: share.featureSet,
          createdAt: tryNormalizeDateEpoch(share.creationTime),
          lastUpdatedAt: tryNormalizeDateEpoch(share.lastUpdatedTime),
          principals: val.principals.map((principal) => ({
            id: principal.id,
            external: principal.external,
          })),
          resources: val.resources.map((resource) => ({
            arn: resource.arn,
            type: resource.type,
            status: resource.status,
            regionScope: resource.resourceRegionScope,
            resourceGroupArn: resource.resourceGroupArn,
          })),
        },
      };
    },
  },
};

export type GraphState = StatusState | ResourceShareState;
