/**
 * Handles the custom logic for generating edges between Cloudfront nodes and their origins
 * as this logic is too messy to define in the config as normal
 */

const { formatEdge } = require("./graphUtilities");
const { getGlobalStateForServiceAndFunction } = require("../utils");

function generateEdgesForCloudfrontResources() {
  const cloudfrontRecords = getGlobalStateForServiceAndFunction(
    "CloudFront",
    "listDistributions"
  );

  // Not handling OriginGroups currently
  const originDistributions = cloudfrontRecords.flatMap(
    ({ _result: records }) =>
      records.filter(({ Origins }) => {
        return Origins?.Items?.length > 0;
      })
  );

  // Split the alias records by the AWS service they sit in front of
  const { s3 } = originDistributions.reduce(
    (distributionsByType, currentDistribution) => {
      const hasS3Origin = currentDistribution.Origins.Items.find(
        ({ S3OriginConfig, DomainName }) => {
          return (
            Boolean(S3OriginConfig) && DomainName.endsWith(".s3.amazonaws.com")
          );
        }
      );
      if (hasS3Origin) {
        distributionsByType.s3.push(currentDistribution);
      }
      return distributionsByType;
    },
    {
      s3: [],
    }
  );

  let cloudfrontEdges = [];
  // Generate edges for Route53 domains in front of Cloudfront
  const s3State = getGlobalStateForServiceAndFunction(
    "S3",
    "listBuckets"
  ).flatMap(({ _result }) => _result);
  const s3Edges = s3
    .flatMap(({ ARN, Origins }) => {
      const matchedBuckets = s3State.filter(({ Name }) => {
        const relevantOrigin = Origins.Items.find(({ DomainName }) => {
          const bucketName = DomainName.split(".").reverse().pop();
          return Name === bucketName;
        });
        return Boolean(relevantOrigin);
      });
      return matchedBuckets.map(({ Name }) => {
        return formatEdge(ARN, Name, ARN);
      });
    })
    .filter(Boolean);

  return cloudfrontEdges.concat(s3Edges);
}

module.exports = {
  generateEdgesForCloudfrontResources,
};
