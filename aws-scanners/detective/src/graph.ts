import type {
  Administrator,
  DescribeOrganizationConfigurationCommandInput,
  DescribeOrganizationConfigurationCommandOutput,
  Graph,
  ListDatasourcePackagesCommandInput,
  ListDatasourcePackagesCommandOutput,
  ListGraphsCommandOutput,
  ListInvitationsCommandOutput,
  ListMembersCommandInput,
  ListMembersCommandOutput,
  ListOrganizationAdminAccountsCommandOutput,
  MemberDetail,
} from "@aws-sdk/client-detective";
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
export const DETECTIVE_CALLS = [
  "ListGraphs",
  "ListMembers",
  "DescribeOrganizationConfiguration",
  "ListDatasourcePackages",
  "ListOrganizationAdminAccounts",
  "ListInvitations",
] as const;

/**
 * The calls that decide `serviceStatus.status`.
 */
const STATUS_CALLS = ["ListGraphs", "ListInvitations"] as const;

async function getOwnState<O, I = unknown>(
  connector: Connector,
  context: AwsContext,
  functionName: string,
): Promise<Serialized<CallState<O, I>>[]> {
  const state = await evaluateSelector<Serialized<CallState<O, I>>>(
    context.account,
    context.region,
    `Detective|${functionName}|[]`,
    connector,
  );
  return state ?? [];
}

export interface DetectiveMember {
  accountId?: string;
  administratorAccountId?: string;
  /** Membership status, verbatim (e.g. `ENABLED`, `INVITED`, `ACCEPTED_BUT_DISABLED`) */
  status?: string;
  /** AWS's reason when the membership is `ACCEPTED_BUT_DISABLED` */
  disabledReason?: string;
  /** `INVITATION` or `ORGANIZATION` */
  invitationType?: string;
  invitedAt?: number | null;
  updatedAt?: number | null;
  /** Ingest state of each data source package for this member */
  datasourcePackageIngestStates: Record<string, string>;
}

export interface DetectiveGraph {
  arn: string;
  createdAt?: number | null;
  /** Whether new organization accounts are enabled as members automatically. Only set for an organization graph. */
  organizationAutoEnable?: boolean;
  members: DetectiveMember[];
  /** Data source packages of the graph and their ingest state */
  datasourcePackages: { datasourcePackage: string; ingestState?: string }[];
}

export interface DetectiveMembership {
  graphArn?: string;
  administratorAccountId?: string;
  status?: string;
  disabledReason?: string;
  invitationType?: string;
  invitedAt?: number | null;
  updatedAt?: number | null;
}

export interface DetectiveDetails {
  /** Behavior graphs the scanned account is the administrator of */
  graphs: DetectiveGraph[];
  /** Behavior graphs the scanned account is invited to or a member of */
  memberships: DetectiveMembership[];
  /**
   * The organization's Detective administrator accounts. Only readable from the organization management account;
   * absent when the call failed.
   */
  organizationAdminAccounts?: {
    accountId?: string;
    graphArn?: string;
    delegatedAt?: number | null;
  }[];
}

export type DetectiveStatusState = BaseState & {
  serviceStatus: ServiceStatus;
  detective: DetectiveDetails;
};

interface StatusItem {
  $metadata: CommandCallMetadata;
  serviceStatus: ServiceStatus;
  detective: DetectiveDetails;
}

function toMember(member: Serialized<MemberDetail>): DetectiveMember {
  return {
    accountId: member.AccountId,
    administratorAccountId: member.AdministratorId ?? member.MasterId,
    status: member.Status,
    disabledReason: member.DisabledReason,
    invitationType: member.InvitationType,
    invitedAt: tryNormalizeDateEpoch(member.InvitedTime),
    updatedAt: tryNormalizeDateEpoch(member.UpdatedTime),
    datasourcePackageIngestStates: {
      ...(member.DatasourcePackageIngestStates ?? {}),
    },
  };
}

