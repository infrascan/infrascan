import {
  GetLandingZoneCommand,
  ListBaselinesCommand,
  ListEnabledBaselinesCommand,
  ListEnabledControlsCommand,
  ListLandingZonesCommand,
  type ControlTowerClient,
  type GetLandingZoneCommandInput,
} from "@aws-sdk/client-controltower";
import { evaluateSelector } from "@infrascan/core";
import type { AwsContext, Connector } from "@infrascan/shared-types";
import { call, recordState } from "./state";

const NEXT_TOKEN = { request: "nextToken", response: "nextToken" } as const;

export async function ListLandingZones(
  client: ControlTowerClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input) => client.send(new ListLandingZonesCommand(input)),
    {},
    NEXT_TOKEN,
  );
  await recordState(connector, context, "ListLandingZones", state);
}

export async function GetLandingZone(
  client: ControlTowerClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const arns =
    (await evaluateSelector<string>(
      context.account,
      context.region,
      "ControlTower|ListLandingZones|[]._result.landingZones[].arn",
      connector,
    )) ?? [];
  const state = [];
  for (const arn of new Set(arns)) {
    state.push(
      ...(await call(
        context,
        (input: GetLandingZoneCommandInput) =>
          client.send(new GetLandingZoneCommand(input)),
        { landingZoneIdentifier: arn },
      )),
    );
  }
  await recordState(connector, context, "GetLandingZone", state);
}

export async function ListBaselines(
  client: ControlTowerClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input) => client.send(new ListBaselinesCommand(input)),
    {},
    NEXT_TOKEN,
  );
  await recordState(connector, context, "ListBaselines", state);
}

export async function ListEnabledBaselines(
  client: ControlTowerClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input) => client.send(new ListEnabledBaselinesCommand(input)),
    {},
    NEXT_TOKEN,
  );
  await recordState(connector, context, "ListEnabledBaselines", state);
}

/**
 * Without a `targetIdentifier` the call lists every control Control Tower has enabled in the organization.
 */
export async function ListEnabledControls(
  client: ControlTowerClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input) => client.send(new ListEnabledControlsCommand(input)),
    {},
    NEXT_TOKEN,
  );
  await recordState(connector, context, "ListEnabledControls", state);
}
