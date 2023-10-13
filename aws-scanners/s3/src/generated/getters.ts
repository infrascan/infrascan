import {
  S3Client,
  ListBucketsCommand,
  GetBucketTaggingCommand,
  GetBucketNotificationConfigurationCommand,
  GetBucketWebsiteCommand,
  GetBucketAclCommand,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { resolveFunctionCallParameters } from "@infrascan/core";
import type {
  Connector,
  GenericState,
  AwsContext,
} from "@infrascan/shared-types";
import type {
  ListBucketsCommandInput,
  ListBucketsCommandOutput,
  GetBucketTaggingCommandInput,
  GetBucketTaggingCommandOutput,
  GetBucketNotificationConfigurationCommandInput,
  GetBucketNotificationConfigurationCommandOutput,
  GetBucketWebsiteCommandInput,
  GetBucketWebsiteCommandOutput,
  GetBucketAclCommandInput,
  GetBucketAclCommandOutput,
} from "@aws-sdk/client-s3";

export async function ListBuckets(
  client: S3Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const state: GenericState[] = [];
  try {
    console.log("s3 ListBuckets");
    const preparedParams: ListBucketsCommandInput = {};
    const cmd = new ListBucketsCommand(preparedParams);
    const result: ListBucketsCommandOutput = await client.send(cmd);
    state.push({
      _metadata: { account: context.account, region: context.region },
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
  const state: GenericState[] = [];
  try {
    console.log("s3 GetBucketTagging");
    const resolvers = [
      {
        Key: "FunctionName",
        Selector: "S3|ListBuckets|[]._result.Buckets[].Name",
      },
    ];
    const parameterQueue = (await resolveFunctionCallParameters(
      context.account,
      context.region,
      resolvers,
      stateConnector,
    )) as GetBucketTaggingCommandInput[];
    for (const parameters of parameterQueue) {
      const preparedParams: GetBucketTaggingCommandInput = parameters;
      const cmd = new GetBucketTaggingCommand(preparedParams);
      const result: GetBucketTaggingCommandOutput = await client.send(cmd);
      state.push({
        _metadata: { account: context.account, region: context.region },
        _parameters: preparedParams,
        _result: result,
      });
    }
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
  const state: GenericState[] = [];
  try {
    console.log("s3 GetBucketNotificationConfiguration");
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
      const cmd = new GetBucketNotificationConfigurationCommand(preparedParams);
      const result: GetBucketNotificationConfigurationCommandOutput =
        await client.send(cmd);
      state.push({
        _metadata: { account: context.account, region: context.region },
        _parameters: preparedParams,
        _result: result,
      });
    }
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
  const state: GenericState[] = [];
  try {
    console.log("s3 GetBucketWebsite");
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
      const cmd = new GetBucketWebsiteCommand(preparedParams);
      const result: GetBucketWebsiteCommandOutput = await client.send(cmd);
      state.push({
        _metadata: { account: context.account, region: context.region },
        _parameters: preparedParams,
        _result: result,
      });
    }
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
  const state: GenericState[] = [];
  try {
    console.log("s3 GetBucketAcl");
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
      const cmd = new GetBucketAclCommand(preparedParams);
      const result: GetBucketAclCommandOutput = await client.send(cmd);
      state.push({
        _metadata: { account: context.account, region: context.region },
        _parameters: preparedParams,
        _result: result,
      });
    }
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
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "S3",
    "GetBucketAcl",
    state,
  );
}
