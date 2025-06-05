import { S3Client } from "@aws-sdk/client-s3";

import type { AwsContext, ServiceModule } from "@infrascan/shared-types";

import type {
  AwsCredentialIdentityProvider,
  RetryStrategy,
  RetryStrategyV2,
} from "@aws-sdk/types";

import {
  ListBuckets,
  GetBucketTagging,
  GetBucketNotificationConfiguration,
  GetBucketWebsite,
  GetBucketAcl,
} from "./generated/getters";
import { getEdges } from "./generated/graph";
import { registerMiddleware } from "./middleware";
import { S3Entity } from "./graph";

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
  retryStrategy?: RetryStrategy | RetryStrategyV2,
): S3Client {
  const s3Client = new S3Client({
    credentials,
    region: context.region,
    followRegionRedirects: true,
    retryStrategy,
  });
  registerMiddleware(s3Client);
  return s3Client;
}

const S3Scanner: ServiceModule<S3Client, "aws"> = {
  provider: "aws",
  service: "s3",
  key: "S3",
  getClient,
  callPerRegion: false,
  getters: [
    ListBuckets,
    GetBucketTagging,
    GetBucketNotificationConfiguration,
    GetBucketWebsite,
    GetBucketAcl,
  ],
  getEdges,
  entities: [S3Entity],
};

export type { GraphState } from "./graph";

export default S3Scanner;
