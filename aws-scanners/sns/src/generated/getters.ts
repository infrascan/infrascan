import { resolveFunctionCallParameters } from "@infrascan/core";
import {
  SNSClient,
  SNSServiceException,
  ListTopicsCommand,
  ListTopicsCommandInput,
  ListTopicsCommandOutput,
  GetTopicAttributesCommand,
  GetTopicAttributesCommandInput,
  GetTopicAttributesCommandOutput,
  ListSubscriptionsByTopicCommand,
  ListSubscriptionsByTopicCommandInput,
  ListSubscriptionsByTopicCommandOutput,
  ListTagsForResourceCommand,
  ListTagsForResourceCommandInput,
  ListTagsForResourceCommandOutput,
} from "@aws-sdk/client-sns";
import type {
  Connector,
  GenericState,
  AwsContext,
} from "@infrascan/shared-types";
import debug from "debug";

export async function ListTopics(
  client: SNSClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("sns:ListTopics");
  const state: GenericState[] = [];
  getterDebug("ListTopics");
  const preparedParams: ListTopicsCommandInput = {};
  try {
    const cmd = new ListTopicsCommand(preparedParams);
    const result: ListTopicsCommandOutput = await client.send(cmd);
    state.push({
      _metadata: { account: context.account, region: context.region },
      _parameters: preparedParams,
      _result: result,
    });
  } catch (err: unknown) {
    if (err instanceof SNSServiceException) {
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
    "SNS",
    "ListTopics",
    state,
  );
}
export async function GetTopicAttributes(
  client: SNSClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("sns:GetTopicAttributes");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [
    {
      Key: "TopicArn",
      Selector: "SNS|ListTopics|[]._result.Topics[].TopicArn",
    },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as GetTopicAttributesCommandInput[];
  for (const parameters of parameterQueue) {
    const preparedParams: GetTopicAttributesCommandInput = parameters;
    try {
      const cmd = new GetTopicAttributesCommand(preparedParams);
      const result: GetTopicAttributesCommandOutput = await client.send(cmd);
      state.push({
        _metadata: { account: context.account, region: context.region },
        _parameters: preparedParams,
        _result: result,
      });
    } catch (err: unknown) {
      if (err instanceof SNSServiceException) {
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
    "SNS",
    "GetTopicAttributes",
    state,
  );
}
export async function ListSubscriptionsByTopic(
  client: SNSClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("sns:ListSubscriptionsByTopic");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [
    {
      Key: "TopicArn",
      Selector: "SNS|ListTopics|[]._result.Topics[].TopicArn",
    },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as ListSubscriptionsByTopicCommandInput[];
  for (const parameters of parameterQueue) {
    const preparedParams: ListSubscriptionsByTopicCommandInput = parameters;
    try {
      const cmd = new ListSubscriptionsByTopicCommand(preparedParams);
      const result: ListSubscriptionsByTopicCommandOutput = await client.send(
        cmd,
      );
      state.push({
        _metadata: { account: context.account, region: context.region },
        _parameters: preparedParams,
        _result: result,
      });
    } catch (err: unknown) {
      if (err instanceof SNSServiceException) {
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
    "SNS",
    "ListSubscriptionsByTopic",
    state,
  );
}
export async function ListTagsForResource(
  client: SNSClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("sns:ListTagsForResource");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [
    {
      Key: "ResourceArn",
      Selector: "SNS|ListTopics|[]._result.Topics[].TopicArn",
    },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as ListTagsForResourceCommandInput[];
  for (const parameters of parameterQueue) {
    const preparedParams: ListTagsForResourceCommandInput = parameters;
    try {
      const cmd = new ListTagsForResourceCommand(preparedParams);
      const result: ListTagsForResourceCommandOutput = await client.send(cmd);
      state.push({
        _metadata: { account: context.account, region: context.region },
        _parameters: preparedParams,
        _result: result,
      });
    } catch (err: unknown) {
      if (err instanceof SNSServiceException) {
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
    "SNS",
    "ListTagsForResource",
    state,
  );
}