function toMembership(member: Serialized<MemberDetail>): DetectiveMembership {
  return {
    graphArn: member.GraphArn,
    administratorAccountId: member.AdministratorId ?? member.MasterId,
    status: member.Status,
    disabledReason: member.DisabledReason,
    invitationType: member.InvitationType,
    invitedAt: tryNormalizeDateEpoch(member.InvitedTime),
    updatedAt: tryNormalizeDateEpoch(member.UpdatedTime),
  };
}

/**
 * Groups the per-graph pages of a call by the `GraphArn` they were requested with.
 */
function byGraph<O, I extends { GraphArn?: string }>(
  pages: Serialized<CallState<O, I>>[],
): Map<string, Serialized<O>[]> {
  const grouped = new Map<string, Serialized<O>[]>();
  for (const page of pages) {
    const graphArn = page._parameters?.GraphArn;
    if (graphArn != null && page._result != null) {
      const existing = grouped.get(graphArn) ?? [];
      existing.push(page._result);
      grouped.set(graphArn, existing);
    }
  }
  return grouped;
}

async function getGraphs(
  connector: Connector,
  context: AwsContext,
): Promise<DetectiveGraph[]> {
  const graphs = (
    await getOwnState<ListGraphsCommandOutput>(connector, context, "ListGraphs")
  ).flatMap((page) => page._result?.GraphList ?? []);
  const members = byGraph(
    await getOwnState<ListMembersCommandOutput, ListMembersCommandInput>(
      connector,
      context,
      "ListMembers",
    ),
  );
  const configuration = byGraph(
    await getOwnState<
      DescribeOrganizationConfigurationCommandOutput,
      DescribeOrganizationConfigurationCommandInput
    >(connector, context, "DescribeOrganizationConfiguration"),
  );
  const packages = byGraph(
    await getOwnState<
      ListDatasourcePackagesCommandOutput,
      ListDatasourcePackagesCommandInput
    >(connector, context, "ListDatasourcePackages"),
  );
  const seen = new Set<string>();
  return graphs
    .filter((graph): graph is Serialized<Graph> & { Arn: string } => {
      if (graph.Arn == null || seen.has(graph.Arn)) {
        return false;
      }
      seen.add(graph.Arn);
      return true;
    })
    .map((graph) => ({
      arn: graph.Arn,
      createdAt: tryNormalizeDateEpoch(graph.CreatedTime),
      organizationAutoEnable: configuration.get(graph.Arn)?.[0]?.AutoEnable,
      members: (members.get(graph.Arn) ?? [])
        .flatMap((page) => page.MemberDetails ?? [])
        .map(toMember),
      datasourcePackages: (packages.get(graph.Arn) ?? []).flatMap((page) =>
        Object.entries(page.DatasourcePackages ?? {}).map(
          ([datasourcePackage, detail]) => ({
            datasourcePackage,
            ingestState: detail.DatasourcePackageIngestState,
          }),
        ),
      ),
    }));
}

/**
 * Picks the membership that describes the account's administrator relationship: an enabled one if there is one,
 * otherwise the first one AWS listed.
 */
function primaryMembership(
  memberships: DetectiveMembership[],
): DetectiveMembership | undefined {
  return (
    memberships.find((membership) => membership.status === "ENABLED") ??
    memberships[0]
  );
}

/**
 * Status mapping for Detective:
 * - `enabled`: `ListGraphs` returned a behavior graph (the account is an administrator), or `ListInvitations` returned
 *   a membership whose status is `ENABLED`.
 * - `unknown`: neither of the above, and `ListGraphs` or `ListInvitations` failed. `statusReason` is the error name.
 *   No exception is mapped to `disabled`: a denied `ListGraphs` does not prove the account is not an administrator.
 * - `disabled`: both calls succeeded and neither shows a graph or an enabled membership. `statusReason` carries the
 *   membership's `DisabledReason` when AWS gives one (e.g. `VOLUME_TOO_HIGH` for `ACCEPTED_BUT_DISABLED`).
 */
