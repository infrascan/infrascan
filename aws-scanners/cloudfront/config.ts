import * as Cloudfront from "@aws-sdk/client-cloudfront";
import type { ScannerDefinition } from "@infrascan/shared-types";

export type CloudfrontFunctions = "ListDistributions";

const CloudfrontScanner: ScannerDefinition<
  "CloudFront",
  typeof Cloudfront,
  CloudfrontFunctions
> = {
  provider: "aws",
  service: "cloudfront",
  clientKey: "CloudFront",
  key: "CloudFront",
  callPerRegion: false,
  getters: [
    {
      fn: "ListDistributions",
    },
  ],
  nodes: [
    "CloudFront|ListDistributions|[]._result.DistributionList.Items[].{id:ARN,arn:ARN,name:Aliases.Items[0] || DomainName}",
  ],
};

export default CloudfrontScanner;
