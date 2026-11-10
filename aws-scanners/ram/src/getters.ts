import {
  GetResourceSharesCommand,
  ListPrincipalsCommand,
  ListResourcesCommand,
  type GetResourceSharesCommandInput,
  type ListPrincipalsCommandInput,
  type ListResourcesCommandInput,
  type RAMClient,
  type ResourceOwner,
} from "@aws-sdk/client-ram";
import type { AwsContext, Connector } from "@infrascan/shared-types";
import { call, recordState } from "./state";

const NEXT_TOKEN = { request: "nextToken", response: "nextToken" } as const;

/**
 * Shares the account owns, then shares other accounts have shared with it.
 */
export const RESOURCE_OWNERS: ResourceOwner[] = ["SELF", "OTHER-ACCOUNTS"];

export async function GetResourceShares(
  client: RAMClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = [];
  for (const resourceOwner of RESOURCE_OWNERS) {
    state.push(
      ...(await call(
        context,
        (input: GetResourceSharesCommandInput) =>
          client.send(new GetResourceSharesCommand(input)),
        { resourceOwner },
        NEXT_TOKEN,
      )),
    );
  }
  await recordState(connector, context, "GetResourceShares", state);
}

/**
 * Principals of every share the account owns, in one listing.
 */
export async function ListPrincipals(
  client: RAMClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input: ListPrincipalsCommandInput) =>
      client.send(new ListPrincipalsCommand(input)),
    { resourceOwner: "SELF" },
    NEXT_TOKEN,
  );
  await recordState(connector, context, "ListPrincipals", state);
}

/**
 * Resources in every share the account owns, regional and global, in one listing.
 */
export async function ListResources(
  client: RAMClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input: ListResourcesCommandInput) =>
      client.send(new ListResourcesCommand(input)),
    { resourceOwner: "SELF", resourceRegionScope: "ALL" },
    NEXT_TOKEN,
  );
  await recordState(connector, context, "ListResources", state);
}
