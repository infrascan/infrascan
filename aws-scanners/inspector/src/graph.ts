import type {
  BatchGetAccountStatusCommandOutput,
  DescribeOrganizationConfigurationCommandOutput,
  GetDelegatedAdminAccountCommandOutput,
  ListDelegatedAdminAccountsCommandOutput,
  ListMembersCommandOutput,
  State,
} from "@aws-sdk/client-inspector2";
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

const SERVICE = "inspector2";

/**
 * Calls whose failure is reported on the status node, in getter order.
 */
export const INSPECTOR_CALLS = [
  "BatchGetAccountStatus",
  "GetDelegatedAdminAccount",
  "ListDelegatedAdminAccounts",
  "DescribeOrganizationConfiguration",
  "ListMembers",
] as const;

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
 * An Inspector state object, verbatim.
 */
export interface InspectorState {
  status?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface InspectorMember {
  accountId?: string;
  relationshipStatus?: string;
  delegatedAdminAccountId?: string;
  updatedAt?: number | null;
}

export interface InspectorDetails {
  /** Overall Inspector state of the account */
  state?: InspectorState;
  /** Inspector state per resource type (e.g. `ec2`, `ecr`, `lambda`, `lambdaCode`, `codeRepository`) */
  resourceState: Record<string, InspectorState>;
  /** Set when BatchGetAccountStatus reported the account under `failedAccounts` */
  failedAccount?: InspectorState & { resourceStatus: Record<string, string> };
  /** The organization's delegated administrator, as GetDelegatedAdminAccount reports it */
  delegatedAdmin?: { accountId?: string; relationshipStatus?: string };
  /** Expected to be readable by the management account only. Absent when the call failed. */
  delegatedAdminAccounts?: { accountId?: string; status?: string }[];
  /** Expected to be readable by the delegated administrator only. Absent when the call failed. */
  organizationConfiguration?: {
    /** Auto-enable per resource type */
    autoEnable: Record<string, boolean>;
    maxAccountLimitReached?: boolean;
  };
  /** Members of this account as delegated administrator. Absent when the call failed. */
  members?: InspectorMember[];
}

export type InspectorStatusState = BaseState & {
  serviceStatus: ServiceStatus;
  inspector2: InspectorDetails;
};

interface StatusItem {
  $metadata: CommandCallMetadata;
  serviceStatus: ServiceStatus;
  inspector2: InspectorDetails;
}

async function getOwnState<O, I = unknown>(
  connector: Connector,
  context: AwsContext,
  functionName: string,
): Promise<Serialized<CallState<O, I>>[]> {
  const state = await evaluateSelector<Serialized<CallState<O, I>>>(
    context.account,
    context.region,
    `Inspector2|${functionName}|[]`,
    connector,
  );
  return state ?? [];
}

async function getFailedCalls(
  connector: Connector,
  context: AwsContext,
): Promise<Record<string, string>> {
  const failedCalls: Record<string, string> = {};
  for (const functionName of INSPECTOR_CALLS) {
    const failed = (await getOwnState(connector, context, functionName)).find(
      (entry) => entry._error != null,
    );
    if (failed?._error != null) {
      failedCalls[functionName] = failed._error.name;
    }
  }
  return failedCalls;
}

/**
 * A list of pages where every page succeeded, or undefined when any page failed or none was recorded, so a consumer
 * can tell "none" from "could not read".
 */
function successfulPages<O, I>(
  pages: Serialized<CallState<O, I>>[],
): Serialized<O>[] | undefined {
  if (pages.length === 0 || pages.some((page) => page._error != null)) {
    return undefined;
  }
  return pages.map((page) => page._result as Serialized<O>);
}

function toState(state: Serialized<State> | undefined): InspectorState {
  return {
    status: state?.status,
    errorCode: state?.errorCode,
    errorMessage: state?.errorMessage,
  };
}

function definedEntries<T>(
  record: object | undefined,
): [string, NonNullable<T>][] {
  return Object.entries(record ?? {}).filter(
    (entry): entry is [string, NonNullable<T>] => entry[1] != null,
  );
}

/**
 * Status mapping, from the caller's own entry in BatchGetAccountStatus:
 * - The call failed (denied, throttled, ...): unknown, reason is the error name.
 * - `state.status` ENABLED: enabled.
 * - `state.status` DISABLED or SUSPENDED: disabled, reason is AWS's `errorCode` when it gives one.
 * - `state.status` ENABLING, DISABLING or SUSPENDING: unknown, reason is the transitional status itself. Inspector
 *   is changing state and AWS has not said where it will settle.
 * - The account is listed under `failedAccounts`, or not returned at all: unknown, reason is AWS's `errorCode`.
 */
function mapStatus(
  callError: { name: string } | undefined,
  details: InspectorDetails,
): Pick<ServiceStatus, "status" | "statusReason"> {
  if (callError != null) {
    return { status: "unknown", statusReason: callError.name };
  }
  const status = details.state?.status;
  const errorCode = details.state?.errorCode || undefined;
  if (status === "ENABLED") {
    return { status: "enabled" };
  }
  if (status === "DISABLED" || status === "SUSPENDED") {
    return { status: "disabled", statusReason: errorCode };
  }
  if (status != null) {
    return { status: "unknown", statusReason: errorCode ?? status };
  }
  return {
    status: "unknown",
    statusReason: details.failedAccount?.errorCode ?? "AccountNotReturned",
  };
}

export const InspectorStatusEntity: TranslatedEntity<
  InspectorStatusState,
  StatusItem,
  StatusItem
> = {
  version: "0.1.0",
  debugLabel: "inspector2-status",
  provider: "aws",
  command: "BatchGetAccountStatus",
  category: SERVICE,
  subcategory: "status",
  nodeType: `${SERVICE}-status`,
  selector: "Inspector2|BatchGetAccountStatus|[]",

  async getState(connector, context) {
    const statusPages = await getOwnState<BatchGetAccountStatusCommandOutput>(
      connector,
      context,
      "BatchGetAccountStatus",
    );
    if (statusPages.length === 0) {
      return [];
    }
    const callError = statusPages.find((page) => page._error != null)?._error;
    const accounts = statusPages.flatMap(
      (page) => page._result?.accounts ?? [],
    );
    const own =
      accounts.find((account) => account.accountId === context.account) ??
      (accounts.length === 1 ? accounts[0] : undefined);
    const failed = statusPages
      .flatMap((page) => page._result?.failedAccounts ?? [])
      .find((account) => account.accountId === context.account);

    const delegatedAdmin = (
      await getOwnState<GetDelegatedAdminAccountCommandOutput>(
        connector,
        context,
        "GetDelegatedAdminAccount",
      )
    ).find((page) => page._result != null)?._result?.delegatedAdmin;
    const delegatedAdminAccounts = successfulPages(
      await getOwnState<ListDelegatedAdminAccountsCommandOutput>(
        connector,
        context,
        "ListDelegatedAdminAccounts",
      ),
    );
    const organizationConfiguration = successfulPages(
      await getOwnState<DescribeOrganizationConfigurationCommandOutput>(
        connector,
        context,
        "DescribeOrganizationConfiguration",
      ),
    )?.[0];
    const members = successfulPages(
      await getOwnState<ListMembersCommandOutput>(
        connector,
        context,
        "ListMembers",
      ),
    );

    const details: InspectorDetails = {
      state: own?.state != null ? toState(own.state) : undefined,
      resourceState: Object.fromEntries(
        definedEntries<Serialized<State>>(own?.resourceState).map(
          ([resourceType, state]) => [resourceType, toState(state)],
        ),
      ),
      failedAccount:
        failed != null
          ? {
              status: failed.status,
              errorCode: failed.errorCode,
              errorMessage: failed.errorMessage,
              resourceStatus: Object.fromEntries(
                definedEntries<string>(failed.resourceStatus),
              ),
            }
          : undefined,
      delegatedAdmin:
        delegatedAdmin != null
          ? {
              accountId: delegatedAdmin.accountId,
              relationshipStatus: delegatedAdmin.relationshipStatus,
            }
          : undefined,
      delegatedAdminAccounts: delegatedAdminAccounts?.flatMap((page) =>
        (page.delegatedAdminAccounts ?? []).map((account) => ({
          accountId: account.accountId,
          status: account.status,
        })),
      ),
      organizationConfiguration:
        organizationConfiguration != null
          ? {
              autoEnable: Object.fromEntries(
                definedEntries<boolean>(organizationConfiguration.autoEnable),
              ),
              maxAccountLimitReached:
                organizationConfiguration.maxAccountLimitReached,
            }
          : undefined,
      members: members?.flatMap((page) =>
        (page.members ?? []).map((member) => ({
          accountId: member.accountId,
          relationshipStatus: member.relationshipStatus,
          delegatedAdminAccountId: member.delegatedAdminAccountId,
          updatedAt: tryNormalizeDateEpoch(member.updatedAt),
        })),
      ),
    };

    return [
      {
        $metadata: statusPages[0]._metadata,
        serviceStatus: {
          service: SERVICE,
          ...mapStatus(callError, details),
          // Inspector has no member-side "administrator" call: the relationship is the one GetDelegatedAdminAccount
          // reports between the organization's delegated administrator and the caller.
          administratorAccountId: delegatedAdmin?.accountId,
          relationshipStatus: delegatedAdmin?.relationshipStatus,
          failedCalls: await getFailedCalls(connector, context),
        },
        inspector2: details,
      },
    ];
  },

  translate(val) {
    return [val];
  },

  components: {
    $metadata(val) {
      return {
        version: InspectorStatusEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },
    $source() {
      return { command: InspectorStatusEntity.command };
    },
    $graph(val) {
      return {
        id: `${val.$metadata.account}-${val.$metadata.region}-${SERVICE}`,
        label: `Inspector (${val.$metadata.region})`,
        nodeClass: "informational",
        nodeType: InspectorStatusEntity.nodeType,
        parent: val.$metadata.account,
      };
    },
    tenant(val) {
      return {
        provider: InspectorStatusEntity.provider,
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
        name: `Inspector (${val.$metadata.region})`,
        category: InspectorStatusEntity.category,
        subcategory: InspectorStatusEntity.subcategory,
      };
    },
    serviceStatus(val) {
      return val.serviceStatus;
    },
    inspector2(val) {
      return val.inspector2;
    },
  },
};

export type GraphState = InspectorStatusState;
