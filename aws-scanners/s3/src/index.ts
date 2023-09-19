import { S3Client } from "@aws-sdk/client-s3";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./generated/client";
import {
  ListBuckets,
  GetBucketTagging,
  GetBucketNotificationConfiguration,
  GetBucketWebsite,
  GetBucketAcl,
} from "./generated/getters";
import { getNodes, getEdges } from "./generated/graph";

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
};

export default S3Scanner;
