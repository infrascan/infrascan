import {
  DescribeAggregationAuthorizationsCommand,
  DescribeConfigRulesCommand,
  DescribeConfigurationAggregatorsCommand,
  DescribeConfigurationRecordersCommand,
  DescribeConfigurationRecorderStatusCommand,
  DescribeConformancePacksCommand,
  DescribeDeliveryChannelsCommand,
  DescribeOrganizationConfigRulesCommand,
  DescribeOrganizationConformancePacksCommand,
  ListConfigurationRecordersCommand,
  type ConfigServiceClient,
  type ConfigurationRecorderSummary,
  type DescribeConfigurationRecordersCommandInput,
  type DescribeConfigurationRecorderStatusCommandInput,
} from "@aws-sdk/client-config-service";
import { evaluateSelector } from "@infrascan/core";
import type { AwsContext, Connector } from "@infrascan/shared-types";
import { call, recordState } from "./state";

const NEXT_TOKEN = { request: "NextToken", response: "NextToken" } as const;

/**
 * Inputs for the recorder calls: `{}` returns the customer managed recorder, and each service-linked recorder must be
 * requested by its ARN (the API accepts one recorder per request).
 */
async function getRecorderInputs(
  connector: Connector,
  context: AwsContext,
): Promise<{ Arn?: string }[]> {
  const summaries =
    (await evaluateSelector<ConfigurationRecorderSummary>(
      context.account,
      context.region,
      "ConfigService|ListConfigurationRecorders|[]._result.ConfigurationRecorderSummaries[]",
      connector,
    )) ?? [];
  const serviceLinked = [
    ...new Set(
      summaries
        .filter(({ servicePrincipal, arn }) => servicePrincipal && arn)
        .map(({ arn }) => arn as string),
    ),
  ];
  return [{}, ...serviceLinked.map((arn) => ({ Arn: arn }))];
}

export async function ListConfigurationRecorders(
  client: ConfigServiceClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input) => client.send(new ListConfigurationRecordersCommand(input)),
    {},
    NEXT_TOKEN,
  );
  await recordState(connector, context, "ListConfigurationRecorders", state);
}

export async function DescribeConfigurationRecorders(
  client: ConfigServiceClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = [];
  for (const recorder of await getRecorderInputs(connector, context)) {
    state.push(
      ...(await call(
        context,
        (input: DescribeConfigurationRecordersCommandInput) =>
          client.send(new DescribeConfigurationRecordersCommand(input)),
        recorder,
      )),
    );
  }
  await recordState(
    connector,
    context,
    "DescribeConfigurationRecorders",
    state,
  );
}

export async function DescribeConfigurationRecorderStatus(
  client: ConfigServiceClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = [];
  for (const recorder of await getRecorderInputs(connector, context)) {
    state.push(
      ...(await call(
        context,
        (input: DescribeConfigurationRecorderStatusCommandInput) =>
          client.send(new DescribeConfigurationRecorderStatusCommand(input)),
        recorder,
      )),
    );
  }
  await recordState(
    connector,
    context,
    "DescribeConfigurationRecorderStatus",
    state,
  );
}

export async function DescribeDeliveryChannels(
  client: ConfigServiceClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input) => client.send(new DescribeDeliveryChannelsCommand(input)),
    {},
  );
  await recordState(connector, context, "DescribeDeliveryChannels", state);
}

export async function DescribeConfigurationAggregators(
  client: ConfigServiceClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input) => client.send(new DescribeConfigurationAggregatorsCommand(input)),
    {},
    NEXT_TOKEN,
  );
  await recordState(
    connector,
    context,
    "DescribeConfigurationAggregators",
    state,
  );
}

export async function DescribeAggregationAuthorizations(
  client: ConfigServiceClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input) => client.send(new DescribeAggregationAuthorizationsCommand(input)),
    {},
    NEXT_TOKEN,
  );
  await recordState(
    connector,
    context,
    "DescribeAggregationAuthorizations",
    state,
  );
}

export async function DescribeOrganizationConfigRules(
  client: ConfigServiceClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input) => client.send(new DescribeOrganizationConfigRulesCommand(input)),
    {},
    NEXT_TOKEN,
  );
  await recordState(
    connector,
    context,
    "DescribeOrganizationConfigRules",
    state,
  );
}

export async function DescribeOrganizationConformancePacks(
  client: ConfigServiceClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input) =>
      client.send(new DescribeOrganizationConformancePacksCommand(input)),
    {},
    NEXT_TOKEN,
  );
  await recordState(
    connector,
    context,
    "DescribeOrganizationConformancePacks",
    state,
  );
}

export async function DescribeConformancePacks(
  client: ConfigServiceClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input) => client.send(new DescribeConformancePacksCommand(input)),
    {},
    NEXT_TOKEN,
  );
  await recordState(connector, context, "DescribeConformancePacks", state);
}

export async function DescribeConfigRules(
  client: ConfigServiceClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input) => client.send(new DescribeConfigRulesCommand(input)),
    {},
    NEXT_TOKEN,
  );
  await recordState(connector, context, "DescribeConfigRules", state);
}
