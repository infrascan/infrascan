import {
  BatchGetAccountStatusCommand,
  DescribeOrganizationConfigurationCommand,
  GetDelegatedAdminAccountCommand,
  ListDelegatedAdminAccountsCommand,
  ListMembersCommand,
  type BatchGetAccountStatusCommandInput,
  type Inspector2Client,
  type ListMembersCommandInput,
} from "@aws-sdk/client-inspector2";
import type { AwsContext, Connector } from "@infrascan/shared-types";
import { call, recordState } from "./state";

const NEXT_TOKEN = { request: "nextToken", response: "nextToken" } as const;

/**
 * Inspector status of the calling account. With no `accountIds` AWS returns the caller's own status, which every
 * account can read.
 */
export async function BatchGetAccountStatus(
  client: Inspector2Client,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input: BatchGetAccountStatusCommandInput) =>
      client.send(new BatchGetAccountStatusCommand(input)),
    {},
  );
  await recordState(connector, context, "BatchGetAccountStatus", state);
}

/**
 * The organization's Inspector delegated administrator and its relationship status.
 */
export async function GetDelegatedAdminAccount(
  client: Inspector2Client,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input) => client.send(new GetDelegatedAdminAccountCommand(input)),
    {},
  );
  await recordState(connector, context, "GetDelegatedAdminAccount", state);
}

/**
 * Every Inspector delegated administrator of the organization. Expected to succeed from the management account only.
 */
export async function ListDelegatedAdminAccounts(
  client: Inspector2Client,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input) => client.send(new ListDelegatedAdminAccountsCommand(input)),
    {},
    NEXT_TOKEN,
  );
  await recordState(connector, context, "ListDelegatedAdminAccounts", state);
}

/**
 * Organization auto-enable settings per resource type. Expected to succeed from the delegated administrator only.
 */
export async function DescribeOrganizationConfiguration(
  client: Inspector2Client,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input) => client.send(new DescribeOrganizationConfigurationCommand(input)),
    {},
  );
  await recordState(
    connector,
    context,
    "DescribeOrganizationConfiguration",
    state,
  );
}

/**
 * Members of the delegated administrator. `onlyAssociated: false` lists every account of the organization with its
 * relationship status, so the status is recorded rather than filtered on.
 */
export async function ListMembers(
  client: Inspector2Client,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input: ListMembersCommandInput) =>
      client.send(new ListMembersCommand(input)),
    { onlyAssociated: false },
    NEXT_TOKEN,
  );
  await recordState(connector, context, "ListMembers", state);
}
