import type {
  AttachedManagedPolicy,
  CustomerManagedPolicyReference,
  DescribePermissionSetCommandInput,
  DescribePermissionSetCommandOutput,
  InstanceMetadata,
  ListCustomerManagedPolicyReferencesInPermissionSetCommandInput,
  ListCustomerManagedPolicyReferencesInPermissionSetCommandOutput,
  ListInstancesCommandOutput,
  ListManagedPoliciesInPermissionSetCommandInput,
  ListManagedPoliciesInPermissionSetCommandOutput,
  ListPermissionSetsCommandInput,
  ListPermissionSetsCommandOutput,
  PermissionSet,
} from "@aws-sdk/client-sso-admin";
import {
  evaluateSelector,
  evaluateSelectorGlobally,
  tryNormalizeDateEpoch,
} from "@infrascan/core";
import type {
  AwsContext,
  BaseState,
  CommandCallMetadata,
  Connector,
  Serialized,
  TranslatedEntity,
} from "@infrascan/shared-types";
import type { CallState } from "./state";

export const SERVICE = "identitycenter";

/**
 * Every call this scanner makes. A failure of any of them is listed on the status node.
 */
export const CALLS = [
  "ListInstances",
  "ListPermissionSets",
  "DescribePermissionSet",
  "ListManagedPoliciesInPermissionSet",
  "ListCustomerManagedPolicyReferencesInPermissionSet",
  "ListAccountsForProvisionedPermissionSet",
] as const;

async function getOwnState<O, I = unknown>(
  connector: Connector,
  context: AwsContext,
  functionName: string,
): Promise<Serialized<CallState<O, I>>[]> {
  const state = await evaluateSelector<Serialized<CallState<O, I>>>(
    context.account,
    context.region,
    `SSOAdmin|${functionName}|[]`,
    connector,
  );
  return state ?? [];
}

