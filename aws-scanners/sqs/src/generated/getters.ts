import { resolveFunctionCallParameters } from "@infrascan/core";
import {
  SQSClient,
  SQSServiceException,
  ListQueuesCommand,
  ListQueuesCommandInput,
  ListQueuesCommandOutput,
  ListQueueTagsCommand,
  ListQueueTagsCommandInput,
  ListQueueTagsCommandOutput,
  GetQueueAttributesCommand,
  GetQueueAttributesCommandInput,
  GetQueueAttributesCommandOutput,
} from "@aws-sdk/client-sqs";
import type {
  Connector,
  GenericState,
  AwsContext,
} from "@infrascan/shared-types";
import debug from "debug";

export async function ListQueues(
  client: SQSClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("sqs:ListQueues");
  const state: GenericState[] = [];
  getterDebug("ListQueues");
  const preparedParams: ListQueuesCommandInput = {};
  try {
    const cmd = new ListQueuesCommand(preparedParams);
    const result: ListQueuesCommandOutput = await client.send(cmd);
    state.push({
      _metadata: {
        account: context.account,
        region: context.region,
        timestamp: Date.now(),
      },
      _parameters: preparedParams,
      _result: result,
    });
  } catch (err: unknown) {
    if (err instanceof SQSServiceException) {
      if (err?.$retryable) {
        console.log("Encountered retryable error", err);
      } else {
        console.log("Encountered unretryable error", err);
      }
    } else {
      console.log("Encountered unexpected error", err);
    }
  }
  getterDebug("Recording state");
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "SQS",
    "ListQueues",
    state,
  );
}
export async function ListQueueTags(
  client: SQSClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("sqs:ListQueueTags");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [
    { Key: "QueueUrl", Selector: "SQS|ListQueues|[]._result.QueueUrls[]" },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as ListQueueTagsCommandInput[];
  for (const parameters of parameterQueue) {
    const preparedParams: ListQueueTagsCommandInput = parameters;
    try {
      const cmd = new ListQueueTagsCommand(preparedParams);
      const result: ListQueueTagsCommandOutput = await client.send(cmd);
      state.push({
        _metadata: {
          account: context.account,
          region: context.region,
          timestamp: Date.now(),
        },
        _parameters: preparedParams,
        _result: result,
      });
    } catch (err: unknown) {
      if (err instanceof SQSServiceException) {
        if (err?.$retryable) {
          console.log("Encountered retryable error", err);
        } else {
          console.log("Encountered unretryable error", err);
        }
      } else {
        console.log("Encountered unexpected error", err);
      }
    }
  }
  getterDebug("Recording state");
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "SQS",
    "ListQueueTags",
    state,
  );
}
export async function GetQueueAttributes(
  client: SQSClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("sqs:GetQueueAttributes");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [
    { Key: "QueueUrl", Selector: "SQS|ListQueues|[]._result.QueueUrls[]" },
    { Key: "AttributeNames", Value: ["All"] },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as GetQueueAttributesCommandInput[];
  for (const parameters of parameterQueue) {
    const preparedParams: GetQueueAttributesCommandInput = parameters;
    try {
      const cmd = new GetQueueAttributesCommand(preparedParams);
      const result: GetQueueAttributesCommandOutput = await client.send(cmd);
      state.push({
        _metadata: {
          account: context.account,
          region: context.region,
          timestamp: Date.now(),
        },
        _parameters: preparedParams,
        _result: result,
      });
    } catch (err: unknown) {
      if (err instanceof SQSServiceException) {
        if (err?.$retryable) {
          console.log("Encountered retryable error", err);
        } else {
          console.log("Encountered unretryable error", err);
        }
      } else {
        console.log("Encountered unexpected error", err);
      }
    }
  }
  getterDebug("Recording state");
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "SQS",
    "GetQueueAttributes",
    state,
  );
}
