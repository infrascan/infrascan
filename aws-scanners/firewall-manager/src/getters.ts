import {
  GetAdminAccountCommand,
  GetAdminScopeCommand,
  GetPolicyCommand,
  ListAdminAccountsForOrganizationCommand,
  ListAdminsManagingAccountCommand,
  ListPoliciesCommand,
  type FMSClient,
  type GetAdminScopeCommandInput,
  type GetPolicyCommandInput,
  type ListAdminAccountsForOrganizationCommandInput,
  type ListAdminsManagingAccountCommandInput,
  type ListPoliciesCommandInput,
} from "@aws-sdk/client-fms";
import { evaluateSelector } from "@infrascan/core";
import type { AwsContext, Connector } from "@infrascan/shared-types";
import { call, recordState } from "./state";

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

export async function GetAdminAccount(
  client: FMSClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input) => client.send(new GetAdminAccountCommand(input)),
    {},
  );
  await recordState(connector, context, "GetAdminAccount", state);
}

/**
 * Only the management account can list the organization's administrators; elsewhere the failure is recorded.
 */
export async function ListAdminAccountsForOrganization(
  client: FMSClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input: ListAdminAccountsForOrganizationCommandInput) =>
      client.send(new ListAdminAccountsForOrganizationCommand(input)),
    {},
    NEXT_TOKEN,
  );
  await recordState(
    connector,
    context,
    "ListAdminAccountsForOrganization",
    state,
  );
}

export async function ListAdminsManagingAccount(
  client: FMSClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input: ListAdminsManagingAccountCommandInput) =>
      client.send(new ListAdminsManagingAccountCommand(input)),
    {},
    NEXT_TOKEN,
  );
  await recordState(connector, context, "ListAdminsManagingAccount", state);
}

/**
 * The scope of each administrator listed by `ListAdminAccountsForOrganization`, so management account only.
 */
export async function GetAdminScope(
  client: FMSClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const admins = await select<string>(
    connector,
    context,
    "FMS|ListAdminAccountsForOrganization|[]._result.AdminAccounts[].AdminAccount",
  );
  const state = [];
  for (const adminAccount of new Set(admins)) {
    state.push(
      ...(await call(
        context,
        (input: GetAdminScopeCommandInput) =>
          client.send(new GetAdminScopeCommand(input)),
        { AdminAccount: adminAccount },
      )),
    );
  }
  await recordState(connector, context, "GetAdminScope", state);
}

export async function ListPolicies(
  client: FMSClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input: ListPoliciesCommandInput) =>
      client.send(new ListPoliciesCommand(input)),
    {},
    NEXT_TOKEN,
  );
  await recordState(connector, context, "ListPolicies", state);
}

export async function GetPolicy(
  client: FMSClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const policyIds = await select<string>(
    connector,
    context,
    "FMS|ListPolicies|[]._result.PolicyList[].PolicyId",
  );
  const state = [];
  for (const policyId of new Set(policyIds)) {
    state.push(
      ...(await call(
        context,
        (input: GetPolicyCommandInput) =>
          client.send(new GetPolicyCommand(input)),
        { PolicyId: policyId },
      )),
    );
  }
  await recordState(connector, context, "GetPolicy", state);
}