async function getGlobalState<O, I = unknown>(
  connector: Connector,
  functionName: string,
): Promise<Serialized<CallState<O, I>>[]> {
  return (
    (await evaluateSelectorGlobally(
      `SSOAdmin|${functionName}|[]`,
      connector,
    )) ?? []
  );
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
/*                                  Reporters                                 */
/* -------------------------------------------------------------------------- */

interface Viewer {
  account: string;
  region: string;
}

/**
 * An organization instance can be listed by the management account and by a delegated administrator, and a
 * multi-region instance in each of its regions. Exactly one scan emits each instance and permission set node: the
 * instance's owner account if it was scanned, else the lowest account id; within that account the instance's primary
 * region if it was scanned, else the lowest region.
 */
function pickReporter(
  viewers: Viewer[],
  instance?: Serialized<InstanceMetadata>,
): Viewer {
  const rank = (viewer: Viewer) =>
    [
      viewer.account === instance?.OwnerAccountId ? 0 : 1,
      viewer.account,
      viewer.region === instance?.PrimaryRegion ? 0 : 1,
      viewer.region,
    ] as const;
  return [...viewers].sort((a, b) => {
    const [ra, rb] = [rank(a), rank(b)];
    return (
      ra[0] - rb[0] ||
      ra[1].localeCompare(rb[1]) ||
      ra[2] - rb[2] ||
      ra[3].localeCompare(rb[3])
    );
  })[0];
}

interface Reporters {
  instances: Map<string, Serialized<InstanceMetadata>>;
  instanceReporters: Map<string, Viewer>;
  permissionSetReporters: Map<string, Viewer>;
}

async function getReporters(connector: Connector): Promise<Reporters> {
  const instances = new Map<string, Serialized<InstanceMetadata>>();
  const instanceViewers = new Map<string, Viewer[]>();
  for (const page of await getGlobalState<ListInstancesCommandOutput>(
    connector,
    "ListInstances",
  )) {
    for (const instance of page._result?.Instances ?? []) {
      if (instance.InstanceArn != null) {
        instances.set(instance.InstanceArn, instance);
        const viewers = instanceViewers.get(instance.InstanceArn) ?? [];
        viewers.push(page._metadata);
        instanceViewers.set(instance.InstanceArn, viewers);
      }
    }
  }
  const permissionSetViewers = new Map<
    string,
    { instanceArn?: string; viewers: Viewer[] }
  >();
  for (const page of await getGlobalState<
    ListPermissionSetsCommandOutput,
    ListPermissionSetsCommandInput
  >(connector, "ListPermissionSets")) {
    for (const permissionSetArn of page._result?.PermissionSets ?? []) {
      const entry = permissionSetViewers.get(permissionSetArn) ?? {
        instanceArn: page._parameters?.InstanceArn,
        viewers: [],
      };
      entry.viewers.push(page._metadata);
      permissionSetViewers.set(permissionSetArn, entry);
    }
  }
  return {
    instances,
    instanceReporters: new Map(
      [...instanceViewers].map(([arn, viewers]) => [
        arn,
        pickReporter(viewers, instances.get(arn)),
      ]),
    ),
    permissionSetReporters: new Map(
      [...permissionSetViewers].map(([arn, { instanceArn, viewers }]) => [
        arn,
        pickReporter(viewers, instances.get(instanceArn ?? "")),
      ]),
    ),
  };
}

function isReporter(context: AwsContext, reporter?: Viewer): boolean {
  return (
    reporter?.account === context.account && reporter.region === context.region
  );
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

export interface InstanceSummary {
  arn?: string;
  name?: string;
  identityStoreId?: string;
  /**
   * The account that owns the instance, as reported: the management account for an organization instance, or the
   * account itself for an account instance.
   */
  ownerAccountId?: string;
  status?: string;
  primaryRegion?: string;
}

export interface IdentityCenterStatusDetails {
  /** Instances listed in this account and region */
  instances: InstanceSummary[];
}

export type StatusState = BaseState & {
  serviceStatus: ServiceStatus;
  identitycenter: { status: IdentityCenterStatusDetails };
};

interface StatusItem extends Item {
  serviceStatus: ServiceStatus;
  details: IdentityCenterStatusDetails;
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
  debugLabel: "identitycenter-status",
  provider: "aws",
  command: "ListInstances",
  category: SERVICE,
  subcategory: "status",
  nodeType: `${SERVICE}-status`,
  selector: "SSOAdmin|ListInstances|[]",

  async getState(connector, context) {
    const pages = await getOwnState<ListInstancesCommandOutput>(
      connector,
      context,
      "ListInstances",
    );
    if (pages.length === 0) {
      return [];
    }
    const instances = pages.flatMap((page) => page._result?.Instances ?? []);
    const failed = pages.find((page) => page._error != null);
    let status: ServiceStatus["status"];
    let statusReason: string | undefined;
    if (instances.length > 0) {
      status = "enabled";
    } else if (failed?._error != null) {
      status = "unknown";
      statusReason = failed._error.name;
    } else {
      status = "disabled";
    }
    return [
      {
        $metadata: pages[0]._metadata,
        serviceStatus: {
          service: SERVICE,
          status,
          statusReason,
          failedCalls: await getFailedCalls(connector, context),
        },
        details: {
          instances: instances.map((instance) => ({
            arn: instance.InstanceArn,
            name: instance.Name,
            identityStoreId: instance.IdentityStoreId,
            ownerAccountId: instance.OwnerAccountId,
            status: instance.Status,
            primaryRegion: instance.PrimaryRegion,
          })),
        },
      },
    ];
  },

  translate(val) {
    return [val];
  },

  components: {
    $metadata: metadata("0.1.0"),
    $source: source("ListInstances"),
    $graph(val) {
      return {
        id: `${val.$metadata.account}-${val.$metadata.region}-${SERVICE}`,
        label: `IAM Identity Center (${val.$metadata.region})`,
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
        name: `IAM Identity Center (${val.$metadata.region})`,
        category: StatusEntity.category,
        subcategory: StatusEntity.subcategory,
      };
    },
    serviceStatus(val) {
      return val.serviceStatus;
    },
    identitycenter(val) {
      return { status: val.details };
    },
  },
};

/* -------------------------------------------------------------------------- */
/*                                  Instances                                 */
/* -------------------------------------------------------------------------- */

export interface InstanceDetails {
  arn?: string;
  name?: string;
  identityStoreId?: string;
  identityStoreArn?: string;
  /** The account that owns the instance, as reported */
  ownerAccountId?: string;
  status?: string;
  statusReason?: string;
  primaryRegion?: string;
  regions: {
    regionName?: string;
    status?: string;
    isPrimaryRegion?: boolean;
    addedAt?: number | null;
  }[];
  createdAt?: number | null;
}

export type InstanceState = BaseState & {
  identitycenter: { instance: InstanceDetails };
};

interface InstanceItem extends Item {
  instance: Serialized<InstanceMetadata>;
}

export const InstanceEntity: TranslatedEntity<
  InstanceState,
  InstanceItem,
  InstanceItem
> = {
  version: "0.1.0",
  debugLabel: "identitycenter-instance",
  provider: "aws",
  command: "ListInstances",
  category: SERVICE,
  subcategory: "instance",
  nodeType: `${SERVICE}-instance`,
  selector: "SSOAdmin|ListInstances|[]",

  async getState(connector, context) {
    const { instanceReporters } = await getReporters(connector);
    const pages = await getOwnState<ListInstancesCommandOutput>(
      connector,
      context,
      "ListInstances",
    );
    const seen = new Set<string>();
    return pages.flatMap((page) =>
      (page._result?.Instances ?? [])
        .filter((instance) => {
          const arn = instance.InstanceArn;
          if (
            arn == null ||
            seen.has(arn) ||
            !isReporter(context, instanceReporters.get(arn))
          ) {
            return false;
          }
          seen.add(arn);
          return true;
        })
        .map((instance) => ({ $metadata: page._metadata, instance })),
    );
  },

  translate(val) {
    return [val];
  },

  components: {
    $metadata: metadata("0.1.0"),
    $source: source("ListInstances"),
    $graph(val) {
      return {
        id: val.instance.InstanceArn!,
        label: val.instance.Name ?? val.instance.InstanceArn!,
        nodeClass: "informational",
        nodeType: InstanceEntity.nodeType,
        parent: val.$metadata.account,
      };
    },
    tenant(val) {
      return {
        provider: InstanceEntity.provider,
        partition: val.$metadata.partition,
        tenantId: val.$metadata.account,
      };
    },
    location(val) {
      return { code: val.$metadata.region };
    },
    resource(val) {
      return {
        id: val.instance.InstanceArn!,
        name: val.instance.Name ?? val.instance.InstanceArn!,
        category: InstanceEntity.category,
        subcategory: InstanceEntity.subcategory,
      };
    },
    audit(val) {
      return { createdAt: tryNormalizeDateEpoch(val.instance.CreatedDate) };
    },
    identitycenter(val) {
      const { instance } = val;
      return {
        instance: {
          arn: instance.InstanceArn,
          name: instance.Name,
          identityStoreId: instance.IdentityStoreId,
          identityStoreArn: instance.IdentityStoreArn,
          ownerAccountId: instance.OwnerAccountId,
          status: instance.Status,
          statusReason: instance.StatusReason,
          primaryRegion: instance.PrimaryRegion,
          regions: (instance.Regions ?? []).map((region) => ({
            regionName: region.RegionName,
            status: region.Status,
            isPrimaryRegion: region.IsPrimaryRegion,
            addedAt: tryNormalizeDateEpoch(region.AddedDate),
          })),
          createdAt: tryNormalizeDateEpoch(instance.CreatedDate),
        },
      };
    },
  },
};

/* -------------------------------------------------------------------------- */
/*                               Permission sets                              */
/* -------------------------------------------------------------------------- */

export interface PermissionSetDetails {
  arn: string;
  instanceArn?: string;
  name?: string;
  description?: string;
  /** ISO 8601 duration, verbatim */
  sessionDuration?: string;
  relayState?: string;
  createdAt?: number | null;
  /** AWS managed policies attached to the permission set */
  managedPolicies: { name?: string; arn?: string }[];
  /** Customer managed policies referenced by name and path; their documents live in each account and are not read */
  customerManagedPolicies: { name?: string; path?: string }[];
}

export type PermissionSetState = BaseState & {
  identitycenter: { permissionSet: PermissionSetDetails };
};

interface PermissionSetItem extends Item {
  arn: string;
  instanceArn?: string;
  permissionSet?: Serialized<PermissionSet>;
  managedPolicies: Serialized<AttachedManagedPolicy>[];
  customerManagedPolicies: Serialized<CustomerManagedPolicyReference>[];
}

function groupByPermissionSet<T, R>(
  pages: Serialized<CallState<T, { PermissionSetArn?: string }>>[],
  pick: (result: Serialized<T>) => R[] | undefined,
): Map<string, R[]> {
  const grouped = new Map<string, R[]>();
  for (const page of pages) {
    const arn = page._parameters?.PermissionSetArn;
    if (arn != null && page._result != null) {
      const existing = grouped.get(arn) ?? [];
      existing.push(...(pick(page._result) ?? []));
      grouped.set(arn, existing);
    }
  }
  return grouped;
}

export const PermissionSetEntity: TranslatedEntity<
  PermissionSetState,
  PermissionSetItem,
  PermissionSetItem
> = {
  version: "0.1.0",
  debugLabel: "identitycenter-permission-set",
  provider: "aws",
  command: "ListPermissionSets",
  category: SERVICE,
  subcategory: "permission-set",
  nodeType: `${SERVICE}-permission-set`,
  selector: "SSOAdmin|ListPermissionSets|[]",

  async getState(connector, context) {
    const { permissionSetReporters } = await getReporters(connector);
    const described = groupByPermissionSet(
      await getOwnState<
        DescribePermissionSetCommandOutput,
        DescribePermissionSetCommandInput
      >(connector, context, "DescribePermissionSet"),
      (result) => (result.PermissionSet ? [result.PermissionSet] : []),
    );
    const managedPolicies = groupByPermissionSet(
      await getOwnState<
        ListManagedPoliciesInPermissionSetCommandOutput,
        ListManagedPoliciesInPermissionSetCommandInput
      >(connector, context, "ListManagedPoliciesInPermissionSet"),
      (result) => result.AttachedManagedPolicies,
    );
    const customerManagedPolicies = groupByPermissionSet(
      await getOwnState<
        ListCustomerManagedPolicyReferencesInPermissionSetCommandOutput,
        ListCustomerManagedPolicyReferencesInPermissionSetCommandInput
      >(
        connector,
        context,
        "ListCustomerManagedPolicyReferencesInPermissionSet",
      ),
      (result) => result.CustomerManagedPolicyReferences,
    );
    const pages = await getOwnState<
      ListPermissionSetsCommandOutput,
      ListPermissionSetsCommandInput
    >(connector, context, "ListPermissionSets");
    const seen = new Set<string>();
    return pages.flatMap((page) =>
      (page._result?.PermissionSets ?? [])
        .filter((arn) => {
          if (
            seen.has(arn) ||
            !isReporter(context, permissionSetReporters.get(arn))
          ) {
            return false;
          }
          seen.add(arn);
          return true;
        })
        .map((arn) => ({
          $metadata: page._metadata,
          arn,
          instanceArn: page._parameters?.InstanceArn,
          permissionSet: described.get(arn)?.[0],
          managedPolicies: managedPolicies.get(arn) ?? [],
          customerManagedPolicies: customerManagedPolicies.get(arn) ?? [],
        })),
    );
  },

  translate(val) {
    return [val];
  },

  components: {
    $metadata: metadata("0.1.0"),
    $source: source("ListPermissionSets"),
    $graph(val) {
      return {
        id: val.arn,
        label: val.permissionSet?.Name ?? val.arn,
        nodeClass: "informational",
        nodeType: PermissionSetEntity.nodeType,
        parent: val.$metadata.account,
      };
    },
    tenant(val) {
      return {
        provider: PermissionSetEntity.provider,
        partition: val.$metadata.partition,
        tenantId: val.$metadata.account,
      };
    },
    location(val) {
      return { code: val.$metadata.region };
    },
    resource(val) {
      return {
        id: val.arn,
        name: val.permissionSet?.Name ?? val.arn,
        category: PermissionSetEntity.category,
        subcategory: PermissionSetEntity.subcategory,
        description: val.permissionSet?.Description,
      };
    },
    audit(val) {
      return {
        createdAt: tryNormalizeDateEpoch(val.permissionSet?.CreatedDate),
      };
    },
    identitycenter(val) {
      return {
        permissionSet: {
          arn: val.arn,
          instanceArn: val.instanceArn,
          name: val.permissionSet?.Name,
          description: val.permissionSet?.Description,
          sessionDuration: val.permissionSet?.SessionDuration,
          relayState: val.permissionSet?.RelayState,
          createdAt: tryNormalizeDateEpoch(val.permissionSet?.CreatedDate),
          managedPolicies: val.managedPolicies.map((policy) => ({
            name: policy.Name,
            arn: policy.Arn,
          })),
          customerManagedPolicies: val.customerManagedPolicies.map(
            (policy) => ({ name: policy.Name, path: policy.Path }),
          ),
        },
      };
    },
  },
};

export type GraphState = StatusState | InstanceState | PermissionSetState;
