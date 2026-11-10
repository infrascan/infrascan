import {
  DescribeOrganizationConfigurationCommand,
  GetAdministratorAccountCommand,
  GetAutomatedDiscoveryConfigurationCommand,
  GetClassificationExportConfigurationCommand,
  GetMacieSessionCommand,
  ListMembersCommand,
  ListOrganizationAdminAccountsCommand,
  type ListMembersCommandInput,
  type Macie2Client,
} from "@aws-sdk/client-macie2";
import type { AwsContext, Connector } from "@infrascan/shared-types";
import { call, recordState } from "./state";

const NEXT_TOKEN = { request: "nextToken", response: "nextToken" } as const;

/**
 * Macie status of the calling account. When Macie is not enabled AWS answers with an AccessDeniedException.
 */
export async function GetMacieSession(
  client: Macie2Client,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input) => client.send(new GetMacieSessionCommand(input)),
    {},
  );
  await recordState(connector, context, "GetMacieSession", state);
}

/**
 * The administrator of a member account. An administrator or standalone account gets an empty response.
 */
export async function GetAdministratorAccount(
  client: Macie2Client,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input) => client.send(new GetAdministratorAccountCommand(input)),
    {},
  );
  await recordState(connector, context, "GetAdministratorAccount", state);
}

/**
 * The delegated Macie administrator accounts of the organization. Expected to succeed from the management account
 * only, which does not need Macie enabled to call it.
 */
export async function ListOrganizationAdminAccounts(
  client: Macie2Client,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input) => client.send(new ListOrganizationAdminAccountsCommand(input)),
    {},
    NEXT_TOKEN,
  );
  await recordState(connector, context, "ListOrganizationAdminAccounts", state);
}

/**
 * Organization auto-enable setting. Expected to succeed from the delegated administrator only.
 */
export async function DescribeOrganizationConfiguration(
  client: Macie2Client,
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
 * Members of an administrator. `onlyAssociated: "false"` lists every account Macie knows of, whatever its
 * relationship status, so the status is recorded rather than filtered on.
 */
export async function ListMembers(
  client: Macie2Client,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input: ListMembersCommandInput) =>
      client.send(new ListMembersCommand(input)),
    { onlyAssociated: "false" },
    NEXT_TOKEN,
  );
  await recordState(connector, context, "ListMembers", state);
}

/**
 * Where Macie stores sensitive data discovery results.
 */
export async function GetClassificationExportConfiguration(
  client: Macie2Client,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input) =>
      client.send(new GetClassificationExportConfigurationCommand(input)),
    {},
  );
  await recordState(
    connector,
    context,
    "GetClassificationExportConfiguration",
    state,
  );
}

export async function GetAutomatedDiscoveryConfiguration(
  client: Macie2Client,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input) =>
      client.send(new GetAutomatedDiscoveryConfigurationCommand(input)),
    {},
  );
  await recordState(
    connector,
    context,
    "GetAutomatedDiscoveryConfiguration",
    state,
  );
}
