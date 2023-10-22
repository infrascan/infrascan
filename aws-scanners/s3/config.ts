import * as S3 from "@aws-sdk/client-s3";
import type { ScannerDefinition } from "@infrascan/shared-types";

export type S3Functions =
  | "ListBuckets"
  | "GetBucketTagging"
  | "GetBucketNotificationConfiguration"
  | "GetBucketWebsite"
  | "GetBucketAcl";

const S3Scanner: ScannerDefinition<"S3", typeof S3, S3Functions> = {
  provider: "aws",
  service: "s3",
  clientKey: "S3",
  key: "S3",
  skipClientBuilder: true,
  callPerRegion: false,
  getters: [
    {
      fn: "ListBuckets",
    },
    {
      fn: "GetBucketTagging",
      parameters: [
        {
          Key: "Bucket",
          Selector: "S3|ListBuckets|[]._result.Buckets[].Name",
        },
      ],
    },
    {
      fn: "GetBucketNotificationConfiguration",
      parameters: [
        {
          Key: "Bucket",
          Selector: "S3|ListBuckets|[]._result.Buckets[].Name",
        },
      ],
    },
    {
      fn: "GetBucketWebsite",
      parameters: [
        {
          Key: "Bucket",
          Selector: "S3|ListBuckets|[]._result.Buckets[].Name",
        },
      ],
    },
    {
      fn: "GetBucketAcl",
      parameters: [
        {
          Key: "Bucket",
          Selector: "S3|ListBuckets|[]._result.Buckets[].Name",
        },
      ],
    },
  ],
  // Node IDs are formatted through the `formatNode` function which already has context over the service being called,
  // so Node IDs can be passed as the raw name.
  nodes: ["S3|ListBuckets|[]._result.Buckets[].{id:Name,name:Name}"],
  // Edge formatting is generic (as edges aren't tailored to the service to which they refer), so bucket names must be formatted here
  edges: [
    {
      state: "S3|GetBucketNotificationConfiguration|[]",
      from: "_parameters.Bucket | [`arn:aws:s3:::`,@] | join('',@)",
      to: "_result.TopicConfigurations | [].{target:TopicArn,name:Id}",
    },
    {
      state: "S3|GetBucketNotificationConfiguration|[]",
      from: "_parameters.Bucket | [`arn:aws:s3:::`,@] | join('',@)",
      to: "_result.QueueConfigurations | [].{target:QueueArn,name:Id}",
    },
    {
      state: "S3|GetBucketNotificationConfiguration|[]",
      from: "_parameters.Bucket | [`arn:aws:s3:::`,@] | join('',@)",
      to: "_result.LambdaFunctionConfigurations | [].{target:LambdaFunctionArn,name:Id}",
    },
  ],
};

export default S3Scanner;
