/**
 * Handles the custom logic for generating edges between Route 53 nodes and their aliased services
 * as this logic is too messy to define in the config as normal
 */

import { ResourceRecordSet } from "@aws-sdk/client-route-53";
import type {
  GraphEdge,
  GetGlobalStateForServiceFunction,
  State,
} from "@infrascan/shared-types";
import minimatch from "minimatch";
import { GetBucketWebsiteOutput } from "@aws-sdk/client-s3";
import { LoadBalancer } from "@aws-sdk/client-elastic-load-balancing-v2";
import { Subscription } from "@aws-sdk/client-sns";
import type { Formatters } from "@infrascan/config";
import { formatEdge, formatS3NodeId } from "./graph-utilities";

export async function generateEdgesForRoute53Resources(
  getGlobalStateForServiceAndFunction: GetGlobalStateForServiceFunction,
) {
  const route53State: State<ResourceRecordSet[]>[] =
    await getGlobalStateForServiceAndFunction(
      "Route53",
      "ListResourceRecordSets",
    );
  const route53Records = route53State.flatMap(({ _result }) => _result);

  // Currently only concerned with alias records
  const aliasRecords = route53Records.filter(
    ({ Type, AliasTarget }) => Type === "A" && Boolean(AliasTarget),
  );

  // Split the alias records by the AWS service they sit in front of

  const initialValue: Record<string, ResourceRecordSet[]> = {
    cloudfront: [],
    s3: [],
    apiGateway: [],
    elb: [],
  };

  const { cloudfront, s3, elb } = aliasRecords.reduce(
    (aliasByService, currentRecord) => {
      const domain = currentRecord.AliasTarget?.DNSName;
      if (domain?.includes(".cloudfront.net.")) {
        aliasByService.cloudfront.push(currentRecord);
      } else if (domain?.includes(".elb.amazonaws.com.")) {
        aliasByService.elb.push(currentRecord);
      } else if (domain && minimatch(domain, ".execute-api.*.amazonaws.com.")) {
        aliasByService.apiGateway.push(currentRecord);
      } else if (domain && minimatch(domain, "s3-website-*.amazonaws.com.")) {
        aliasByService.s3.push(currentRecord);
      }
      return aliasByService;
    },
    initialValue,
  );

  let route53Edges: GraphEdge[] = [];
  // Generate edges for Route53 domains in front of Cloudfront
  const cloudfrontState: State<Formatters.CloudfrontDistributionSummary[]>[] =
    await getGlobalStateForServiceAndFunction(
      "CloudFront",
      "ListDistributions",
    );
  const cloudfrontRecords = cloudfrontState.flatMap(({ _result }) => _result);
  const cloudfrontEdges = cloudfront
    .map(({ Name, AliasTarget }) => {
      const target = cloudfrontRecords.find(
        ({ DomainName }) => `${DomainName}.` === AliasTarget?.DNSName,
      );
      if (target?.ARN && Name) {
        return formatEdge(Name, target.ARN, Name);
      }
      return null;
    })
    .filter((edge) => edge != null) as GraphEdge[];

  route53Edges = route53Edges.concat(cloudfrontEdges);

  // Generate edges for Route53 domains in front of S3 buckets
  const s3State: State<GetBucketWebsiteOutput[]>[] =
    await getGlobalStateForServiceAndFunction("S3", "GetBucketWebsite");
  const s3Edges = s3
    .map(({ Name }) => {
      const s3Bucket = s3State.find(
        ({ _parameters }) => `${_parameters.Bucket}.` === Name,
      );
      if (s3Bucket && Name) {
        const formattedS3Arn = formatS3NodeId(s3Bucket._parameters.Bucket);
        return formatEdge(Name, formattedS3Arn, Name);
      }
      return null;
    })
    .filter((edge) => edge != null) as GraphEdge[];

  route53Edges = route53Edges.concat(s3Edges);

  // Generate edges for Route53 domains in front of API Gateways
  // const apiGatewayState = getGlobalStateForServiceAndFunction(
  //   "ApiGatewayV2",
  //   "getDomainNames"
  // ).flatMap(({ _result }) => _result);
  // const apiGatewayEdges = apiGatewayState
  //   .flatMap(({ DomainName, DomainNameConfigurations }) => {
  //     const apiGatewayDomain = `${DomainName}.`;
  //     const matchedR53Record = route53Records.find(
  //       ({ Name }) => Name === apiGatewayDomain
  //     );
  //     if (matchedR53Record) {
  //       return formatEdge(
  //         matchedR53Record.Name,
  //         DomainNameConfigurations[0].ApiGatewayDomainName,
  //         `Api Gateway Routing`
  //       );
  //     }
  //   })
  //   .filter(Boolean);
  // route53Edges = route53Edges.concat(apiGatewayEdges);

  const elbState: State<LoadBalancer[]>[] =
    await getGlobalStateForServiceAndFunction(
      "ElasticLoadBalancingV2",
      "DescribeLoadBalancers",
    );
  const elbs = elbState.flatMap(({ _result }) => _result);
  const elbEdges = elb
    .map(({ Name, AliasTarget }) => {
      const loadBalancer = elbs.find(({ DNSName }) =>
        AliasTarget?.DNSName?.endsWith(`${DNSName}.`),
      );
      if (loadBalancer?.LoadBalancerArn && Name) {
        return formatEdge(Name, loadBalancer.LoadBalancerArn, Name);
      }
      return null;
    })
    .filter((edge) => edge != null) as GraphEdge[];

  route53Edges = route53Edges.concat(elbEdges);

  // Generate edges for SNS http/https subscriptions pointed at domains in route53
  const snsSubscriptionState: State<Subscription[]>[] =
    await getGlobalStateForServiceAndFunction(
      "SNS",
      "ListSubscriptionsByTopic",
    );
  const snsSubscriptionInfo = snsSubscriptionState.flatMap(
    ({ _result }) => _result,
  );

  const webhookSubscriptions = snsSubscriptionInfo.filter(({ Protocol }) =>
    Protocol?.startsWith("http"),
  );

  const snsSubscriptionEdges = webhookSubscriptions
    .flatMap(({ Endpoint, TopicArn, SubscriptionArn }) => {
      if (Endpoint && TopicArn) {
        const parsedUrl = new URL(Endpoint);
        const hostname = `${parsedUrl.host}.`;
        const targetRecord = route53Records.find(
          ({ Name }) => Name === hostname,
        );
        if (targetRecord?.Name && SubscriptionArn) {
          return formatEdge(TopicArn, targetRecord.Name, SubscriptionArn);
        }
      }
      return null;
    })
    .filter((edge) => edge != null) as GraphEdge[];

  return route53Edges.concat(snsSubscriptionEdges);
}