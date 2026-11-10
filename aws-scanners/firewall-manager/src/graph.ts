import type {
  AdminAccountSummary,
  GetAdminAccountCommandOutput,
  GetAdminScopeCommandInput,
  GetAdminScopeCommandOutput,
  GetPolicyCommandInput,
  GetPolicyCommandOutput,
  ListAdminAccountsForOrganizationCommandOutput,
  ListAdminsManagingAccountCommandOutput,
  ListPoliciesCommandOutput,
  Policy,
  PolicySummary,
} from "@aws-sdk/client-fms";
import { evaluateSelector } from "@infrascan/core";
import type {
  AwsContext,
  BaseState,
  CommandCallMetadata,
  Connector,
  Serialized,
  TranslatedEntity,
} from "@infrascan/shared-types";
import type { CallState } from "./state";

export const SERVICE = "fms";

/**
 * Every call this scanner makes. A failure of any of them is listed on the status node.
 */
export const CALLS = [
  "GetAdminAccount",
  "ListAdminAccountsForOrganization",
  "ListAdminsManagingAccount",
  "GetAdminScope",
  "ListPolicies",
  "GetPolicy",
] as const;

async function getOwnState<O, I = unknown>(
  connector: Connector,
  context: AwsContext,
  functionName: string,
): Promise<Serialized<CallState<O, I>>[]> {
  const state = await evaluateSelector<Serialized<CallState<O, I>>>(
    context.account,
    context.region,
    `FMS|${functionName}|[]`,
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

export interface AdminScopeDetails {
  /** `GetAdminScope` status, verbatim */
  status?: string;
  accounts?: {
    accounts: string[];
    allAccountsEnabled?: boolean;
    excludeSpecifiedAccounts?: boolean;
  };
  /** OU ids as AWS returns them */
  organizationalUnits?: {
    organizationalUnits: string[];
    allOrganizationalUnitsEnabled?: boolean;
    excludeSpecifiedOrganizationalUnits?: boolean;
  };
  regions?: { regions: string[]; allRegionsEnabled?: boolean };
  policyTypes?: { policyTypes: string[]; allPolicyTypesEnabled?: boolean };
}

export interface OrganizationAdminDetails {
  adminAccount?: string;
  defaultAdmin?: boolean;
  status?: string;
  scope?: AdminScopeDetails;
}

export interface FmsStatusDetails {
  /** `GetAdminAccount`: the organization's default Firewall Manager administrator */
  adminAccount?: string;
  roleStatus?: string;
  /** `ListAdminsManagingAccount`: administrators whose scope includes this account */
  adminsManagingAccount: string[];
  /** `ListAdminAccountsForOrganization` and `GetAdminScope`: only listed from the management account */
  organizationAdmins: OrganizationAdminDetails[];
}

export type StatusState = BaseState & {
  serviceStatus: ServiceStatus;
  fms: { status: FmsStatusDetails };
};

interface StatusItem extends Item {
  serviceStatus: ServiceStatus;
  details: FmsStatusDetails;
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

async function getOrganizationAdmins(
  connector: Connector,
  context: AwsContext,
): Promise<OrganizationAdminDetails[]> {
  const scopes = new Map<string, Serialized<GetAdminScopeCommandOutput>>();
  for (const page of await getOwnState<
    GetAdminScopeCommandOutput,
    GetAdminScopeCommandInput
  >(connector, context, "GetAdminScope")) {
    if (page._parameters?.AdminAccount != null && page._result != null) {
      scopes.set(page._parameters.AdminAccount, page._result);
    }
  }
  const admins: Serialized<AdminAccountSummary>[] = (
    await getOwnState<ListAdminAccountsForOrganizationCommandOutput>(
      connector,
      context,
      "ListAdminAccountsForOrganization",
    )
  ).flatMap((page) => page._result?.AdminAccounts ?? []);
  return admins.map((admin) => {
    const scope = scopes.get(admin.AdminAccount ?? "");
    const adminScope = scope?.AdminScope;
    return {
      adminAccount: admin.AdminAccount,
      defaultAdmin: admin.DefaultAdmin,
      status: admin.Status,
      scope:
        scope != null
          ? {
              status: scope.Status,
              accounts: adminScope?.AccountScope
                ? {
                    accounts: adminScope.AccountScope.Accounts ?? [],
                    allAccountsEnabled:
                      adminScope.AccountScope.AllAccountsEnabled,
                    excludeSpecifiedAccounts:
                      adminScope.AccountScope.ExcludeSpecifiedAccounts,
                  }
                : undefined,
              organizationalUnits: adminScope?.OrganizationalUnitScope
                ? {
                    organizationalUnits:
                      adminScope.OrganizationalUnitScope.OrganizationalUnits ??
                      [],
                    allOrganizationalUnitsEnabled:
                      adminScope.OrganizationalUnitScope
                        .AllOrganizationalUnitsEnabled,
                    excludeSpecifiedOrganizationalUnits:
                      adminScope.OrganizationalUnitScope
                        .ExcludeSpecifiedOrganizationalUnits,
                  }
                : undefined,
              regions: adminScope?.RegionScope
                ? {
                    regions: adminScope.RegionScope.Regions ?? [],
                    allRegionsEnabled: adminScope.RegionScope.AllRegionsEnabled,
                  }
                : undefined,
              policyTypes: adminScope?.PolicyTypeScope
                ? {
                    policyTypes: adminScope.PolicyTypeScope.PolicyTypes ?? [],
                    allPolicyTypesEnabled:
                      adminScope.PolicyTypeScope.AllPolicyTypesEnabled,
                  }
                : undefined,
            }
          : undefined,
    };
  });
}

export const StatusEntity: TranslatedEntity<
  StatusState,
  StatusItem,
  StatusItem
> = {
  version: "0.1.0",
  debugLabel: "fms-status",
  provider: "aws",
  command: "GetAdminAccount",
  category: SERVICE,
  subcategory: "status",
  nodeType: `${SERVICE}-status`,
  selector: "FMS|GetAdminAccount|[]",

  async getState(connector, context) {
    const adminPages = await getOwnState<GetAdminAccountCommandOutput>(
      connector,
      context,
      "GetAdminAccount",
    );
    if (adminPages.length === 0) {
      return [];
    }
    const adminPage = adminPages[0];
    const adminAccount = adminPage._result?.AdminAccount;
    const adminsManagingAccount = [
      ...new Set(
        (
          await getOwnState<ListAdminsManagingAccountCommandOutput>(
            connector,
            context,
            "ListAdminsManagingAccount",
          )
        ).flatMap((page) => page._result?.AdminAccounts ?? []),
      ),
    ];
    const organizationAdmins = await getOrganizationAdmins(connector, context);

    let status: ServiceStatus["status"];
    let statusReason: string | undefined;
    if (
      adminAccount != null ||
      adminsManagingAccount.length > 0 ||
      organizationAdmins.length > 0
    ) {
      status = "enabled";
    } else if (
      adminPage._result != null ||
      // GetAdminAccount answers ResourceNotFoundException when no Firewall Manager administrator has been associated
      // with the organization: that is AWS reporting none, not a failure to look.
      adminPage._error?.name === "ResourceNotFoundException"
    ) {
      status = "disabled";
      statusReason = adminPage._error?.name;
    } else {
      status = "unknown";
      statusReason = adminPage._error?.name;
    }

    return [
      {
        $metadata: adminPage._metadata,
        serviceStatus: {
          service: SERVICE,
          status,
          statusReason,
          // The default administrator, or the single administrator managing this account when the default cannot be read.
          administratorAccountId:
            adminAccount ??
            (adminsManagingAccount.length === 1
              ? adminsManagingAccount[0]
              : undefined),
          relationshipStatus: adminPage._result?.RoleStatus,
          failedCalls: await getFailedCalls(connector, context),
        },
        details: {
          adminAccount,
          roleStatus: adminPage._result?.RoleStatus,
          adminsManagingAccount,
          organizationAdmins,
        },
      },
    ];
  },

  translate(val) {
    return [val];
  },

  components: {
    $metadata: metadata("0.1.0"),
    $source: source("GetAdminAccount"),
    $graph(val) {
      return {
        id: `${val.$metadata.account}-${val.$metadata.region}-${SERVICE}`,
        label: `Firewall Manager (${val.$metadata.region})`,
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
        name: `Firewall Manager (${val.$metadata.region})`,
        category: StatusEntity.category,
        subcategory: StatusEntity.subcategory,
      };
    },
    serviceStatus(val) {
      return val.serviceStatus;
    },
    fms(val) {
      return { status: val.details };
    },
  },
};

/* -------------------------------------------------------------------------- */
/*                                  Policies                                  */
/* -------------------------------------------------------------------------- */

export interface PolicyScopeMap {
  /** Account ids */
  accounts: string[];
  /** OU ids as AWS returns them */
  organizationalUnits: string[];
}

export interface PolicyDetails {
  arn?: string;
  id?: string;
  name?: string;
  description?: string;
  /** `PolicyStatus`, verbatim */
  status?: string;
  securityServiceType?: string;
  resourceType?: string;
  resourceTypeList: string[];
  remediationEnabled?: boolean;
  deleteUnusedFMManagedResources?: boolean;
  /** `IncludeMap`, when the policy has one */
  includeMap?: PolicyScopeMap;
  /** `ExcludeMap`, when the policy has one */
  excludeMap?: PolicyScopeMap;
  resourceTags: { key?: string; value?: string }[];
  excludeResourceTags?: boolean;
  resourceTagLogicalOperator?: string;
}

export type PolicyState = BaseState & { fms: { policy: PolicyDetails } };

interface PolicyItem extends Item {
  arn: string;
  summary?: Serialized<PolicySummary>;
  policy?: Serialized<Policy>;
}

function scopeMap(
  map?: Partial<Record<string, string[]>>,
): PolicyScopeMap | undefined {
  if (map == null) {
    return undefined;
  }
  return {
    accounts: map.ACCOUNT ?? [],
    organizationalUnits: map.ORG_UNIT ?? [],
  };
}

export const PolicyEntity: TranslatedEntity<
  PolicyState,
  PolicyItem,
  PolicyItem
> = {
  version: "0.1.0",
  debugLabel: "fms-policy",
  provider: "aws",
  command: "ListPolicies",
  category: SERVICE,
  subcategory: "policy",
  nodeType: `${SERVICE}-policy`,
  selector: "FMS|ListPolicies|[]",

  async getState(connector, context) {
    const policies = new Map<string, Serialized<Policy>>();
    for (const page of await getOwnState<
      GetPolicyCommandOutput,
      GetPolicyCommandInput
    >(connector, context, "GetPolicy")) {
      if (page._parameters?.PolicyId != null && page._result?.Policy != null) {
        policies.set(page._parameters.PolicyId, page._result.Policy);
      }
    }
    const pages = await getOwnState<ListPoliciesCommandOutput>(
      connector,
      context,
      "ListPolicies",
    );
    const seen = new Set<string>();
    return pages.flatMap((page) =>
      (page._result?.PolicyList ?? [])
        .filter((summary) => {
          if (summary.PolicyArn == null || seen.has(summary.PolicyArn)) {
            return false;
          }
          seen.add(summary.PolicyArn);
          return true;
        })
        .map((summary) => ({
          $metadata: page._metadata,
          arn: summary.PolicyArn!,
          summary,
          policy: policies.get(summary.PolicyId ?? ""),
        })),
    );
  },

  translate(val) {
    return [val];
  },

  components: {
    $metadata: metadata("0.1.0"),
    $source: source("GetPolicy"),
    $graph(val) {
      return {
        id: val.arn,
        label: val.policy?.PolicyName ?? val.summary?.PolicyName ?? val.arn,
        nodeClass: "informational",
        nodeType: PolicyEntity.nodeType,
        parent: val.$metadata.account,
      };
    },
    tenant(val) {
      return {
        provider: PolicyEntity.provider,
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
        name: val.policy?.PolicyName ?? val.summary?.PolicyName ?? val.arn,
        category: PolicyEntity.category,
        subcategory: PolicyEntity.subcategory,
        description: val.policy?.PolicyDescription,
      };
    },
    fms(val) {
      const { policy, summary } = val;
      return {
        policy: {
          arn: val.arn,
          id: policy?.PolicyId ?? summary?.PolicyId,
          name: policy?.PolicyName ?? summary?.PolicyName,
          description: policy?.PolicyDescription,
          status: policy?.PolicyStatus ?? summary?.PolicyStatus,
          securityServiceType:
            policy?.SecurityServicePolicyData?.Type ??
            summary?.SecurityServiceType,
          resourceType: policy?.ResourceType ?? summary?.ResourceType,
          resourceTypeList: policy?.ResourceTypeList ?? [],
          remediationEnabled:
            policy?.RemediationEnabled ?? summary?.RemediationEnabled,
          deleteUnusedFMManagedResources:
            policy?.DeleteUnusedFMManagedResources ??
            summary?.DeleteUnusedFMManagedResources,
          includeMap: scopeMap(policy?.IncludeMap),
          excludeMap: scopeMap(policy?.ExcludeMap),
          resourceTags: (policy?.ResourceTags ?? []).map((tag) => ({
            key: tag.Key,
            value: tag.Value,
          })),
          excludeResourceTags: policy?.ExcludeResourceTags,
          resourceTagLogicalOperator: policy?.ResourceTagLogicalOperator,
        },
      };
    },
  },
};

export type GraphState = StatusState | PolicyState;
