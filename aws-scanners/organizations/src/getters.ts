import {
  DescribeOrganizationCommand,
  DescribePolicyCommand,
  DescribeResourcePolicyCommand,
  ListAccountsForParentCommand,
  ListAWSServiceAccessForOrganizationCommand,
  ListDelegatedAdministratorsCommand,
  ListDelegatedServicesForAccountCommand,
  ListOrganizationalUnitsForParentCommand,
  ListPoliciesCommand,
  ListRootsCommand,
  ListTagsForResourceCommand,
  ListTargetsForPolicyCommand,
  type DescribePolicyCommandInput,
  type ListAccountsForParentCommandInput,
  type ListDelegatedServicesForAccountCommandInput,
  type ListOrganizationalUnitsForParentCommandInput,
  type ListOrganizationalUnitsForParentCommandOutput,
  type ListPoliciesCommandInput,
  type ListTagsForResourceCommandInput,
  type ListTargetsForPolicyCommandInput,
  type OrganizationsClient,
  type PolicyType,
  type PolicyTypeSummary,
} from "@aws-sdk/client-organizations";
import { evaluateSelector } from "@infrascan/core";
import type { AwsContext, Connector } from "@infrascan/shared-types";
import { call, recordState, type CallState } from "./state";

function select<T>(
  connector: Connector,
  context: AwsContext,
  selector: string,
): Promise<T[]> {
  return evaluateSelector<T>(
    context.account,
    context.region,
    selector,
    connector,
  ).then((values) => values ?? []);
}

const NEXT_TOKEN = { request: "NextToken", response: "NextToken" } as const;

export async function DescribeOrganization(
  client: OrganizationsClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input) => client.send(new DescribeOrganizationCommand(input)),
    {},
  );
  await recordState(connector, context, "DescribeOrganization", state);
}

export async function ListRoots(
  client: OrganizationsClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input) => client.send(new ListRootsCommand(input)),
    {},
    NEXT_TOKEN,
  );
  await recordState(connector, context, "ListRoots", state);
}

/**
 * Walks the OU tree breadth first from each root. Every page is recorded with the `ParentId` it was listed under.
 */
export async function ListOrganizationalUnitsForParent(
  client: OrganizationsClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const queue = await select<string>(
    connector,
    context,
    "Organizations|ListRoots|[]._result.Roots[].Id",
  );
  const visited = new Set<string>();
  const state: CallState<
    ListOrganizationalUnitsForParentCommandOutput,
    ListOrganizationalUnitsForParentCommandInput
  >[] = [];
  while (queue.length > 0) {
    const parentId = queue.shift() as string;
    if (!visited.has(parentId)) {
      visited.add(parentId);
      const pages = await call(
        context,
        (input: ListOrganizationalUnitsForParentCommandInput) =>
          client.send(new ListOrganizationalUnitsForParentCommand(input)),
        { ParentId: parentId },
        NEXT_TOKEN,
      );
      state.push(...pages);
      for (const page of pages) {
        for (const ou of page._result?.OrganizationalUnits ?? []) {
          if (ou.Id != null) {
            queue.push(ou.Id);
          }
        }
      }
    }
  }
  await recordState(
    connector,
    context,
    "ListOrganizationalUnitsForParent",
    state,
  );
}

async function getParentIds(
  connector: Connector,
  context: AwsContext,
): Promise<string[]> {
  const rootIds = await select<string>(
    connector,
    context,
    "Organizations|ListRoots|[]._result.Roots[].Id",
  );
  const ouIds = await select<string>(
    connector,
    context,
    "Organizations|ListOrganizationalUnitsForParent|[]._result.OrganizationalUnits[].Id",
  );
  return [...new Set([...rootIds, ...ouIds])];
}

export async function ListAccountsForParent(
  client: OrganizationsClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const parentIds = await getParentIds(connector, context);
  const state = [];
  for (const parentId of parentIds) {
    state.push(
      ...(await call(
        context,
        (input: ListAccountsForParentCommandInput) =>
          client.send(new ListAccountsForParentCommand(input)),
        { ParentId: parentId },
        NEXT_TOKEN,
      )),
    );
  }
  await recordState(connector, context, "ListAccountsForParent", state);
}

/**
 * Lists policies of every type enabled on a root. The set of policy types grows over time, so the enabled types are
 * read from the roots rather than hardcoded.
 */
