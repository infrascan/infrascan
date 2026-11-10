import {
  GetDataLakeOrganizationConfigurationCommand,
  ListDataLakesCommand,
  ListLogSourcesCommand,
  ListSubscribersCommand,
  type ListDataLakesCommandInput,
  type ListLogSourcesCommandInput,
  type ListSubscribersCommandInput,
  type SecurityLakeClient,
} from "@aws-sdk/client-securitylake";
import { evaluateSelector } from "@infrascan/core";
import type { AwsContext, Connector } from "@infrascan/shared-types";
import { call, recordState } from "./state";

const NEXT_TOKEN = { request: "nextToken", response: "nextToken" } as const;

/**
 * Whether `ListDataLakes` returned a data lake in the scanned region. The other calls describe a data lake, so they
 * are only made where one exists.
 */
async function hasDataLake(
  connector: Connector,
  context: AwsContext,
): Promise<boolean> {
  const regions =
    (await evaluateSelector<string>(
      context.account,
      context.region,
      "SecurityLake|ListDataLakes|[]._result.dataLakes[].region",
      connector,
    )) ?? [];
  return regions.includes(context.region);
}

/**
 * The data lake in the scanned region, if any.
 */
export async function ListDataLakes(
  client: SecurityLakeClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input: ListDataLakesCommandInput) =>
      client.send(new ListDataLakesCommand(input)),
    { regions: [context.region] },
  );
  await recordState(connector, context, "ListDataLakes", state);
}

/**
 * Log sources collected in the scanned region, per contributing account.
 */
export async function ListLogSources(
  client: SecurityLakeClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = (await hasDataLake(connector, context))
    ? await call(
        context,
        (input: ListLogSourcesCommandInput) =>
          client.send(new ListLogSourcesCommand(input)),
        { regions: [context.region] },
        NEXT_TOKEN,
      )
    : [];
  await recordState(connector, context, "ListLogSources", state);
}

/**
 * The configuration applied to accounts that join the organization. Only the Security Lake delegated administrator
 * can read it.
 */
export async function GetDataLakeOrganizationConfiguration(
  client: SecurityLakeClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = (await hasDataLake(connector, context))
    ? await call(
        context,
        (input) =>
          client.send(new GetDataLakeOrganizationConfigurationCommand(input)),
        {},
      )
    : [];
  await recordState(
    connector,
    context,
    "GetDataLakeOrganizationConfiguration",
    state,
  );
}

/**
 * Subscribers to the data lake. The external id AWS returns in each subscriber's identity is a shared secret used when
 * assuming the subscriber role, so it is dropped before the response is recorded; the principal is kept.
 */
export async function ListSubscribers(
  client: SecurityLakeClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = (await hasDataLake(connector, context))
    ? await call(
        context,
        async (input: ListSubscribersCommandInput) => {
          const result = await client.send(new ListSubscribersCommand(input));
          return {
            ...result,
            subscribers: result.subscribers?.map(
              ({ subscriberIdentity, ...subscriber }) => ({
                ...subscriber,
                subscriberIdentity:
                  subscriberIdentity != null
                    ? { principal: subscriberIdentity.principal }
                    : undefined,
              }),
            ),
          };
        },
        {},
        NEXT_TOKEN,
      )
    : [];
  await recordState(connector, context, "ListSubscribers", state);
}
