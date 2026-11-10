import {
  DescribeOrganizationConfigurationCommand,
  DescribePublishingDestinationCommand,
  GetAdministratorAccountCommand,
  GetDetectorCommand,
  ListDetectorsCommand,
  ListMembersCommand,
  ListOrganizationAdminAccountsCommand,
  ListPublishingDestinationsCommand,
  type DescribeOrganizationConfigurationCommandInput,
  type DescribePublishingDestinationCommandInput,
  type GetAdministratorAccountCommandInput,
  type GetDetectorCommandInput,
  type GuardDutyClient,
  type ListMembersCommandInput,
  type ListPublishingDestinationsCommandInput,
  type ListPublishingDestinationsCommandOutput,
} from "@aws-sdk/client-guardduty";
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

async function getDetectorIds(
  connector: Connector,
  context: AwsContext,
): Promise<string[]> {
  const ids = await select<string>(
    connector,
    context,
    "GuardDuty|ListDetectors|[]._result.DetectorIds[]",
  );
  return [...new Set(ids)];
}

/**
 * GuardDuty allows one detector per account per region; no detector means GuardDuty has never been enabled (or was
 * disabled and the detector deleted) in this region.
 */
export async function ListDetectors(
  client: GuardDutyClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input) => client.send(new ListDetectorsCommand(input)),
    {},
    NEXT_TOKEN,
  );
  await recordState(connector, context, "ListDetectors", state);
}

export async function GetDetector(
  client: GuardDutyClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = [];
  for (const detectorId of await getDetectorIds(connector, context)) {
    state.push(
      ...(await call(
        context,
        (input: GetDetectorCommandInput) =>
          client.send(new GetDetectorCommand(input)),
        { DetectorId: detectorId },
      )),
    );
  }
  await recordState(connector, context, "GetDetector", state);
}

/**
 * Returns the administrator of a member account. An administrator or standalone account gets an empty response.
 */
export async function GetAdministratorAccount(
  client: GuardDutyClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = [];
  for (const detectorId of await getDetectorIds(connector, context)) {
    state.push(
      ...(await call(
        context,
        (input: GetAdministratorAccountCommandInput) =>
          client.send(new GetAdministratorAccountCommand(input)),
        { DetectorId: detectorId },
      )),
    );
  }
  await recordState(connector, context, "GetAdministratorAccount", state);
}

/**
 * Organization auto-enable settings. Only the delegated administrator can read them. The feature list is paginated.
 */
export async function DescribeOrganizationConfiguration(
  client: GuardDutyClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = [];
  for (const detectorId of await getDetectorIds(connector, context)) {
    state.push(
      ...(await call(
        context,
        (input: DescribeOrganizationConfigurationCommandInput) =>
          client.send(new DescribeOrganizationConfigurationCommand(input)),
        { DetectorId: detectorId },
        NEXT_TOKEN,
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

/**
 * Member accounts of an administrator. `OnlyAssociated: "false"` lists every member GuardDuty knows of, whatever its
 * relationship status, so the status is recorded rather than filtered on.
 */
export async function ListMembers(
  client: GuardDutyClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = [];
  for (const detectorId of await getDetectorIds(connector, context)) {
    state.push(
      ...(await call(
        context,
        (input: ListMembersCommandInput) =>
          client.send(new ListMembersCommand(input)),
        { DetectorId: detectorId, OnlyAssociated: "false" },
        NEXT_TOKEN,
      )),
    );
  }
  await recordState(connector, context, "ListMembers", state);
}

export async function ListPublishingDestinations(
  client: GuardDutyClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = [];
  for (const detectorId of await getDetectorIds(connector, context)) {
    state.push(
      ...(await call(
        context,
        (input: ListPublishingDestinationsCommandInput) =>
          client.send(new ListPublishingDestinationsCommand(input)),
        { DetectorId: detectorId },
        NEXT_TOKEN,
      )),
    );
  }
  await recordState(connector, context, "ListPublishingDestinations", state);
}

export async function DescribePublishingDestination(
  client: GuardDutyClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const pages = await select<
    CallState<
      ListPublishingDestinationsCommandOutput,
      ListPublishingDestinationsCommandInput
    >
  >(connector, context, "GuardDuty|ListPublishingDestinations|[]");
  const state = [];
  for (const page of pages) {
    const detectorId = page._parameters?.DetectorId;
    for (const destination of page._result?.Destinations ?? []) {
      if (detectorId != null && destination.DestinationId != null) {
        state.push(
          ...(await call(
            context,
            (input: DescribePublishingDestinationCommandInput) =>
              client.send(new DescribePublishingDestinationCommand(input)),
            {
              DetectorId: detectorId,
              DestinationId: destination.DestinationId,
            },
          )),
        );
      }
    }
  }
  await recordState(connector, context, "DescribePublishingDestination", state);
}

/**
 * The delegated administrator accounts for GuardDuty in this region. Only the organization's management account can
 * run this.
 */
export async function ListOrganizationAdminAccounts(
  client: GuardDutyClient,
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
