import { resolveFunctionCallParameters } from "@infrascan/core";
import {
  KinesisClient,
  KinesisServiceException,
  ListStreamsCommand,
  ListStreamsCommandInput,
  ListStreamsCommandOutput,
  ListStreamConsumersCommand,
  ListStreamConsumersCommandInput,
  ListStreamConsumersCommandOutput,
} from "@aws-sdk/client-kinesis";
import type {
  Connector,
  GenericState,
  AwsContext,
} from "@infrascan/shared-types";
import debug from "debug";

export async function ListStreams(
  client: KinesisClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("kinesis:ListStreams");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  let pagingToken: string | undefined;
  do {
    const preparedParams: ListStreamsCommandInput = {};
    preparedParams.NextToken = pagingToken;
    try {
      const cmd = new ListStreamsCommand(preparedParams);
      const result: ListStreamsCommandOutput = await client.send(cmd);
      state.push({
        _metadata: {
          account: context.account,
          region: context.region,
          timestamp: new Date().toISOString(),
        },
        _parameters: preparedParams,
        _result: result,
      });
      pagingToken = result.NextToken;
      if (pagingToken != null) {
        getterDebug("Found pagination token in response");
      } else {
        getterDebug("No pagination token found in response");
      }
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
  getterDebug("Recording state");
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
  const getterDebug = debug("kinesis:ListStreamConsumers");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
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
    let pagingToken: string | undefined;
    do {
      const preparedParams: ListStreamConsumersCommandInput = parameters;
      preparedParams.NextToken = pagingToken;
      try {
        const cmd = new ListStreamConsumersCommand(preparedParams);
        const result: ListStreamConsumersCommandOutput = await client.send(cmd);
        state.push({
          _metadata: {
            account: context.account,
            region: context.region,
            timestamp: new Date().toISOString(),
          },
          _parameters: preparedParams,
          _result: result,
        });
        pagingToken = result.NextToken;
        if (pagingToken != null) {
          getterDebug("Found pagination token in response");
        } else {
          getterDebug("No pagination token found in response");
        }
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
  getterDebug("Recording state");
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "Kinesis",
    "ListStreamConsumers",
    state,
  );
}
