/**
 * Handles the custom logic for generating edges between Route 53 nodes and their aliased services
 * as this logic is too messy to define in the config as normal
 */

const { formatEdge } = require("./graphUtilities");
const { readStateFromFile } = require("../utils");
const minimatch = require("minimatch");

function generateEdgesForRoute53Resources(account, region) {
  const route53Records = readStateFromFile(
    account,
    region,
    "Route53",
    "listResourceRecordSets"
  );

  // Currently only concerned with alias records
  const aliasRecords = route53Records.flatMap(({ _result: records }) =>
    records.filter(({ Type, AliasTarget }) => {
      return Type === "A" && Boolean(AliasTarget);
    })
  );

  // Split the alias records by the AWS service they sit in front of
  const { cloudfront, s3, apiGateway, elb } = aliasRecords.reduce(
    (aliasByService, currentRecord) => {
      const domain = currentRecord.AliasTarget?.DNSName;
      if (domain?.includes(".cloudfront.net.")) {
        aliasByService.cloudfront.push(currentRecord);
      } else if (domain?.includes(".elb.amazonaws.com.")) {
        aliasByService.elb.push(currentRecord);
      } else if (minimatch(domain, ".execute-api.*.amazonaws.com.")) {
        aliasByService.apiGateway.push(currentRecord);
      } else if (minimatch(domain, "s3-website-*.amazonaws.com.")) {
        aliasByService.s3.push(currentRecord);
      }
      return aliasByService;
    },
    {
      cloudfront: [],
      s3: [],
      apiGateway: [],
      elb: [],
    }
  );

  let route53Edges = [];
  // Generate edges for Route53 domains in front of Cloudfront
  const cloudfrontState = readStateFromFile(
    account,
    region,
    "CloudFront",
    "listDistributions"
  ).flatMap(({ _result }) => _result);
  const cloudfrontEdges = cloudfront
    .map(({ Name, AliasTarget }) => {
      const target = cloudfrontState.find(({ DomainName }) => {
        return `${DomainName}.` === AliasTarget.DNSName;
      });
      if (target) {
        return formatEdge(Name, target.ARN, Name);
      }
    })
    .filter(Boolean);

  route53Edges = route53Edges.concat(cloudfrontEdges);

  // Generate edges for Route53 domains in front of S3 buckets
  const s3State = readStateFromFile(account, region, "S3", "getBucketWebsite");
  const s3Edges = s3
    .map(({ Name }) => {
      const s3Bucket = s3State.find(({ _parameters }) => {
        return `${_parameters.Bucket}.` === Name;
      });
      if (s3Bucket) {
        return formatEdge(Name, s3Bucket._parameters.Bucket, Name);
      }
    })
    .filter(Boolean);

  route53Edges = route53Edges.concat(s3Edges);

  // Generate edges for Route53 domains in front of API Gateways
  // const apiGatewayState = readStateFromFile(
  //   account,
  //   region,
  //   "ApiGatewayV2",
  //   "getApis"
  // );
  // const apiGatewayEdges = apiGateway.map(({ Name }) => {});

  const elbState = readStateFromFile(
    account,
    region,
    "ELBv2",
    "describeLoadBalancers"
  ).flatMap(({ _result }) => _result);
  const elbEdges = elb
    .map(({ Name, AliasTarget }) => {
      const loadBalancer = elbState.find(({ DNSName }) => {
        return AliasTarget?.DNSName?.endsWith(`${DNSName}.`);
      });
      if (loadBalancer) {
        return formatEdge(Name, loadBalancer.LoadBalancerArn, Name);
      }
    })
    .filter(Boolean);

  route53Edges = route53Edges.concat(elbEdges);

  return route53Edges;
}

module.exports = {
  generateEdgesForRoute53Resources,
};
