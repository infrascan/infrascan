import type {
  CallAs,
  DescribeOrganizationsAccessCommandOutput,
  DescribeStackSetCommandInput,
  DescribeStackSetCommandOutput,
  ListStackInstancesCommandInput,
  ListStackInstancesCommandOutput,
  ListStackSetsCommandInput,
  ListStackSetsCommandOutput,
  StackInstanceSummary,
  StackSet,
} from "@aws-sdk/client-cloudformation";
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

export const SERVICE = "cloudformation";

/**
 * Every call this scanner makes. A failure of any of them is listed on the status node.
 */
export const CALLS = [
  "DescribeOrganizationsAccess",
  "ListStackSets",
  "DescribeStackSet",
  "ListStackInstances",
] as const;

async function getOwnState<O, I = unknown>(
  connector: Connector,
  context: AwsContext,
  functionName: string,
): Promise<Serialized<CallState<O, I>>[]> {
  const state = await evaluateSelector<Serialized<CallState<O, I>>>(
    context.account,
    context.region,
    `CloudFormation|${functionName}|[]`,
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
      `CloudFormation|${functionName}|[]`,
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

/**
 * The account in an ARN, e.g. the management account in a stack set ARN listed by a delegated administrator.
 */
export function arnAccount(arn: string): string | undefined {
  return arn.split(":")[4] || undefined;
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

export interface StackSetReferenceDetails {
  stackSetId?: string;
  stackSetName?: string;
  callAs: string;
  status?: string;
  permissionModel?: string;
}

export interface CloudFormationStatusDetails {
  /** `DescribeOrganizationsAccess` status, verbatim: whether StackSets has trusted access to Organizations */
  organizationsAccess?: string;
  /** Stack sets that were listed but could not be described, so have no node */
  undescribedStackSets: StackSetReferenceDetails[];
}

export type StatusState = BaseState & {
  serviceStatus: ServiceStatus;
  cloudformation: { status: CloudFormationStatusDetails };
};

interface StatusItem extends Item {
  serviceStatus: ServiceStatus;
  details: CloudFormationStatusDetails;
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
  debugLabel: "cloudformation-status",
  provider: "aws",
  command: "DescribeOrganizationsAccess",
  category: SERVICE,
  subcategory: "status",
  nodeType: `${SERVICE}-status`,
  selector: "CloudFormation|DescribeOrganizationsAccess|[]",

  async getState(connector, context) {
    const access = await getOwnState<DescribeOrganizationsAccessCommandOutput>(
      connector,
      context,
      "DescribeOrganizationsAccess",
    );
    const listed = await getOwnState<
      ListStackSetsCommandOutput,
      ListStackSetsCommandInput
    >(connector, context, "ListStackSets");
    const first = access[0] ?? listed[0];
    if (first == null) {
      return [];
    }

    // The status is StackSets' trusted access to Organizations, the one account-level switch the service reports.
    const page = access.find((entry) => entry._result != null);
    const failed = access.find((entry) => entry._error != null);
    const organizationsAccess = page?._result?.Status;
    let status: ServiceStatus["status"] = "unknown";
    let statusReason: string | undefined;
    if (organizationsAccess === "ENABLED") {
      status = "enabled";
    } else if (
      organizationsAccess === "DISABLED" ||
      organizationsAccess === "DISABLED_PERMANENTLY"
    ) {
      status = "disabled";
    } else if (failed?._error != null) {
      statusReason = failed._error.name;
    }

    const described = new Set(
      (
        await getOwnState<
          DescribeStackSetCommandOutput,
          DescribeStackSetCommandInput
        >(connector, context, "DescribeStackSet")
      )
        .filter((entry) => entry._result?.StackSet?.StackSetARN != null)
        .map(
          (entry) =>
            `${entry._parameters?.CallAs ?? "SELF"}|${
              entry._parameters?.StackSetName
            }`,
        ),
    );
    const undescribedStackSets = listed.flatMap((entry) => {
      const callAs = entry._parameters?.CallAs ?? "SELF";
      return (entry._result?.Summaries ?? [])
        .filter((summary) => !described.has(`${callAs}|${summary.StackSetId}`))
        .map((summary) => ({
          stackSetId: summary.StackSetId,
          stackSetName: summary.StackSetName,
          callAs,
          status: summary.Status,
          permissionModel: summary.PermissionModel,
        }));
    });

    return [
      {
        $metadata: first._metadata,
        serviceStatus: {
          service: SERVICE,
          status,
          statusReason,
          failedCalls: await getFailedCalls(connector, context),
        },
        details: { organizationsAccess, undescribedStackSets },
      },
    ];
  },

  translate(val) {
    return [val];
  },

  components: {
    $metadata: metadata("0.1.0"),
    $source: source("DescribeOrganizationsAccess"),
    $graph(val) {
      return {
        id: `${val.$metadata.account}-${val.$metadata.region}-${SERVICE}`,
        label: `CloudFormation StackSets (${val.$metadata.region})`,
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
        name: `CloudFormation StackSets (${val.$metadata.region})`,
        category: StatusEntity.category,
        subcategory: StatusEntity.subcategory,
      };
    },
    serviceStatus(val) {
      return val.serviceStatus;
    },
    cloudformation(val) {
      return { status: val.details };
    },
  },
};

/* -------------------------------------------------------------------------- */
/*                                 Stack sets                                 */
/* -------------------------------------------------------------------------- */

export interface StackInstanceDetails {
  account?: string;
  region?: string;
  organizationalUnitId?: string;
  stackId?: string;
  status?: string;
  statusReason?: string;
  detailedStatus?: string;
  /** Drift status as AWS last reported it; this scanner does not start drift detection */
  driftStatus?: string;
  lastDriftCheckAt?: number | null;
}

export interface StackSetDetails {
  arn?: string;
  stackSetId?: string;
  stackSetName?: string;
  /** The `CallAs` the stack set was listed and described with */
  callAs: string;
  /** The scanned account the stack set was listed from */
  listedFromAccountId: string;
  description?: string;
  status?: string;
  permissionModel?: string;
  autoDeployment?: {
    enabled?: boolean;
    retainStacksOnAccountRemoval?: boolean;
    dependsOn?: string[];
  };
  organizationalUnitIds: string[];
  regions: string[];
  managedExecutionActive?: boolean;
  administrationRoleArn?: string;
  executionRoleName?: string;
  capabilities: string[];
  stackInstances: StackInstanceDetails[];
}

export type StackSetState = BaseState & {
  cloudformation: { stackSet: StackSetDetails };
};

interface StackSetItem extends Item {
  stackSet: Serialized<StackSet>;
  callAs: CallAs;
  instances: Serialized<StackInstanceSummary>[];
}

/**
 * A stack set can be seen by its owner (`SELF`) and by every delegated administrator (`DELEGATED_ADMIN`). Exactly one
 * scan emits its node: the owner's if it was scanned, otherwise the lowest delegated administrator account id.
 */
async function getReporters(
  connector: Connector,
): Promise<Map<string, string>> {
  const candidates = new Map<string, { account: string; self: boolean }[]>();
  for (const entry of await getGlobalState<
    DescribeStackSetCommandOutput,
    DescribeStackSetCommandInput
  >(connector, "DescribeStackSet")) {
    const arn = entry._result?.StackSet?.StackSetARN;
    if (arn != null) {
      const existing = candidates.get(arn) ?? [];
      existing.push({
        account: entry._metadata.account,
        self: (entry._parameters?.CallAs ?? "SELF") === "SELF",
      });
      candidates.set(arn, existing);
    }
  }
  const reporters = new Map<string, string>();
  for (const [arn, viewers] of candidates) {
    viewers.sort(
      (a, b) =>
        Number(b.self) - Number(a.self) || a.account.localeCompare(b.account),
    );
    reporters.set(arn, viewers[0].account);
  }
  return reporters;
}

export const StackSetEntity: TranslatedEntity<
  StackSetState,
  StackSetItem,
  StackSetItem
> = {
  version: "0.1.0",
  debugLabel: "cloudformation-stack-set",
  provider: "aws",
  command: "DescribeStackSet",
  category: SERVICE,
  subcategory: "stack-set",
  nodeType: `${SERVICE}-stack-set`,
  selector: "CloudFormation|DescribeStackSet|[]",

  async getState(connector, context) {
    const reporters = await getReporters(connector);
    const instances = new Map<string, Serialized<StackInstanceSummary>[]>();
    for (const page of await getOwnState<
      ListStackInstancesCommandOutput,
      ListStackInstancesCommandInput
    >(connector, context, "ListStackInstances")) {
      const key = `${page._parameters?.CallAs ?? "SELF"}|${
        page._parameters?.StackSetName
      }`;
      const existing = instances.get(key) ?? [];
      existing.push(...(page._result?.Summaries ?? []));
      instances.set(key, existing);
    }
    const pages = await getOwnState<
      DescribeStackSetCommandOutput,
      DescribeStackSetCommandInput
    >(connector, context, "DescribeStackSet");
    const seen = new Set<string>();
    return pages.flatMap((page) => {
      const stackSet = page._result?.StackSet;
      const arn = stackSet?.StackSetARN;
      if (
        stackSet == null ||
        arn == null ||
        seen.has(arn) ||
        reporters.get(arn) !== context.account
      ) {
        return [];
      }
      seen.add(arn);
      const callAs = page._parameters?.CallAs ?? "SELF";
      return [
        {
          $metadata: page._metadata,
          stackSet,
          callAs,
          instances:
            instances.get(`${callAs}|${page._parameters?.StackSetName}`) ?? [],
        },
      ];
    });
  },

  translate(val) {
    return [val];
  },

  components: {
    $metadata: metadata("0.1.0"),
    $source: source("DescribeStackSet"),
    $graph(val) {
      return {
        id: val.stackSet.StackSetARN!,
        label: val.stackSet.StackSetName ?? val.stackSet.StackSetARN!,
        nodeClass: "informational",
        nodeType: StackSetEntity.nodeType,
        // The owning account: the scanned account for `SELF`, the management account for `DELEGATED_ADMIN`.
        parent: arnAccount(val.stackSet.StackSetARN!) ?? val.$metadata.account,
      };
    },
    tenant(val) {
      return {
        provider: StackSetEntity.provider,
        partition: val.$metadata.partition,
        tenantId:
          arnAccount(val.stackSet.StackSetARN!) ?? val.$metadata.account,
      };
    },
    location(val) {
      return { code: val.$metadata.region };
    },
    resource(val) {
      return {
        id: val.stackSet.StackSetARN!,
        name: val.stackSet.StackSetName ?? val.stackSet.StackSetARN!,
        category: StackSetEntity.category,
        subcategory: StackSetEntity.subcategory,
        description: val.stackSet.Description,
      };
    },
    tags(val) {
      return (val.stackSet.Tags ?? []).map((tag) => ({
        key: tag.Key,
        value: tag.Value,
      }));
    },
    cloudformation(val) {
      const { stackSet } = val;
      return {
        stackSet: {
          arn: stackSet.StackSetARN,
          stackSetId: stackSet.StackSetId,
          stackSetName: stackSet.StackSetName,
          callAs: val.callAs,
          listedFromAccountId: val.$metadata.account,
          description: stackSet.Description,
          status: stackSet.Status,
          permissionModel: stackSet.PermissionModel,
          autoDeployment:
            stackSet.AutoDeployment != null
              ? {
                  enabled: stackSet.AutoDeployment.Enabled,
                  retainStacksOnAccountRemoval:
                    stackSet.AutoDeployment.RetainStacksOnAccountRemoval,
                  dependsOn: stackSet.AutoDeployment.DependsOn,
                }
              : undefined,
          organizationalUnitIds: stackSet.OrganizationalUnitIds ?? [],
          regions: stackSet.Regions ?? [],
          managedExecutionActive: stackSet.ManagedExecution?.Active,
          administrationRoleArn: stackSet.AdministrationRoleARN,
          executionRoleName: stackSet.ExecutionRoleName,
          capabilities: stackSet.Capabilities ?? [],
          stackInstances: val.instances.map((instance) => ({
            account: instance.Account,
            region: instance.Region,
            organizationalUnitId: instance.OrganizationalUnitId,
            stackId: instance.StackId,
            status: instance.Status,
            statusReason: instance.StatusReason,
            detailedStatus: instance.StackInstanceStatus?.DetailedStatus,
            driftStatus: instance.DriftStatus,
            lastDriftCheckAt: tryNormalizeDateEpoch(
              instance.LastDriftCheckTimestamp,
            ),
          })),
        },
      };
    },
  },
};

export type GraphState = StatusState | StackSetState;
