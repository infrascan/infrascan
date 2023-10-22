import { formatEdge, formatS3NodeId } from "@infrascan/core";
import { minimatch } from "minimatch";
import type { ListDistributionsCommandOutput } from "@aws-sdk/client-cloudfront";
import type {
  Connector,
  EdgeTarget,
  GraphEdge,
  State,
} from "@infrascan/shared-types";
import type { ListBucketsCommandOutput } from "@aws-sdk/client-s3";

async function generateEdgesForS3BackedDistributions(
  connector: Connector,
): Promise<GraphEdge[]> {
  const cloudfrontS3Edges: GraphEdge[] = [];
  const cloudfrontDistributionsState: State<ListDistributionsCommandOutput>[] =
    await connector.getGlobalStateForServiceFunction(
      "CloudFront",
      "ListDistributions",
    );
  const cloudfrontDistributions = cloudfrontDistributionsState
    .flatMap(({ _result }) => _result.DistributionList?.Items)
    .filter((distribution) => distribution != null);

  const S3State: State<ListBucketsCommandOutput>[] =
    await connector.getGlobalStateForServiceFunction("S3", "ListBuckets");

  for (const distribution of cloudfrontDistributions) {
    if (!distribution?.ARN) {
      /* eslint-disable no-continue  */
      continue;
    }

    const distributionItems = distribution?.Origins?.Items;
    distributionItems?.forEach((distributionOrigin) => {
      const hasS3Domain =
        distributionOrigin?.DomainName?.endsWith(".s3.amazonaws.com") ||
        minimatch(distributionOrigin?.DomainName ?? "", "*.s3.*.amazonaws.com");
      if (!hasS3Domain) {
        console.log(
          distributionOrigin?.DomainName,
          minimatch(
            distributionOrigin?.DomainName ?? "",
            "*.s3.*.amazonaws.com",
          ),
        );
        return;
      }

      const bucketName = distributionOrigin?.DomainName?.split(
        ".",
      ).shift() as string;

      // Do we have a corresponding piece of state for this S3 bucket
      const relevantS3Bucket = S3State.find(({ _result }) =>
        _result.Buckets?.find((bucket) => bucket.Name),
      );

      if (relevantS3Bucket) {
        const distroTarget: EdgeTarget = {
          name: `${bucketName} Distribution`,
          target: formatS3NodeId(bucketName),
        };
        cloudfrontS3Edges.push(
          formatEdge(distribution?.ARN as string, distroTarget),
        );
      }
    });
  }

  return cloudfrontS3Edges;
}

export async function getEdges(connector: Connector): Promise<GraphEdge[]> {
  return generateEdgesForS3BackedDistributions(connector);
}
