import type { ServiceScanCompleteCallbackFn, ResolveStateFromServiceFn } from "@sharedTypes/api";
import type { GenericState } from "@sharedTypes/scan";
import { S3Client, ListBucketsCommand, ListBucketsCommandInput, ListBucketsCommandOutput, GetBucketTaggingCommand, GetBucketTaggingCommandInput, GetBucketTaggingCommandOutput, GetBucketNotificationConfigurationCommand, GetBucketNotificationConfigurationCommandInput, GetBucketNotificationConfigurationCommandOutput, GetBucketWebsiteCommand, GetBucketWebsiteCommandInput, GetBucketWebsiteCommandOutput, GetBucketAclCommand, GetBucketAclCommandInput, GetBucketAclCommandOutput } from "@aws-sdk/client-s3";

async function performScan(account: string, region: string, onServiceScanComplete: ServiceScanCompleteCallbackFn, resolveStateForServiceCall: ResolveStateFromServiceFn) {
  const S3 = new S3Client({ region });

  const ListBucketsState: GenericState[] = [];
  try {
    console.log("s3 ListBuckets");
    let ListBucketsPagingToken: string | undefined = undefined;
    do {
      const ListBucketsCmd = new ListBucketsCommand({} as ListBucketsCommandInput);
      const result: ListBucketsCommandOutput = await S3.send(ListBucketsCmd);
      ListBucketsState.push({ _metadata: { account, region }, _parameters: {}, _result: result });
    } while (ListBucketsPagingToken != null);
  }
  catch (err: any) {
    if (err?.retryable) {
      console.log("Encountered retryable error", err);
    }
  }
  await onServiceScanComplete(account, region, "s3", "ListBuckets", ListBucketsState);

  const GetBucketTaggingState: GenericState[] = [];
  const GetBucketTaggingParameterResolvers = [{ "Key": "Bucket", "Selector": "S3|ListBuckets|[]._result[].Name" }];
  const GetBucketTaggingParameters = (await resolveFunctionCallParameters(account, region, GetBucketTaggingParameterResolvers, resolveStateForServiceCall)) as GetBucketTaggingCommandInput[];
  for (const requestParameters of GetBucketTaggingParameters) {
    try {
      console.log("s3 GetBucketTagging");
      let GetBucketTaggingPagingToken: string | undefined = undefined;
      do {
        const GetBucketTaggingCmd = new GetBucketTaggingCommand(requestParameters);
        const result: GetBucketTaggingCommandOutput = await S3.send(GetBucketTaggingCmd);
        GetBucketTaggingState.push({ _metadata: { account, region }, _parameters: requestParameters, _result: result });
      } while (GetBucketTaggingPagingToken != null);
    }
    catch (err: any) {
      if (err?.retryable) {
        console.log("Encountered retryable error", err);
      }
    }
  }
  await onServiceScanComplete(account, region, "s3", "GetBucketTagging", GetBucketTaggingState);

  const GetBucketNotificationConfigurationState: GenericState[] = [];
  const GetBucketNotificationConfigurationParameterResolvers = [{ "Key": "Bucket", "Selector": "S3|ListBuckets|[]._result[].Name" }];
  const GetBucketNotificationConfigurationParameters = (await resolveFunctionCallParameters(account, region, GetBucketNotificationConfigurationParameterResolvers, resolveStateForServiceCall)) as GetBucketNotificationConfigurationCommandInput[];
  for (const requestParameters of GetBucketNotificationConfigurationParameters) {
    try {
      console.log("s3 GetBucketNotificationConfiguration");
      let GetBucketNotificationConfigurationPagingToken: string | undefined = undefined;
      do {
        const GetBucketNotificationConfigurationCmd = new GetBucketNotificationConfigurationCommand(requestParameters);
        const result: GetBucketNotificationConfigurationCommandOutput = await S3.send(GetBucketNotificationConfigurationCmd);
        GetBucketNotificationConfigurationState.push({ _metadata: { account, region }, _parameters: requestParameters, _result: result });
      } while (GetBucketNotificationConfigurationPagingToken != null);
    }
    catch (err: any) {
      if (err?.retryable) {
        console.log("Encountered retryable error", err);
      }
    }
  }
  await onServiceScanComplete(account, region, "s3", "GetBucketNotificationConfiguration", GetBucketNotificationConfigurationState);

  const GetBucketWebsiteState: GenericState[] = [];
  const GetBucketWebsiteParameterResolvers = [{ "Key": "Bucket", "Selector": "S3|ListBuckets|[]._result[].Name" }];
  const GetBucketWebsiteParameters = (await resolveFunctionCallParameters(account, region, GetBucketWebsiteParameterResolvers, resolveStateForServiceCall)) as GetBucketWebsiteCommandInput[];
  for (const requestParameters of GetBucketWebsiteParameters) {
    try {
      console.log("s3 GetBucketWebsite");
      let GetBucketWebsitePagingToken: string | undefined = undefined;
      do {
        const GetBucketWebsiteCmd = new GetBucketWebsiteCommand(requestParameters);
        const result: GetBucketWebsiteCommandOutput = await S3.send(GetBucketWebsiteCmd);
        GetBucketWebsiteState.push({ _metadata: { account, region }, _parameters: requestParameters, _result: result });
      } while (GetBucketWebsitePagingToken != null);
    }
    catch (err: any) {
      if (err?.retryable) {
        console.log("Encountered retryable error", err);
      }
    }
  }
  await onServiceScanComplete(account, region, "s3", "GetBucketWebsite", GetBucketWebsiteState);

  const GetBucketAclState: GenericState[] = [];
  const GetBucketAclParameterResolvers = [{ "Key": "Bucket", "Selector": "S3|ListBuckets|[]._result[].Name" }];
  const GetBucketAclParameters = (await resolveFunctionCallParameters(account, region, GetBucketAclParameterResolvers, resolveStateForServiceCall)) as GetBucketAclCommandInput[];
  for (const requestParameters of GetBucketAclParameters) {
    try {
      console.log("s3 GetBucketAcl");
      let GetBucketAclPagingToken: string | undefined = undefined;
      do {
        const GetBucketAclCmd = new GetBucketAclCommand(requestParameters);
        const result: GetBucketAclCommandOutput = await S3.send(GetBucketAclCmd);
        GetBucketAclState.push({ _metadata: { account, region }, _parameters: requestParameters, _result: result });
      } while (GetBucketAclPagingToken != null);
    }
    catch (err: any) {
      if (err?.retryable) {
        console.log("Encountered retryable error", err);
      }
    }
  }
  await onServiceScanComplete(account, region, "s3", "GetBucketAcl", GetBucketAclState);
}

export { performScan };
