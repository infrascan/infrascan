import type { ServiceScanCompleteCallbackFn, ResolveStateFromServiceFn } from "@sharedTypes/api";
import type { GenericState } from "@sharedTypes/scan";
import { S3 } from "@aws-sdk/client-s3";

async function performScan(account: string, region: string, onServiceScanComplete: ServiceScanCompleteCallbackFn, resolveStateForServiceCall: ResolveStateFromServiceFn) {
  const S3Client = new S3({ region });

  const listBucketsState: GenericState[] = [];
  try {
    console.log("s3 listBuckets");
    let listBucketsPagingToken = undefined;
    do {
      const result = await S3Client.listBuckets({});
      listBucketsState.push({ _metadata: { account, region }, _parameters: requestParameters, _result: result });
    } while (listBucketsPagingToken != null);
  }
  catch (err: any) {
    if (err?.retryable) {
      console.log("Encountered retryable error", err);
    }
  }
  await onServiceScanComplete(account, region, "s3", "listBuckets", listBucketsState);

  const getBucketTaggingState: GenericState[] = [];
  const getBucketTaggingParameters: Record<string, any>[] = await resolveFunctionCallParameters(account, region, parameters, resolveStateForServiceCall);
  for (const requestParameters of getBucketTaggingParameters) {
    try {
      console.log("s3 getBucketTagging");
      let getBucketTaggingPagingToken = undefined;
      do {
        const result = await S3Client.getBucketTagging(requestParameters);
        getBucketTaggingState.push({ _metadata: { account, region }, _parameters: requestParameters, _result: result });
      } while (getBucketTaggingPagingToken != null);
    }
    catch (err: any) {
      if (err?.retryable) {
        console.log("Encountered retryable error", err);
      }
    }
  }
  await onServiceScanComplete(account, region, "s3", "getBucketTagging", getBucketTaggingState);

  const getBucketNotificationConfigurationState: GenericState[] = [];
  const getBucketNotificationConfigurationParameters: Record<string, any>[] = await resolveFunctionCallParameters(account, region, parameters, resolveStateForServiceCall);
  for (const requestParameters of getBucketNotificationConfigurationParameters) {
    try {
      console.log("s3 getBucketNotificationConfiguration");
      let getBucketNotificationConfigurationPagingToken = undefined;
      do {
        const result = await S3Client.getBucketNotificationConfiguration(requestParameters);
        getBucketNotificationConfigurationState.push({ _metadata: { account, region }, _parameters: requestParameters, _result: result });
      } while (getBucketNotificationConfigurationPagingToken != null);
    }
    catch (err: any) {
      if (err?.retryable) {
        console.log("Encountered retryable error", err);
      }
    }
  }
  await onServiceScanComplete(account, region, "s3", "getBucketNotificationConfiguration", getBucketNotificationConfigurationState);

  const getBucketWebsiteState: GenericState[] = [];
  const getBucketWebsiteParameters: Record<string, any>[] = await resolveFunctionCallParameters(account, region, parameters, resolveStateForServiceCall);
  for (const requestParameters of getBucketWebsiteParameters) {
    try {
      console.log("s3 getBucketWebsite");
      let getBucketWebsitePagingToken = undefined;
      do {
        const result = await S3Client.getBucketWebsite(requestParameters);
        getBucketWebsiteState.push({ _metadata: { account, region }, _parameters: requestParameters, _result: result });
      } while (getBucketWebsitePagingToken != null);
    }
    catch (err: any) {
      if (err?.retryable) {
        console.log("Encountered retryable error", err);
      }
    }
  }
  await onServiceScanComplete(account, region, "s3", "getBucketWebsite", getBucketWebsiteState);

  const getBucketAclState: GenericState[] = [];
  const getBucketAclParameters: Record<string, any>[] = await resolveFunctionCallParameters(account, region, parameters, resolveStateForServiceCall);
  for (const requestParameters of getBucketAclParameters) {
    try {
      console.log("s3 getBucketAcl");
      let getBucketAclPagingToken = undefined;
      do {
        const result = await S3Client.getBucketAcl(requestParameters);
        getBucketAclState.push({ _metadata: { account, region }, _parameters: requestParameters, _result: result });
      } while (getBucketAclPagingToken != null);
    }
    catch (err: any) {
      if (err?.retryable) {
        console.log("Encountered retryable error", err);
      }
    }
  }
  await onServiceScanComplete(account, region, "s3", "getBucketAcl", getBucketAclState);
}

export { performScan };
