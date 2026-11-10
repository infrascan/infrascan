import {
  DescribeTrailsCommand,
  GetEventDataStoreCommand,
  GetEventSelectorsCommand,
  GetTrailStatusCommand,
  ListEventDataStoresCommand,
  type CloudTrailClient,
  type EventDataStore,
  type GetEventDataStoreCommandInput,
  type GetEventSelectorsCommandInput,
  type GetTrailStatusCommandInput,
  type Trail,
} from "@aws-sdk/client-cloudtrail";
import { evaluateSelector } from "@infrascan/core";
import type { AwsContext, Connector } from "@infrascan/shared-types";
import { parseArn } from "./arn";
import { call, recordState } from "./state";

const NEXT_TOKEN = { request: "NextToken", response: "NextToken" } as const;

/**
 * Whether a trail is owned by the scanned account and homed in the scanned region. Only those trails answer
 * `GetTrailStatus` and `GetEventSelectors` here; the rest are shadow copies of trails homed elsewhere.
 */
export function isOwnHomeTrail(
  trail: { TrailARN?: string; HomeRegion?: string },
  context: AwsContext,
): boolean {
  return (
    trail.TrailARN != null &&
    trail.HomeRegion === context.region &&
    parseArn(trail.TrailARN).account === context.account
  );
}

async function getOwnTrailArns(
  connector: Connector,
  context: AwsContext,
): Promise<string[]> {
  const trails =
    (await evaluateSelector<Trail>(
      context.account,
      context.region,
      "CloudTrail|DescribeTrails|[]._result.trailList[]",
      connector,
    )) ?? [];
  return [
    ...new Set(
      trails
        .filter((trail) => isOwnHomeTrail(trail, context))
        .map(({ TrailARN }) => TrailARN as string),
    ),
  ];
}

export async function DescribeTrails(
  client: CloudTrailClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input) => client.send(new DescribeTrailsCommand(input)),
    { includeShadowTrails: true },
  );
  await recordState(connector, context, "DescribeTrails", state);
}

export async function GetTrailStatus(
  client: CloudTrailClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = [];
  for (const trailArn of await getOwnTrailArns(connector, context)) {
    state.push(
      ...(await call(
        context,
        (input: GetTrailStatusCommandInput) =>
          client.send(new GetTrailStatusCommand(input)),
        { Name: trailArn },
      )),
    );
  }
  await recordState(connector, context, "GetTrailStatus", state);
}

export async function GetEventSelectors(
  client: CloudTrailClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = [];
  for (const trailArn of await getOwnTrailArns(connector, context)) {
    state.push(
      ...(await call(
        context,
        (input: GetEventSelectorsCommandInput) =>
          client.send(new GetEventSelectorsCommand(input)),
        { TrailName: trailArn },
      )),
    );
  }
  await recordState(connector, context, "GetEventSelectors", state);
}

export async function ListEventDataStores(
  client: CloudTrailClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input) => client.send(new ListEventDataStoresCommand(input)),
    {},
    NEXT_TOKEN,
  );
  await recordState(connector, context, "ListEventDataStores", state);
}

/**
 * `ListEventDataStores` no longer returns most event data store settings (they are deprecated on the list response),
 * so each listed store is described.
 */
export async function GetEventDataStore(
  client: CloudTrailClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const stores =
    (await evaluateSelector<EventDataStore>(
      context.account,
      context.region,
      "CloudTrail|ListEventDataStores|[]._result.EventDataStores[]",
      connector,
    )) ?? [];
  const arns = [
    ...new Set(
      stores
        .map(({ EventDataStoreArn }) => EventDataStoreArn)
        .filter((arn): arn is string => arn != null),
    ),
  ];
  const state = [];
  for (const arn of arns) {
    state.push(
      ...(await call(
        context,
        (input: GetEventDataStoreCommandInput) =>
          client.send(new GetEventDataStoreCommand(input)),
        { EventDataStore: arn },
      )),
    );
  }
  await recordState(connector, context, "GetEventDataStore", state);
}
