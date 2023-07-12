/**
 * Handles the custom logic for generating edges between Cloudfront nodes and their origins
 * as this logic is too messy to define in the config as normal
 */

import type {
  GetGlobalStateForServiceAndFunction,
  GraphEdge,
} from "@infrascan/shared-types";
import type { State } from "@infrascan/shared-types";
import type { Formatters } from "@infrascan/config";
import type { Bucket } from "@aws-sdk/client-s3";
import { formatEdge } from "./graph-utilities";

type GlobalCloudFrontState = State<Formatters.CloudfrontDistributionSummary[]>;
type GlobalS3State = State<Bucket[]>;
export async function generateEdgesForCloudfrontResources(
  getGlobalStateForServiceAndFunction: GetGlobalStateForServiceAndFunction
) {
  const cloudfrontRecords: GlobalCloudFrontState[] =
    await getGlobalStateForServiceAndFunction(
      "CloudFront",
      "ListDistributions"
    );

  // Not handling OriginGroups currently
  const originDistributions = cloudfrontRecords.flatMap(
    ({ _result: records }) =>
      records.filter(({ Origins }) => {
        return Origins?.Items && Origins?.Items.length > 0;
      })
  );

  // Split the alias records by the AWS service they sit in front of
  const initialValue = { cloudfrontS3Connections: [] } as Record<
    string,
    Formatters.CloudfrontDistributionSummary[]
  >;
  const { cloudfrontS3Connections } = originDistributions.reduce(
    (distributionsByType, currentDistribution) => {
      const hasS3Origin = currentDistribution?.Origins?.Items?.find(
        ({ S3OriginConfig, DomainName }) => {
          return (
            Boolean(S3OriginConfig) && DomainName?.endsWith(".s3.amazonaws.com")
          );
        }
      );
      if (hasS3Origin) {
        distributionsByType.cloudfrontS3Connections.push(currentDistribution);
      }
      return distributionsByType;
    },
    initialValue
  );

  const cloudfrontEdges: GraphEdge[] = [];
  // Generate edges for Route53 domains in front of Cloudfront
  const s3State: GlobalS3State[] = await getGlobalStateForServiceAndFunction(
    "S3",
    "ListBuckets"
  );
  const flattenedS3State = s3State.flatMap(({ _result }) => _result);
  const s3Edges = cloudfrontS3Connections
    .flatMap(({ ARN, Origins }) => {
      const matchedBuckets = flattenedS3State.filter(({ Name }) => {
        const relevantOrigin = Origins?.Items?.find(({ DomainName }) => {
          const bucketName = DomainName?.split(".").reverse().pop();
          return Name === bucketName;
        });
        return Boolean(relevantOrigin);
      });
      return matchedBuckets.map(({ Name }) => {
        return formatEdge(ARN as string, Name as string, ARN as string);
      });
    })
    .filter(Boolean);

  return cloudfrontEdges.concat(s3Edges);
}
