import { CloudFrontClient } from "@aws-sdk/client-cloudfront";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./generated/client";
import { ListDistributions } from "./generated/getters";
import { getNodes } from "./generated/graph";
import { getEdges } from "./edges";

const CloudFrontScanner: ServiceModule<CloudFrontClient, "aws"> = {
  provider: "aws",
  service: "cloudfront",
  key: "CloudFront",
  getClient,
  callPerRegion: true,
  getters: [ListDistributions],
  getNodes,
  getEdges,
};

export default CloudFrontScanner;
