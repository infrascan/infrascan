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
  callPerRegion: false,
  getters: [
    {
      fn: "ListBuckets",
    },
    {
      fn: "GetBucketTagging",
      parameters: [
        {
          Key: "FunctionName",
          Selector: "S3|ListBuckets|[]._result[].Name",
        },
      ],
    },
    {
      fn: "GetBucketNotificationConfiguration",
      parameters: [
        {
          Key: "Bucket",
          Selector: "S3|ListBuckets|[]._result[].Name",
        },
      ],
    },
    {
      fn: "GetBucketWebsite",
      parameters: [
        {
          Key: "Bucket",
          Selector: "S3|ListBuckets|[]._result[].Name",
        },
      ],
    },
    {
      fn: "GetBucketAcl",
      parameters: [
        {
          Key: "Bucket",
          Selector: "S3|ListBuckets|[]._result[].Name",
        },
      ],
    },
  ],
  nodes: ["S3|ListBuckets|[]._result[].{id:Name,name:Name}"],
  edges: [
    {
      state: "S3|GetBucketNotificationConfiguration|[]",
      from: "_parameters.Bucket",
      to: "_result.TopicConfigurations | [].{target:TopicArn,name:Id}",
    },
    {
      state: "S3|GetBucketNotificationConfiguration|[]",
      from: "_parameters.Bucket",
      to: "_result.QueueConfigurations | [].{target:Queue,name:Id}",
    },
    {
      state: "S3|GetBucketNotificationConfiguration|[]",
      from: "_parameters.Bucket",
      to: "_result.LambdaFunctionConfiguration | [].{target:LambdaFunctionArn,name:Id}",
    },
  ],
};

export default S3Scanner;
