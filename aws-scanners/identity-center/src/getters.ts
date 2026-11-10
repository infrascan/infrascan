import {
  DescribePermissionSetCommand,
  ListAccountsForProvisionedPermissionSetCommand,
  ListCustomerManagedPolicyReferencesInPermissionSetCommand,
  ListInstancesCommand,
  ListManagedPoliciesInPermissionSetCommand,
  ListPermissionSetsCommand,
  type DescribePermissionSetCommandInput,
  type ListAccountsForProvisionedPermissionSetCommandInput,
  type ListCustomerManagedPolicyReferencesInPermissionSetCommandInput,
  type ListInstancesCommandInput,
  type ListManagedPoliciesInPermissionSetCommandInput,
  type ListPermissionSetsCommandInput,
  type ListPermissionSetsCommandOutput,
  type SSOAdminClient,
} from "@aws-sdk/client-sso-admin";
import { evaluateSelector } from "@infrascan/core";
import type { AwsContext, Connector } from "@infrascan/shared-types";
import { call, recordState, type CallState } from "./state";

const NEXT_TOKEN = { request: "NextToken", response: "NextToken" } as const;

export interface PermissionSetReference {
  InstanceArn: string;
  PermissionSetArn: string;
}

/**
 * Every permission set listed by `ListPermissionSets`, with the instance it was listed under.
 */
export async function getPermissionSets(
  connector: Connector,
  context: AwsContext,
): Promise<PermissionSetReference[]> {
  const pages =
    (await evaluateSelector<
      CallState<ListPermissionSetsCommandOutput, ListPermissionSetsCommandInput>
    >(
      context.account,
      context.region,
      "SSOAdmin|ListPermissionSets|[]",
      connector,
    )) ?? [];
  const seen = new Set<string>();
  const references: PermissionSetReference[] = [];
  for (const page of pages) {
    const instanceArn = page._parameters?.InstanceArn;
    for (const permissionSetArn of page._result?.PermissionSets ?? []) {
      if (instanceArn != null && !seen.has(permissionSetArn)) {
        seen.add(permissionSetArn);
        references.push({
          InstanceArn: instanceArn,
          PermissionSetArn: permissionSetArn,
        });
      }
    }
  }
  return references;
}

export async function ListInstances(
  client: SSOAdminClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input: ListInstancesCommandInput) =>
      client.send(new ListInstancesCommand(input)),
    {},
    NEXT_TOKEN,
  );
  await recordState(connector, context, "ListInstances", state);
}

export async function ListPermissionSets(
  client: SSOAdminClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const instanceArns =
    (await evaluateSelector<string>(
      context.account,
      context.region,
      "SSOAdmin|ListInstances|[]._result.Instances[].InstanceArn",
      connector,
    )) ?? [];
  const state = [];
  for (const instanceArn of new Set(instanceArns)) {
    state.push(
      ...(await call(
        context,
        (input: ListPermissionSetsCommandInput) =>
          client.send(new ListPermissionSetsCommand(input)),
        { InstanceArn: instanceArn },
        NEXT_TOKEN,
      )),
    );
  }
  await recordState(connector, context, "ListPermissionSets", state);
}

export async function DescribePermissionSet(
  client: SSOAdminClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = [];
  for (const reference of await getPermissionSets(connector, context)) {
    state.push(
      ...(await call(
        context,
        (input: DescribePermissionSetCommandInput) =>
          client.send(new DescribePermissionSetCommand(input)),
        { ...reference },
      )),
    );
  }
  await recordState(connector, context, "DescribePermissionSet", state);
}

/**
 * Names and ARNs of the AWS managed policies attached to each permission set. Inline policies are not read.
 */
export async function ListManagedPoliciesInPermissionSet(
  client: SSOAdminClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = [];
  for (const reference of await getPermissionSets(connector, context)) {
    state.push(
      ...(await call(
        context,
        (input: ListManagedPoliciesInPermissionSetCommandInput) =>
          client.send(new ListManagedPoliciesInPermissionSetCommand(input)),
        { ...reference },
        NEXT_TOKEN,
      )),
    );
  }
  await recordState(
    connector,
    context,
    "ListManagedPoliciesInPermissionSet",
    state,
  );
}

/**
 * Names and paths of the customer managed policies each permission set references. The policies themselves live in
 * each target account and are not read.
 */
export async function ListCustomerManagedPolicyReferencesInPermissionSet(
  client: SSOAdminClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = [];
  for (const reference of await getPermissionSets(connector, context)) {
    state.push(
      ...(await call(
        context,
        (
          input: ListCustomerManagedPolicyReferencesInPermissionSetCommandInput,
        ) =>
          client.send(
            new ListCustomerManagedPolicyReferencesInPermissionSetCommand(
              input,
            ),
          ),
        { ...reference },
        NEXT_TOKEN,
      )),
    );
  }
  await recordState(
    connector,
    context,
    "ListCustomerManagedPolicyReferencesInPermissionSet",
    state,
  );
}

export async function ListAccountsForProvisionedPermissionSet(
  client: SSOAdminClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = [];
  for (const reference of await getPermissionSets(connector, context)) {
    state.push(
      ...(await call(
        context,
        (input: ListAccountsForProvisionedPermissionSetCommandInput) =>
          client.send(
            new ListAccountsForProvisionedPermissionSetCommand(input),
          ),
        { ...reference },
        NEXT_TOKEN,
      )),
    );
  }
  await recordState(
    connector,
    context,
    "ListAccountsForProvisionedPermissionSet",
    state,
  );
}
