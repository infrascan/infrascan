import { resolveFunctionCallParameters } from "@infrascan/core";
import {
  S3Client,
  S3ServiceException,
  ListBucketsCommand,
  ListBucketsCommandInput,
  ListBucketsCommandOutput,
  GetBucketTaggingCommand,
  GetBucketTaggingCommandInput,
  GetBucketTaggingCommandOutput,
  GetBucketNotificationConfigurationCommand,
  GetBucketNotificationConfigurationCommandInput,
  GetBucketNotificationConfigurationCommandOutput,
  GetBucketWebsiteCommand,
  GetBucketWebsiteCommandInput,
  GetBucketWebsiteCommandOutput,
  GetBucketAclCommand,
  GetBucketAclCommandInput,
  GetBucketAclCommandOutput,
} from "@aws-sdk/client-s3";
import type {
  Connector,
  GenericState,
  AwsContext,
} from "@infrascan/shared-types";
import debug from "debug";

export async function ListBuckets(
  client: S3Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("s3:ListBuckets");
  const state: GenericState[] = [];
  getterDebug("ListBuckets");
  const preparedParams: ListBucketsCommandInput = {};
  try {
    const cmd = new ListBucketsCommand(preparedParams);
    const result: ListBucketsCommandOutput = await client.send(cmd);
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
    if (err instanceof S3ServiceException) {
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
    "S3",
    "ListBuckets",
    state,
  );
}
export async function GetBucketTagging(
  client: S3Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("s3:GetBucketTagging");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [
    { Key: "Bucket", Selector: "S3|ListBuckets|[]._result.Buckets[].Name" },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as GetBucketTaggingCommandInput[];
  for (const parameters of parameterQueue) {
    const preparedParams: GetBucketTaggingCommandInput = parameters;
    try {
      const cmd = new GetBucketTaggingCommand(preparedParams);
      const result: GetBucketTaggingCommandOutput = await client.send(cmd);
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
      if (err instanceof S3ServiceException) {
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
    "S3",
    "GetBucketTagging",
    state,
  );
}
export async function GetBucketNotificationConfiguration(
  client: S3Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("s3:GetBucketNotificationConfiguration");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [
    { Key: "Bucket", Selector: "S3|ListBuckets|[]._result.Buckets[].Name" },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as GetBucketNotificationConfigurationCommandInput[];
  for (const parameters of parameterQueue) {
    const preparedParams: GetBucketNotificationConfigurationCommandInput =
      parameters;
    try {
      const cmd = new GetBucketNotificationConfigurationCommand(preparedParams);
      const result: GetBucketNotificationConfigurationCommandOutput =
        await client.send(cmd);
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
      if (err instanceof S3ServiceException) {
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
    "S3",
    "GetBucketNotificationConfiguration",
    state,
  );
}
export async function GetBucketWebsite(
  client: S3Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("s3:GetBucketWebsite");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [
    { Key: "Bucket", Selector: "S3|ListBuckets|[]._result.Buckets[].Name" },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as GetBucketWebsiteCommandInput[];
  for (const parameters of parameterQueue) {
    const preparedParams: GetBucketWebsiteCommandInput = parameters;
    try {
      const cmd = new GetBucketWebsiteCommand(preparedParams);
      const result: GetBucketWebsiteCommandOutput = await client.send(cmd);
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
      if (err instanceof S3ServiceException) {
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
    "S3",
    "GetBucketWebsite",
    state,
  );
}
export async function GetBucketAcl(
  client: S3Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("s3:GetBucketAcl");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [
    { Key: "Bucket", Selector: "S3|ListBuckets|[]._result.Buckets[].Name" },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as GetBucketAclCommandInput[];
  for (const parameters of parameterQueue) {
    const preparedParams: GetBucketAclCommandInput = parameters;
    try {
      const cmd = new GetBucketAclCommand(preparedParams);
      const result: GetBucketAclCommandOutput = await client.send(cmd);
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
      if (err instanceof S3ServiceException) {
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
    "S3",
    "GetBucketAcl",
    state,
  );
}
