import {
  Route53Client,
  ListHostedZonesByNameCommand,
  ListResourceRecordSetsCommand,
  Route53ServiceException,
} from "@aws-sdk/client-route-53";
import { resolveFunctionCallParameters } from "@infrascan/core";
import type {
  Connector,
  GenericState,
  AwsContext,
} from "@infrascan/shared-types";
import type {
  ListHostedZonesByNameCommandInput,
  ListHostedZonesByNameCommandOutput,
  ListResourceRecordSetsCommandInput,
  ListResourceRecordSetsCommandOutput,
} from "@aws-sdk/client-route-53";

export async function ListHostedZonesByName(
  client: Route53Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const state: GenericState[] = [];
  try {
    console.log("route-53 ListHostedZonesByName");
    const preparedParams: ListHostedZonesByNameCommandInput = {};
    const cmd = new ListHostedZonesByNameCommand(preparedParams);
    const result: ListHostedZonesByNameCommandOutput = await client.send(cmd);
    state.push({
      _metadata: { account: context.account, region: context.region },
      _parameters: preparedParams,
      _result: result,
    });
  } catch (err: unknown) {
    if (err instanceof Route53ServiceException) {
      if (err?.$retryable) {
        console.log("Encountered retryable error", err);
      } else {
        console.log("Encountered unretryable error", err);
      }
    } else {
      console.log("Encountered unexpected error", err);
    }
  }
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "Route53",
    "ListHostedZonesByName",
    state,
  );
}

export async function ListResourceRecordSets(
  client: Route53Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const state: GenericState[] = [];
  try {
    console.log("route-53 ListResourceRecordSets");
    const resolvers = [
      {
        Key: "HostedZoneId",
        Selector: "Route53|ListHostedZonesByName|[]._result.HostedZones[].Id",
      },
    ];
    const parameterQueue = (await resolveFunctionCallParameters(
      context.account,
      context.region,
      resolvers,
      stateConnector,
    )) as ListResourceRecordSetsCommandInput[];
    for (const parameters of parameterQueue) {
      const preparedParams: ListResourceRecordSetsCommandInput = parameters;
      const cmd = new ListResourceRecordSetsCommand(preparedParams);
      const result: ListResourceRecordSetsCommandOutput = await client.send(
        cmd,
      );
      state.push({
        _metadata: { account: context.account, region: context.region },
        _parameters: preparedParams,
        _result: result,
      });
    }
  } catch (err: unknown) {
    if (err instanceof Route53ServiceException) {
      if (err?.$retryable) {
        console.log("Encountered retryable error", err);
      } else {
        console.log("Encountered unretryable error", err);
      }
    } else {
      console.log("Encountered unexpected error", err);
    }
  }
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "Route53",
    "ListResourceRecordSets",
    state,
  );
}
