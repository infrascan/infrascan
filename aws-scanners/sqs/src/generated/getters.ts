import {
  SQSClient,
  ListQueuesCommand,
  ListQueueTagsCommand,
  GetQueueAttributesCommand,
  SQSServiceException,
} from "@aws-sdk/client-sqs";
import { resolveFunctionCallParameters } from "@infrascan/core";
import type {
  Connector,
  GenericState,
  AwsContext,
} from "@infrascan/shared-types";
import type {
  ListQueuesCommandInput,
  ListQueuesCommandOutput,
  ListQueueTagsCommandInput,
  ListQueueTagsCommandOutput,
  GetQueueAttributesCommandInput,
  GetQueueAttributesCommandOutput,
} from "@aws-sdk/client-sqs";

export async function ListQueues(
  client: SQSClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const state: GenericState[] = [];
  try {
    console.log("sqs ListQueues");
    const preparedParams: ListQueuesCommandInput = {};
    const cmd = new ListQueuesCommand(preparedParams);
    const result: ListQueuesCommandOutput = await client.send(cmd);
    state.push({
      _metadata: { account: context.account, region: context.region },
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
  const state: GenericState[] = [];
  try {
    console.log("sqs ListQueueTags");
    const resolvers = [
      { Key: "QueueUrl", Selector: "SQS|ListQueues|[]._result[].QueueUrl" },
    ];
    const parameterQueue = (await resolveFunctionCallParameters(
      context.account,
      context.region,
      resolvers,
      stateConnector,
    )) as ListQueueTagsCommandInput[];
    for (const parameters of parameterQueue) {
      const preparedParams: ListQueueTagsCommandInput = parameters;
      const cmd = new ListQueueTagsCommand(preparedParams);
      const result: ListQueueTagsCommandOutput = await client.send(cmd);
      state.push({
        _metadata: { account: context.account, region: context.region },
        _parameters: preparedParams,
        _result: result,
      });
    }
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
  const state: GenericState[] = [];
  try {
    console.log("sqs GetQueueAttributes");
    const resolvers = [
      { Key: "QueueUrl", Selector: "SQS|ListQueues|[]._result[].QueueUrl" },
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
      const cmd = new GetQueueAttributesCommand(preparedParams);
      const result: GetQueueAttributesCommandOutput = await client.send(cmd);
      state.push({
        _metadata: { account: context.account, region: context.region },
        _parameters: preparedParams,
        _result: result,
      });
    }
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
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "SQS",
    "GetQueueAttributes",
    state,
  );
}
