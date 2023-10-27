import {
  KinesisClient,
  ListStreamsCommand,
  ListStreamConsumersCommand,
  KinesisServiceException,
} from "@aws-sdk/client-kinesis";
import { resolveFunctionCallParameters } from "@infrascan/core";
import type {
  Connector,
  GenericState,
  AwsContext,
} from "@infrascan/shared-types";
import type {
  ListStreamsCommandInput,
  ListStreamsCommandOutput,
  ListStreamConsumersCommandInput,
  ListStreamConsumersCommandOutput,
} from "@aws-sdk/client-kinesis";

export async function ListStreams(
  client: KinesisClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const state: GenericState[] = [];
  console.log("kinesis ListStreams");
  let pagingToken: string | undefined = undefined;
  do {
    const preparedParams: ListStreamsCommandInput = {};
    preparedParams.NextToken = pagingToken;
    try {
      const cmd = new ListStreamsCommand(preparedParams);
      const result: ListStreamsCommandOutput = await client.send(cmd);
      state.push({
        _metadata: { account: context.account, region: context.region },
        _parameters: preparedParams,
        _result: result,
      });
      pagingToken = result.NextToken;
    } catch (err: unknown) {
      if (err instanceof KinesisServiceException) {
        if (err?.$retryable) {
          console.log("Encountered retryable error", err);
        } else {
          console.log("Encountered unretryable error", err);
        }
      } else {
        console.log("Encountered unexpected error", err);
      }
      pagingToken = undefined;
    }
  } while (pagingToken != null);
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "Kinesis",
    "ListStreams",
    state,
  );
}

export async function ListStreamConsumers(
  client: KinesisClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const state: GenericState[] = [];
  console.log("kinesis ListStreamConsumers");
  const resolvers = [
    {
      Key: "StreamARN",
      Selector: "Kinesis|ListStreams|[]._result.StreamSummaries[].StreamARN",
    },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as ListStreamConsumersCommandInput[];
  for (const parameters of parameterQueue) {
    let pagingToken: string | undefined = undefined;
    do {
      const preparedParams: ListStreamConsumersCommandInput = parameters;
      preparedParams.NextToken = pagingToken;
      try {
        const cmd = new ListStreamConsumersCommand(preparedParams);
        const result: ListStreamConsumersCommandOutput = await client.send(cmd);
        state.push({
          _metadata: { account: context.account, region: context.region },
          _parameters: preparedParams,
          _result: result,
        });
        pagingToken = result.NextToken;
      } catch (err: unknown) {
        if (err instanceof KinesisServiceException) {
          if (err?.$retryable) {
            console.log("Encountered retryable error", err);
          } else {
            console.log("Encountered unretryable error", err);
          }
        } else {
          console.log("Encountered unexpected error", err);
        }
        pagingToken = undefined;
      }
    } while (pagingToken != null);
  }
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "Kinesis",
    "ListStreamConsumers",
    state,
  );
}
