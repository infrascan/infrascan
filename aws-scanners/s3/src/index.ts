import { S3Client } from "@aws-sdk/client-s3";

import type {
  AwsContext,
  GraphNode,
  ServiceModule,
} from "@infrascan/shared-types";

import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";

import {
  ListBuckets,
  GetBucketTagging,
  GetBucketNotificationConfiguration,
  GetBucketWebsite,
  GetBucketAcl,
} from "./generated/getters";
import { getNodes, getEdges } from "./generated/graph";

export function getClient(
  credentials: AwsCredentialIdentityProvider,
  context: AwsContext,
): S3Client {
  return new S3Client({
    credentials,
    region: context.region,
    followRegionRedirects: true
  });
}

// Format S3 ID as arn in place of bucket name
/* eslint-disable @typescript-eslint/no-unused-vars */
function formatNode(node: GraphNode, _context: AwsContext): GraphNode {
  const bucketArn = `arn:aws:s3:::${node.data.id}`;
  node.data.id = bucketArn;
  return node;
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
  getNodes,
  getEdges,
  formatNode,
};

export default S3Scanner;
