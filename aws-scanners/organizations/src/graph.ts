import type {
  Account,
  DelegatedService,
  DescribeOrganizationCommandOutput,
  DescribePolicyCommandInput,
  DescribePolicyCommandOutput,
  DescribeResourcePolicyCommandOutput,
  EnabledServicePrincipal,
  ListAccountsForParentCommandInput,
  ListAccountsForParentCommandOutput,
  ListAWSServiceAccessForOrganizationCommandOutput,
  ListDelegatedServicesForAccountCommandInput,
  ListDelegatedServicesForAccountCommandOutput,
  ListOrganizationalUnitsForParentCommandInput,
  ListOrganizationalUnitsForParentCommandOutput,
  ListPoliciesCommandOutput,
  ListRootsCommandOutput,
  ListTagsForResourceCommandInput,
  ListTagsForResourceCommandOutput,
  Organization,
  OrganizationalUnit,
  PolicySummary,
  Root,
} from "@aws-sdk/client-organizations";
import { evaluateSelector, tryNormalizeDateEpoch } from "@infrascan/core";
import type {
  AwsContext,
  BaseState,
  CommandCallMetadata,
  Connector,
  KVPair,
  Serialized,
  TranslatedEntity,
} from "@infrascan/shared-types";
import {
  getObservedFrom,
  isReporter,
  organizationArn,
  parseArn,
  type ObservedFrom,
} from "./reporter";
import type { CallState } from "./state";

/**
 * Calls whose failure is reported on the organization node, so a consumer can tell what the scanned account could not
 * see (e.g. `AccessDeniedException` on `ListRoots` from a member account).
 */
export const ORGANIZATION_CALLS = [
  "DescribeOrganization",
  "ListRoots",
  "ListOrganizationalUnitsForParent",
  "ListAccountsForParent",
  "ListPolicies",
  "DescribePolicy",
  "ListTargetsForPolicy",
  "ListDelegatedAdministrators",
  "ListDelegatedServicesForAccount",
  "ListAWSServiceAccessForOrganization",
  "DescribeResourcePolicy",
  "ListTagsForResource",
] as const;

async function getOwnState<O, I = unknown>(
  connector: Connector,
  context: AwsContext,
  functionName: string,
): Promise<Serialized<CallState<O, I>>[]> {
  const state = await evaluateSelector<Serialized<CallState<O, I>>>(
    context.account,
    context.region,
    `Organizations|${functionName}|[]`,
    connector,
  );
  return state ?? [];
}

