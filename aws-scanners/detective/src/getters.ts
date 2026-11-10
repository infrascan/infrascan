import {
  DescribeOrganizationConfigurationCommand,
  ListDatasourcePackagesCommand,
  ListGraphsCommand,
  ListInvitationsCommand,
  ListMembersCommand,
  ListOrganizationAdminAccountsCommand,
  type DescribeOrganizationConfigurationCommandInput,
  type DetectiveClient,
  type ListDatasourcePackagesCommandInput,
  type ListMembersCommandInput,
} from "@aws-sdk/client-detective";
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

async function getGraphArns(
  connector: Connector,
  context: AwsContext,
): Promise<string[]> {
  const arns = await select<string>(
    connector,
    context,
    "Detective|ListGraphs|[]._result.GraphList[].Arn",
  );
  return [...new Set(arns)];
}

/**
 * Behavior graphs the scanned account is the administrator of. An account administers at most one graph per region.
 */
export async function ListGraphs(
  client: DetectiveClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input) => client.send(new ListGraphsCommand(input)),
    {},
    NEXT_TOKEN,
  );
  await recordState(connector, context, "ListGraphs", state);
}

export async function ListMembers(
  client: DetectiveClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = [];
  for (const graphArn of await getGraphArns(connector, context)) {
    state.push(
      ...(await call(
        context,
        (input: ListMembersCommandInput) =>
          client.send(new ListMembersCommand(input)),
        { GraphArn: graphArn },
        NEXT_TOKEN,
      )),
    );
  }
  await recordState(connector, context, "ListMembers", state);
}

/**
 * Only answers for an organization behavior graph, i.e. when the scanned account is the Detective administrator
 * account for the organization.
 */
export async function DescribeOrganizationConfiguration(
  client: DetectiveClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = [];
  for (const graphArn of await getGraphArns(connector, context)) {
    state.push(
      ...(await call(
        context,
        (input: DescribeOrganizationConfigurationCommandInput) =>
          client.send(new DescribeOrganizationConfigurationCommand(input)),
        { GraphArn: graphArn },
      )),
    );
  }
  await recordState(
    connector,
    context,
    "DescribeOrganizationConfiguration",
    state,
  );
}

export async function ListDatasourcePackages(
  client: DetectiveClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = [];
  for (const graphArn of await getGraphArns(connector, context)) {
    state.push(
      ...(await call(
        context,
        (input: ListDatasourcePackagesCommandInput) =>
          client.send(new ListDatasourcePackagesCommand(input)),
        { GraphArn: graphArn },
        NEXT_TOKEN,
      )),
    );
  }
  await recordState(connector, context, "ListDatasourcePackages", state);
}

/**
 * The organization's Detective administrator account. Only the organization management account can call this.
 */
export async function ListOrganizationAdminAccounts(
  client: DetectiveClient,
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
 * Open and accepted invitations to other accounts' behavior graphs, i.e. the graphs the scanned account is a member of.
 */
export async function ListInvitations(
  client: DetectiveClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input) => client.send(new ListInvitationsCommand(input)),
    {},
    NEXT_TOKEN,
  );
  await recordState(connector, context, "ListInvitations", state);
}
