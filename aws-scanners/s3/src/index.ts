import { S3Client } from "@aws-sdk/client-s3";
import type {
  AwsContext,
  GraphNode,
  ServiceModule,
} from "@infrascan/shared-types";

import { getClient } from "./generated/client";
import {
  ListBuckets,
  GetBucketTagging,
  GetBucketNotificationConfiguration,
  GetBucketWebsite,
  GetBucketAcl,
} from "./generated/getters";
import { getNodes, getEdges } from "./generated/graph";

// Format S3 ID as arn in place of bucket name
/* eslint-disable @typescript-eslint/no-unused-vars */
function formatNode(node: GraphNode, _context: AwsContext): GraphNode {
  const bucketArn = `arn:aws:s3:::${node.data.id}`;
  return Object.assign(node, { data: { id: bucketArn } });
}

const S3Scanner: ServiceModule<S3Client, "aws"> = {
  provider: "aws",
  service: "s3",
  key: "S3",
  getClient,
  callPerRegion: true,
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