function getStatus(
  graphs: DetectiveGraph[],
  membership: DetectiveMembership | undefined,
  statusErrors: string[],
): Pick<ServiceStatus, "status" | "statusReason"> {
  if (graphs.length > 0 || membership?.status === "ENABLED") {
    return { status: "enabled" };
  }
  if (statusErrors.length > 0) {
    return { status: "unknown", statusReason: statusErrors[0] };
  }
  return { status: "disabled", statusReason: membership?.disabledReason };
}

export const DetectiveStatusEntity: TranslatedEntity<
  DetectiveStatusState,
  StatusItem,
  StatusItem
> = {
  version: "0.1.0",
  debugLabel: "detective-status",
  provider: "aws",
  command: "ListGraphs",
  category: "detective",
  subcategory: "status",
  nodeType: "detective-status",
  selector: "Detective|ListGraphs|[]",

  async getState(connector, context) {
    const statusPages = [];
    const statusErrors: string[] = [];
    for (const functionName of STATUS_CALLS) {
      const pages = await getOwnState(connector, context, functionName);
      statusPages.push(...pages);
      const failed = pages.find((page) => page._error != null);
      if (failed?._error != null) {
        statusErrors.push(failed._error.name);
      }
    }
    if (statusPages.length === 0) {
      return [];
    }

    const failedCalls: Record<string, string> = {};
    for (const functionName of DETECTIVE_CALLS) {
      const failed = (await getOwnState(connector, context, functionName)).find(
        (page) => page._error != null,
      );
      if (failed?._error != null) {
        failedCalls[functionName] = failed._error.name;
      }
    }

    const graphs = await getGraphs(connector, context);
    const memberships = (
      await getOwnState<ListInvitationsCommandOutput>(
        connector,
        context,
        "ListInvitations",
      )
    )
      .flatMap((page) => page._result?.Invitations ?? [])
      .map(toMembership);
    const adminPages =
      await getOwnState<ListOrganizationAdminAccountsCommandOutput>(
        connector,
        context,
        "ListOrganizationAdminAccounts",
      );
    const organizationAdminAccounts =
      adminPages.length > 0 && adminPages.every((page) => page._error == null)
        ? adminPages
            .flatMap((page) => page._result?.Administrators ?? [])
            .map((admin: Serialized<Administrator>) => ({
              accountId: admin.AccountId,
              graphArn: admin.GraphArn,
              delegatedAt: tryNormalizeDateEpoch(admin.DelegationTime),
            }))
        : undefined;

    const membership = primaryMembership(memberships);
    return [
      {
        $metadata: statusPages[0]._metadata,
        serviceStatus: {
          service: "detective",
          ...getStatus(graphs, membership, statusErrors),
          administratorAccountId: membership?.administratorAccountId,
          relationshipStatus: membership?.status,
          failedCalls,
        },
        detective: { graphs, memberships, organizationAdminAccounts },
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
      return { command: "ListGraphs" };
    },
    $graph(val) {
      return {
        id: `${val.$metadata.account}-${val.$metadata.region}-detective`,
        label: `Detective (${val.$metadata.region})`,
        nodeClass: "informational",
        nodeType: DetectiveStatusEntity.nodeType,
        parent: val.$metadata.account,
      };
    },
    tenant(val) {
      return {
        provider: DetectiveStatusEntity.provider,
        partition: val.$metadata.partition,
        tenantId: val.$metadata.account,
      };
    },
    location(val) {
      return { code: val.$metadata.region };
    },
    resource(val) {
      return {
        id: `${val.$metadata.account}-${val.$metadata.region}-detective`,
        name: `Detective (${val.$metadata.region})`,
        category: DetectiveStatusEntity.category,
        subcategory: DetectiveStatusEntity.subcategory,
      };
    },
    serviceStatus(val) {
      return val.serviceStatus;
    },
    detective(val) {
      return val.detective;
    },
  },
};

export type GraphState = DetectiveStatusState;