export async function ListPolicies(
  client: OrganizationsClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const policyTypes = await select<PolicyTypeSummary>(
    connector,
    context,
    "Organizations|ListRoots|[]._result.Roots[].PolicyTypes[]",
  );
  const enabledTypes = [
    ...new Set(
      policyTypes
        .filter(({ Status }) => Status === "ENABLED")
        .map(({ Type }) => Type)
        .filter((type): type is PolicyType => type != null),
    ),
  ];
  const state = [];
  for (const policyType of enabledTypes) {
    state.push(
      ...(await call(
        context,
        (input: ListPoliciesCommandInput) =>
          client.send(new ListPoliciesCommand(input)),
        { Filter: policyType },
        NEXT_TOKEN,
      )),
    );
  }
  await recordState(connector, context, "ListPolicies", state);
}

async function getPolicyIds(
  connector: Connector,
  context: AwsContext,
): Promise<string[]> {
  const ids = await select<string>(
    connector,
    context,
    "Organizations|ListPolicies|[]._result.Policies[].Id",
  );
  return [...new Set(ids)];
}

export async function DescribePolicy(
  client: OrganizationsClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = [];
  for (const policyId of await getPolicyIds(connector, context)) {
    state.push(
      ...(await call(
        context,
        (input: DescribePolicyCommandInput) =>
          client.send(new DescribePolicyCommand(input)),
        { PolicyId: policyId },
      )),
    );
  }
  await recordState(connector, context, "DescribePolicy", state);
}

export async function ListTargetsForPolicy(
  client: OrganizationsClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = [];
  for (const policyId of await getPolicyIds(connector, context)) {
    state.push(
      ...(await call(
        context,
        (input: ListTargetsForPolicyCommandInput) =>
          client.send(new ListTargetsForPolicyCommand(input)),
        { PolicyId: policyId },
        NEXT_TOKEN,
      )),
    );
  }
  await recordState(connector, context, "ListTargetsForPolicy", state);
}

export async function ListDelegatedAdministrators(
  client: OrganizationsClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input) => client.send(new ListDelegatedAdministratorsCommand(input)),
    {},
    NEXT_TOKEN,
  );
  await recordState(connector, context, "ListDelegatedAdministrators", state);
}

export async function ListDelegatedServicesForAccount(
  client: OrganizationsClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const accountIds = await select<string>(
    connector,
    context,
    "Organizations|ListDelegatedAdministrators|[]._result.DelegatedAdministrators[].Id",
  );
  const state = [];
  for (const accountId of new Set(accountIds)) {
    state.push(
      ...(await call(
        context,
        (input: ListDelegatedServicesForAccountCommandInput) =>
          client.send(new ListDelegatedServicesForAccountCommand(input)),
        { AccountId: accountId },
        NEXT_TOKEN,
      )),
    );
  }
  await recordState(
    connector,
    context,
    "ListDelegatedServicesForAccount",
    state,
  );
}

export async function ListAWSServiceAccessForOrganization(
  client: OrganizationsClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input) =>
      client.send(new ListAWSServiceAccessForOrganizationCommand(input)),
    {},
    NEXT_TOKEN,
  );
  await recordState(
    connector,
    context,
    "ListAWSServiceAccessForOrganization",
    state,
  );
}

export async function DescribeResourcePolicy(
  client: OrganizationsClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input) => client.send(new DescribeResourcePolicyCommand(input)),
    {},
  );
  await recordState(connector, context, "DescribeResourcePolicy", state);
}

/**
 * Tags on roots, OUs and accounts.
 */
export async function ListTagsForResource(
  client: OrganizationsClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const accountIds = await select<string>(
    connector,
    context,
    "Organizations|ListAccountsForParent|[]._result.Accounts[].Id",
  );
  const resourceIds = [
    ...new Set([...(await getParentIds(connector, context)), ...accountIds]),
  ];
  const state = [];
  for (const resourceId of resourceIds) {
    state.push(
      ...(await call(
        context,
        (input: ListTagsForResourceCommandInput) =>
          client.send(new ListTagsForResourceCommand(input)),
        { ResourceId: resourceId },
        NEXT_TOKEN,
      )),
    );
  }
  await recordState(connector, context, "ListTagsForResource", state);
}