async function getTags(
  connector: Connector,
  context: AwsContext,
): Promise<Map<string, KVPair[]>> {
  const state = await getOwnState<
    ListTagsForResourceCommandOutput,
    ListTagsForResourceCommandInput
  >(connector, context, "ListTagsForResource");
  const tags = new Map<string, KVPair[]>();
  for (const page of state) {
    const resourceId = page._parameters?.ResourceId;
    if (resourceId != null && page._result?.Tags != null) {
      const existing = tags.get(resourceId) ?? [];
      existing.push(
        ...page._result.Tags.map((tag) => ({ key: tag.Key, value: tag.Value })),
      );
      tags.set(resourceId, existing);
    }
  }
  return tags;
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
/*                                Organization                                */
/* -------------------------------------------------------------------------- */

export interface OrganizationDetails {
  id?: string;
  arn?: string;
  featureSet?: string;
  managementAccountId?: string;
  managementAccountEmail?: string;
  availablePolicyTypes: { type?: string; status?: string }[];
  trustedAccess: { servicePrincipal?: string; enabledAt?: number | null }[];
  observedFrom: ObservedFrom;
  /**
   * Organizations calls that failed for the scanned account, keyed by call, valued by error name.
   */
  failedCalls: Record<string, string>;
}

export type OrganizationState = BaseState & {
  organizations: { organization: OrganizationDetails };
};

interface OrganizationItem extends Item {
  organization: Serialized<Organization>;
  trustedAccess: Serialized<EnabledServicePrincipal>[];
  resourcePolicy?: string;
  observedFrom: ObservedFrom;
  failedCalls: Record<string, string>;
}

export const OrganizationEntity: TranslatedEntity<
  OrganizationState,
  OrganizationItem,
  OrganizationItem
> = {
  version: "0.1.0",
  debugLabel: "organizations-organization",
  provider: "aws",
  command: "DescribeOrganization",
  category: "organizations",
  subcategory: "organization",
  nodeType: "organizations-organization",
  selector: "Organizations|DescribeOrganization|[]",

  async getState(connector, context) {
    if (!(await isReporter(connector, context, false))) {
      return [];
    }
    const describe = await getOwnState<DescribeOrganizationCommandOutput>(
      connector,
      context,
      "DescribeOrganization",
    );
    const page = describe.find((entry) => entry._result?.Organization != null);
    if (page?._result?.Organization == null) {
      return [];
    }
    const trustedAccess = (
      await getOwnState<ListAWSServiceAccessForOrganizationCommandOutput>(
        connector,
        context,
        "ListAWSServiceAccessForOrganization",
      )
    ).flatMap((entry) => entry._result?.EnabledServicePrincipals ?? []);
    const resourcePolicy = (
      await getOwnState<DescribeResourcePolicyCommandOutput>(
        connector,
        context,
        "DescribeResourcePolicy",
      )
    ).find((entry) => entry._result?.ResourcePolicy != null)?._result
      ?.ResourcePolicy?.Content;
    const failedCalls: Record<string, string> = {};
    for (const functionName of ORGANIZATION_CALLS) {
      const failed = (await getOwnState(connector, context, functionName)).find(
        (entry) => entry._error != null,
      );
      if (failed?._error != null) {
        failedCalls[functionName] = failed._error.name;
      }
    }
    return [
      {
        $metadata: page._metadata,
        organization: page._result.Organization,
        trustedAccess,
        resourcePolicy,
        observedFrom: await getObservedFrom(connector, context),
        failedCalls,
      },
    ];
  },

  translate(val) {
    return [val];
  },

  components: {
    $metadata: metadata("0.1.0"),
    $source: source("DescribeOrganization"),
    $graph(val) {
      return {
        id: val.organization.Arn!,
        label: val.organization.Id!,
        nodeClass: "informational",
        nodeType: OrganizationEntity.nodeType,
      };
    },
    tenant(val) {
      return {
        provider: OrganizationEntity.provider,
        partition: val.$metadata.partition,
        tenantId: val.organization.MasterAccountId ?? val.$metadata.account,
      };
    },
    resource(val) {
      return {
        id: val.organization.Arn!,
        name: val.organization.Id!,
        category: OrganizationEntity.category,
        subcategory: OrganizationEntity.subcategory,
        // The resource policy that delegates Organizations itself, as returned by AWS.
        policy: val.resourcePolicy,
      };
    },
    organizations(val) {
      return {
        organization: {
          id: val.organization.Id,
          arn: val.organization.Arn,
          featureSet: val.organization.FeatureSet,
          managementAccountId: val.organization.MasterAccountId,
          managementAccountEmail: val.organization.MasterAccountEmail,
          availablePolicyTypes: (
            val.organization.AvailablePolicyTypes ?? []
          ).map(({ Type, Status }) => ({ type: Type, status: Status })),
          trustedAccess: val.trustedAccess.map((principal) => ({
            servicePrincipal: principal.ServicePrincipal,
            enabledAt: tryNormalizeDateEpoch(principal.DateEnabled),
          })),
          observedFrom: val.observedFrom,
          failedCalls: val.failedCalls,
        },
      };
    },
  },
};

/* -------------------------------------------------------------------------- */
/*                                    Roots                                   */
/* -------------------------------------------------------------------------- */

export interface RootDetails {
  id?: string;
  arn?: string;
  name?: string;
  policyTypes: { type?: string; status?: string }[];
}

export type RootState = BaseState & { organizations: { root: RootDetails } };

interface RootItem extends Item {
  root: Serialized<Root>;
  tags: KVPair[];
}

export const RootEntity: TranslatedEntity<RootState, RootItem, RootItem> = {
  version: "0.1.0",
  debugLabel: "organizations-root",
  provider: "aws",
  command: "ListRoots",
  category: "organizations",
  subcategory: "root",
  nodeType: "organizations-root",
  selector: "Organizations|ListRoots|[]",

  async getState(connector, context) {
    if (!(await isReporter(connector, context, true))) {
      return [];
    }
    const tags = await getTags(connector, context);
    const pages = await getOwnState<ListRootsCommandOutput>(
      connector,
      context,
      "ListRoots",
    );
    return pages.flatMap((page) =>
      (page._result?.Roots ?? [])
        .filter((root) => root.Arn != null)
        .map((root) => ({
          $metadata: page._metadata,
          root,
          tags: tags.get(root.Id ?? "") ?? [],
        })),
    );
  },

  translate(val) {
    return [val];
  },

  components: {
    $metadata: metadata("0.1.0"),
    $source: source("ListRoots"),
    $graph(val) {
      return {
        id: val.root.Arn!,
        label: val.root.Name ?? val.root.Id!,
        nodeClass: "informational",
        nodeType: RootEntity.nodeType,
        parent: organizationArn(val.root.Arn!),
      };
    },
    tenant(val) {
      return {
        provider: RootEntity.provider,
        partition: val.$metadata.partition,
        tenantId: parseArn(val.root.Arn!).account,
      };
    },
    resource(val) {
      return {
        id: val.root.Arn!,
        name: val.root.Name ?? val.root.Id!,
        category: RootEntity.category,
        subcategory: RootEntity.subcategory,
      };
    },
    tags(val) {
      return val.tags;
    },
    organizations(val) {
      return {
        root: {
          id: val.root.Id,
          arn: val.root.Arn,
          name: val.root.Name,
          policyTypes: (val.root.PolicyTypes ?? []).map(({ Type, Status }) => ({
            type: Type,
            status: Status,
          })),
        },
      };
    },
  },
};

/* -------------------------------------------------------------------------- */
/*                            Organizational units                            */
/* -------------------------------------------------------------------------- */

/**
 * Maps root and OU ids to ARNs, so a child listed under a `ParentId` can be parented to the parent's node.
 */
async function getParentArns(
  connector: Connector,
  context: AwsContext,
): Promise<Map<string, string>> {
  const arns = new Map<string, string>();
  const roots = await getOwnState<ListRootsCommandOutput>(
    connector,
    context,
    "ListRoots",
  );
  for (const root of roots.flatMap((page) => page._result?.Roots ?? [])) {
    if (root.Id != null && root.Arn != null) {
      arns.set(root.Id, root.Arn);
    }
  }
  const ous = await getOwnState<ListOrganizationalUnitsForParentCommandOutput>(
    connector,
    context,
    "ListOrganizationalUnitsForParent",
  );
  for (const ou of ous.flatMap(
    (page) => page._result?.OrganizationalUnits ?? [],
  )) {
    if (ou.Id != null && ou.Arn != null) {
      arns.set(ou.Id, ou.Arn);
    }
  }
  return arns;
}

export interface OrganizationalUnitDetails {
  id?: string;
  arn?: string;
  name?: string;
  parentId?: string;
}

export type OrganizationalUnitState = BaseState & {
  organizations: { organizationalUnit: OrganizationalUnitDetails };
};

interface OrganizationalUnitItem extends Item {
  organizationalUnit: Serialized<OrganizationalUnit>;
  parentId?: string;
  parentArn?: string;
  tags: KVPair[];
}

export const OrganizationalUnitEntity: TranslatedEntity<
  OrganizationalUnitState,
  OrganizationalUnitItem,
  OrganizationalUnitItem
> = {
  version: "0.1.0",
  debugLabel: "organizations-organizational-unit",
  provider: "aws",
  command: "ListOrganizationalUnitsForParent",
  category: "organizations",
  subcategory: "organizational-unit",
  nodeType: "organizations-organizational-unit",
  selector: "Organizations|ListOrganizationalUnitsForParent|[]",

  async getState(connector, context) {
    if (!(await isReporter(connector, context, true))) {
      return [];
    }
    const tags = await getTags(connector, context);
    const parentArns = await getParentArns(connector, context);
    const pages = await getOwnState<
      ListOrganizationalUnitsForParentCommandOutput,
      ListOrganizationalUnitsForParentCommandInput
    >(connector, context, "ListOrganizationalUnitsForParent");
    return pages.flatMap((page) => {
      const parentId = page._parameters?.ParentId;
      return (page._result?.OrganizationalUnits ?? [])
        .filter((ou) => ou.Arn != null)
        .map((organizationalUnit) => ({
          $metadata: page._metadata,
          organizationalUnit,
          parentId,
          parentArn: parentId != null ? parentArns.get(parentId) : undefined,
          tags: tags.get(organizationalUnit.Id ?? "") ?? [],
        }));
    });
  },

  translate(val) {
    return [val];
  },

  components: {
    $metadata: metadata("0.1.0"),
    $source: source("ListOrganizationalUnitsForParent"),
    $graph(val) {
      return {
        id: val.organizationalUnit.Arn!,
        label: val.organizationalUnit.Name ?? val.organizationalUnit.Id!,
        nodeClass: "informational",
        nodeType: OrganizationalUnitEntity.nodeType,
        parent: val.parentArn,
      };
    },
    tenant(val) {
      return {
        provider: OrganizationalUnitEntity.provider,
        partition: val.$metadata.partition,
        tenantId: parseArn(val.organizationalUnit.Arn!).account,
      };
    },
    resource(val) {
      return {
        id: val.organizationalUnit.Arn!,
        name: val.organizationalUnit.Name ?? val.organizationalUnit.Id!,
        category: OrganizationalUnitEntity.category,
        subcategory: OrganizationalUnitEntity.subcategory,
      };
    },
    tags(val) {
      return val.tags;
    },
    organizations(val) {
      return {
        organizationalUnit: {
          id: val.organizationalUnit.Id,
          arn: val.organizationalUnit.Arn,
          name: val.organizationalUnit.Name,
          parentId: val.parentId,
        },
      };
    },
  },
};

/* -------------------------------------------------------------------------- */
/*                                  Accounts                                  */
/* -------------------------------------------------------------------------- */

export interface AccountDetails {
  id?: string;
  arn?: string;
  name?: string;
  email?: string;
  state?: string;
  status?: string;
  joinedMethod?: string;
  joinedAt?: number | null;
  parentId?: string;
  isManagementAccount: boolean;
  /**
   * Service principals this account is a delegated administrator for.
   */
  delegatedAdministratorFor: {
    servicePrincipal?: string;
    delegationEnabledAt?: number | null;
  }[];
}

export type AccountState = BaseState & {
  organizations: { account: AccountDetails };
};

interface AccountItem extends Item {
  account: Serialized<Account>;
  parentId?: string;
  parentArn?: string;
  delegatedServices: Serialized<DelegatedService>[];
  tags: KVPair[];
}

export const AccountEntity: TranslatedEntity<
  AccountState,
  AccountItem,
  AccountItem
> = {
  version: "0.1.0",
  debugLabel: "organizations-account",
  provider: "aws",
  command: "ListAccountsForParent",
  category: "organizations",
  subcategory: "account",
  nodeType: "organizations-account",
  selector: "Organizations|ListAccountsForParent|[]",

  async getState(connector, context) {
    if (!(await isReporter(connector, context, true))) {
      return [];
    }
    const tags = await getTags(connector, context);
    const parentArns = await getParentArns(connector, context);
    const delegated = await getOwnState<
      ListDelegatedServicesForAccountCommandOutput,
      ListDelegatedServicesForAccountCommandInput
    >(connector, context, "ListDelegatedServicesForAccount");
    const delegatedServices = new Map<string, Serialized<DelegatedService>[]>();
    for (const page of delegated) {
      const accountId = page._parameters?.AccountId;
      if (accountId != null && page._result?.DelegatedServices != null) {
        const existing = delegatedServices.get(accountId) ?? [];
        existing.push(...page._result.DelegatedServices);
        delegatedServices.set(accountId, existing);
      }
    }
    const pages = await getOwnState<
      ListAccountsForParentCommandOutput,
      ListAccountsForParentCommandInput
    >(connector, context, "ListAccountsForParent");
    const seen = new Set<string>();
    return pages.flatMap((page) => {
      const parentId = page._parameters?.ParentId;
      return (page._result?.Accounts ?? [])
        .filter((account) => {
          if (account.Id == null || seen.has(account.Id)) {
            return false;
          }
          seen.add(account.Id);
          return true;
        })
        .map((account) => ({
          $metadata: page._metadata,
          account,
          parentId,
          parentArn: parentId != null ? parentArns.get(parentId) : undefined,
          delegatedServices: delegatedServices.get(account.Id!) ?? [],
          tags: tags.get(account.Id!) ?? [],
        }));
    });
  },

  translate(val) {
    return [val];
  },

  components: {
    $metadata: metadata("0.1.0"),
    $source: source("ListAccountsForParent"),
    $graph(val) {
      return {
        id: val.account.Id!,
        label: val.account.Name ?? val.account.Id!,
        nodeClass: "informational",
        nodeType: AccountEntity.nodeType,
        parent: val.parentArn,
      };
    },
    tenant(val) {
      return {
        provider: AccountEntity.provider,
        partition: val.$metadata.partition,
        tenantId: val.account.Id!,
      };
    },
    resource(val) {
      return {
        id: val.account.Id!,
        name: val.account.Name ?? val.account.Id!,
        category: AccountEntity.category,
        subcategory: AccountEntity.subcategory,
      };
    },
    tags(val) {
      return val.tags;
    },
    organizations(val) {
      const managementAccountId =
        val.account.Arn != null ? parseArn(val.account.Arn).account : undefined;
      return {
        account: {
          id: val.account.Id,
          arn: val.account.Arn,
          name: val.account.Name,
          email: val.account.Email,
          state: val.account.State,
          status: val.account.Status,
          joinedMethod: val.account.JoinedMethod,
          joinedAt: tryNormalizeDateEpoch(val.account.JoinedTimestamp),
          parentId: val.parentId,
          isManagementAccount: val.account.Id === managementAccountId,
          delegatedAdministratorFor: val.delegatedServices.map((service) => ({
            servicePrincipal: service.ServicePrincipal,
            delegationEnabledAt: tryNormalizeDateEpoch(
              service.DelegationEnabledDate,
            ),
          })),
        },
      };
    },
  },
};

/* -------------------------------------------------------------------------- */
/*                                  Policies                                  */
/* -------------------------------------------------------------------------- */

export interface PolicyDetails {
  id?: string;
  arn?: string;
  name?: string;
  description?: string;
  type?: string;
  awsManaged?: boolean;
  /**
   * The policy document as returned by AWS. Not parsed or evaluated.
   */
  content?: string;
}

export type PolicyState = BaseState & {
  organizations: { policy: PolicyDetails };
};

interface PolicyItem extends Item {
  policy: Serialized<PolicySummary>;
  content?: string;
}

export const PolicyEntity: TranslatedEntity<
  PolicyState,
  PolicyItem,
  PolicyItem
> = {
  version: "0.1.0",
  debugLabel: "organizations-policy",
  provider: "aws",
  command: "ListPolicies",
  category: "organizations",
  subcategory: "policy",
  nodeType: "organizations-policy",
  selector: "Organizations|ListPolicies|[]",

  async getState(connector, context) {
    if (!(await isReporter(connector, context, true))) {
      return [];
    }
    const described = await getOwnState<
      DescribePolicyCommandOutput,
      DescribePolicyCommandInput
    >(connector, context, "DescribePolicy");
    const contents = new Map<string, string>();
    for (const page of described) {
      const policyId = page._parameters?.PolicyId;
      const content = page._result?.Policy?.Content;
      if (policyId != null && content != null) {
        contents.set(policyId, content);
      }
    }
    const pages = await getOwnState<ListPoliciesCommandOutput>(
      connector,
      context,
      "ListPolicies",
    );
    const seen = new Set<string>();
    return pages.flatMap((page) =>
      (page._result?.Policies ?? [])
        .filter((policy) => {
          if (policy.Arn == null || seen.has(policy.Arn)) {
            return false;
          }
          seen.add(policy.Arn);
          return true;
        })
        .map((policy) => ({
          $metadata: page._metadata,
          policy,
          content: contents.get(policy.Id ?? ""),
        })),
    );
  },

  translate(val) {
    return [val];
  },

  components: {
    $metadata: metadata("0.1.0"),
    $source: source("ListPolicies"),
    $graph(val) {
      return {
        id: val.policy.Arn!,
        label: val.policy.Name ?? val.policy.Id!,
        nodeClass: "informational",
        nodeType: PolicyEntity.nodeType,
        // AWS managed policies are shared by every organization, so they sit at the top level.
        parent: val.policy.AwsManaged
          ? undefined
          : organizationArn(val.policy.Arn!),
      };
    },
    tenant(val) {
      return {
        provider: PolicyEntity.provider,
        partition: val.$metadata.partition,
        tenantId: parseArn(val.policy.Arn!).account,
      };
    },
    resource(val) {
      return {
        id: val.policy.Arn!,
        name: val.policy.Name ?? val.policy.Id!,
        category: PolicyEntity.category,
        subcategory: PolicyEntity.subcategory,
        description: val.policy.Description,
      };
    },
    organizations(val) {
      return {
        policy: {
          id: val.policy.Id,
          arn: val.policy.Arn,
          name: val.policy.Name,
          description: val.policy.Description,
          type: val.policy.Type,
          awsManaged: val.policy.AwsManaged,
          content: val.content,
        },
      };
    },
  },
};

export type GraphState =
  | OrganizationState
  | RootState
  | OrganizationalUnitState
  | AccountState
  | PolicyState;
