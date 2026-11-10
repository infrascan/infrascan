import type {
  DescribeOrganizationConfigurationCommandOutput,
  GetAdministratorAccountCommandOutput,
  GetAutomatedDiscoveryConfigurationCommandOutput,
  GetClassificationExportConfigurationCommandOutput,
  GetMacieSessionCommandOutput,
  ListMembersCommandOutput,
  ListOrganizationAdminAccountsCommandOutput,
} from "@aws-sdk/client-macie2";
import { evaluateSelector, tryNormalizeDateEpoch } from "@infrascan/core";
import type {
  AwsContext,
  BaseState,
  CommandCallMetadata,
  Connector,
  Serialized,
  TranslatedEntity,
} from "@infrascan/shared-types";
import type { CallError, CallState } from "./state";

const SERVICE = "macie2";

/**
 * Calls whose failure is reported on the status node, in getter order.
 */
export const MACIE_CALLS = [
  "GetMacieSession",
  "GetAdministratorAccount",
  "ListOrganizationAdminAccounts",
  "DescribeOrganizationConfiguration",
  "ListMembers",
  "GetClassificationExportConfiguration",
  "GetAutomatedDiscoveryConfiguration",
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

export interface MacieMember {
  accountId?: string;
  relationshipStatus?: string;
  administratorAccountId?: string;
  invitedAt?: number | null;
  updatedAt?: number | null;
}

export interface MacieDetails {
  /** The Macie session's own status (`ENABLED` or `PAUSED`), verbatim */
  sessionStatus?: string;
  findingPublishingFrequency?: string;
  serviceRole?: string;
  createdAt?: number | null;
  updatedAt?: number | null;
  /** Expected to be readable by the management account only. Absent when the call failed. */
  organizationAdminAccounts?: { accountId?: string; status?: string }[];
  /** Expected to be readable by the delegated administrator only. Absent when the call failed. */
  organizationConfiguration?: {
    autoEnable?: boolean;
    maxAccountLimitReached?: boolean;
  };
  /** Members of this account as an administrator. Absent when the call failed. */
  members?: MacieMember[];
  /** Where discovery results are stored. Absent when none is configured or the call failed. */
  classificationExportDestination?: {
    bucketName?: string;
    keyPrefix?: string;
    kmsKeyArn?: string;
  };
  /** Status of automated sensitive data discovery, verbatim */
  automatedDiscoveryStatus?: string;
}

export type MacieStatusState = BaseState & {
  serviceStatus: ServiceStatus;
  macie2: MacieDetails;
};

interface StatusItem {
  $metadata: CommandCallMetadata;
  serviceStatus: ServiceStatus;
  macie2: MacieDetails;
}

async function getOwnState<O, I = unknown>(
  connector: Connector,
  context: AwsContext,
  functionName: string,
): Promise<Serialized<CallState<O, I>>[]> {
  const state = await evaluateSelector<Serialized<CallState<O, I>>>(
    context.account,
    context.region,
    `Macie2|${functionName}|[]`,
    connector,
  );
  return state ?? [];
}

async function getResult<O>(
  connector: Connector,
  context: AwsContext,
  functionName: string,
): Promise<Serialized<O> | undefined> {
  const page = (await getOwnState<O>(connector, context, functionName)).find(
    (entry) => entry._result != null,
  );
  return page?._result as Serialized<O> | undefined;
}

async function getFailedCalls(
  connector: Connector,
  context: AwsContext,
): Promise<Record<string, string>> {
  const failedCalls: Record<string, string> = {};
  for (const functionName of MACIE_CALLS) {
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

/**
 * Macie reports an account where it is not enabled with an AccessDeniedException whose message says so (e.g.
 * "Macie is not enabled."), rather than with a status.
 */
const NOT_ENABLED = /macie is not enabled/i;

/**
 * Status mapping, from GetMacieSession:
 * - Session status ENABLED: enabled.
 * - Session status PAUSED: disabled. A paused Macie runs no jobs and does no discovery; the raw status is kept on
 *   `macie2.sessionStatus`.
 * - AccessDeniedException whose message says Macie is not enabled: disabled, reason is AWS's message.
 * - Any other error (a real permission denial, throttling, ...): unknown, reason is the error name.
 */
function mapStatus(
  error: CallError | undefined,
  session: Serialized<GetMacieSessionCommandOutput> | undefined,
): Pick<ServiceStatus, "status" | "statusReason"> {
  if (error != null) {
    if (
      error.name === "AccessDeniedException" &&
      NOT_ENABLED.test(error.message ?? "")
    ) {
      return { status: "disabled", statusReason: error.message };
    }
    return { status: "unknown", statusReason: error.name };
  }
  if (session?.status === "ENABLED") {
    return { status: "enabled" };
  }
  if (session?.status === "PAUSED") {
    return { status: "disabled" };
  }
  return { status: "unknown", statusReason: "StatusNotReturned" };
}

export const MacieStatusEntity: TranslatedEntity<
  MacieStatusState,
  StatusItem,
  StatusItem
> = {
  version: "0.1.0",
  debugLabel: "macie2-status",
  provider: "aws",
  command: "GetMacieSession",
  category: SERVICE,
  subcategory: "status",
  nodeType: `${SERVICE}-status`,
  selector: "Macie2|GetMacieSession|[]",

  async getState(connector, context) {
    const sessionPages = await getOwnState<GetMacieSessionCommandOutput>(
      connector,
      context,
      "GetMacieSession",
    );
    if (sessionPages.length === 0) {
      return [];
    }
    const sessionError = sessionPages.find(
      (page) => page._error != null,
    )?._error;
    const session = sessionPages.find((page) => page._result != null)?._result;

    const administrator = (
      await getResult<GetAdministratorAccountCommandOutput>(
        connector,
        context,
        "GetAdministratorAccount",
      )
    )?.administrator;
    const adminAccounts = successfulPages(
      await getOwnState<ListOrganizationAdminAccountsCommandOutput>(
        connector,
        context,
        "ListOrganizationAdminAccounts",
      ),
    );
    const organizationConfiguration =
      await getResult<DescribeOrganizationConfigurationCommandOutput>(
        connector,
        context,
        "DescribeOrganizationConfiguration",
      );
    const members = successfulPages(
      await getOwnState<ListMembersCommandOutput>(
        connector,
        context,
        "ListMembers",
      ),
    );
    const s3Destination = (
      await getResult<GetClassificationExportConfigurationCommandOutput>(
        connector,
        context,
        "GetClassificationExportConfiguration",
      )
    )?.configuration?.s3Destination;
    const automatedDiscovery =
      await getResult<GetAutomatedDiscoveryConfigurationCommandOutput>(
        connector,
        context,
        "GetAutomatedDiscoveryConfiguration",
      );

    return [
      {
        $metadata: sessionPages[0]._metadata,
        serviceStatus: {
          service: SERVICE,
          ...mapStatus(sessionError, session),
          administratorAccountId: administrator?.accountId,
          relationshipStatus: administrator?.relationshipStatus,
          failedCalls: await getFailedCalls(connector, context),
        },
        macie2: {
          sessionStatus: session?.status,
          findingPublishingFrequency: session?.findingPublishingFrequency,
          serviceRole: session?.serviceRole,
          createdAt: tryNormalizeDateEpoch(session?.createdAt),
          updatedAt: tryNormalizeDateEpoch(session?.updatedAt),
          organizationAdminAccounts: adminAccounts?.flatMap((page) =>
            (page.adminAccounts ?? []).map((account) => ({
              accountId: account.accountId,
              status: account.status,
            })),
          ),
          organizationConfiguration:
            organizationConfiguration != null
              ? {
                  autoEnable: organizationConfiguration.autoEnable,
                  maxAccountLimitReached:
                    organizationConfiguration.maxAccountLimitReached,
                }
              : undefined,
          members: members?.flatMap((page) =>
            (page.members ?? []).map((member) => ({
              accountId: member.accountId,
              relationshipStatus: member.relationshipStatus,
              administratorAccountId:
                member.administratorAccountId ?? member.masterAccountId,
              invitedAt: tryNormalizeDateEpoch(member.invitedAt),
              updatedAt: tryNormalizeDateEpoch(member.updatedAt),
            })),
          ),
          classificationExportDestination:
            s3Destination != null
              ? {
                  bucketName: s3Destination.bucketName,
                  keyPrefix: s3Destination.keyPrefix,
                  kmsKeyArn: s3Destination.kmsKeyArn,
                }
              : undefined,
          automatedDiscoveryStatus: automatedDiscovery?.status,
        },
      },
    ];
  },

  translate(val) {
    return [val];
  },

  components: {
    $metadata(val) {
      return {
        version: MacieStatusEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },
    $source() {
      return { command: MacieStatusEntity.command };
    },
    $graph(val) {
      return {
        id: `${val.$metadata.account}-${val.$metadata.region}-${SERVICE}`,
        label: `Macie (${val.$metadata.region})`,
        nodeClass: "informational",
        nodeType: MacieStatusEntity.nodeType,
        parent: val.$metadata.account,
      };
    },
    tenant(val) {
      return {
        provider: MacieStatusEntity.provider,
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
        name: `Macie (${val.$metadata.region})`,
        category: MacieStatusEntity.category,
        subcategory: MacieStatusEntity.subcategory,
      };
    },
    serviceStatus(val) {
      return val.serviceStatus;
    },
    macie2(val) {
      return val.macie2;
    },
  },
};

export type GraphState = MacieStatusState;
