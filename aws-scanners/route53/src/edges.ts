import {
  evaluateSelectorGlobally,
  formatEdge,
  formatS3NodeId,
} from "@infrascan/core";
import { minimatch } from "minimatch";
import type {
  DistributionSummary,
  ListDistributionsCommandOutput,
} from "@aws-sdk/client-cloudfront";

import type {
  DescribeLoadBalancersOutput,
  LoadBalancer,
} from "@aws-sdk/client-elastic-load-balancing-v2";

import type {
  ResourceRecordSet,
  ListResourceRecordSetsCommandOutput,
} from "@aws-sdk/client-route-53";

import type {
  ListSubscriptionsByTopicCommandOutput,
  Subscription,
} from "@aws-sdk/client-sns";

import type {
  GetBucketWebsiteCommandInput,
  GetBucketWebsiteOutput,
} from "@aws-sdk/client-s3";
import type { Connector, State, SelectedEdge } from "@infrascan/shared-types";

type AliasRecordsByService = {
  cloudfront: ResourceRecordSet[];
  s3: ResourceRecordSet[];
  apiGateway: ResourceRecordSet[];
  elb: ResourceRecordSet[];
};

export async function aggregateRoute53RecordsByConnectedService(
  route53Records: ResourceRecordSet[],
): Promise<AliasRecordsByService> {
  const aliasRecords = route53Records.filter(
    ({ Type, AliasTarget }) => Type === "A" && Boolean(AliasTarget),
  );

  const aliasRecordsByService: AliasRecordsByService = {
    cloudfront: [],
    s3: [],
    apiGateway: [],
    elb: [],
  };

  return aliasRecords.reduce((aliasRecordsMap, currentRecord) => {
    const domain = currentRecord.AliasTarget?.DNSName;
    if (domain?.includes(".cloudfront.net.")) {
      aliasRecordsMap.cloudfront.push(currentRecord);
    } else if (domain?.includes(".elb.amazonaws.com.")) {
      aliasRecordsMap.elb.push(currentRecord);
    } else if (domain && minimatch(domain, ".execute-api.*.amazonaws.com.")) {
      aliasRecordsMap.apiGateway.push(currentRecord);
    } else if (domain && minimatch(domain, "s3-website-*.amazonaws.com.")) {
      aliasRecordsMap.s3.push(currentRecord);
    }
    return aliasRecordsMap;
  }, aliasRecordsByService);
}

export async function resolveCloudfrontEdges(
  cloudfrontConnectedDomains: ResourceRecordSet[],
  stateConnector: Connector,
): Promise<SelectedEdge[]> {
  const cloudfrontState: State<ListDistributionsCommandOutput>[] =
    await evaluateSelectorGlobally(
      "CloudFront|ListDistributions|[]",
      stateConnector,
    );

  const cloudfrontRecords = cloudfrontState
    .flatMap(({ _result }) => _result?.DistributionList?.Items)
    .filter(
      (distributionSummary) => distributionSummary != null,
    ) as DistributionSummary[];

  return cloudfrontConnectedDomains
    .map(({ Name, AliasTarget }) => {
      const target = cloudfrontRecords.find(
        ({ DomainName }) => `${DomainName}.` === AliasTarget?.DNSName,
      );
      if (target?.ARN && Name) {
        return formatEdge(Name, { name: Name, target: target.ARN });
      }
      return null;
    })
    .filter((edge): edge is SelectedEdge => edge != null);
}

export async function resolveS3Edges(
  s3ConnectedDomains: ResourceRecordSet[],
  stateConnector: Connector,
): Promise<SelectedEdge[]> {
  const s3State: State<
    GetBucketWebsiteOutput[],
    GetBucketWebsiteCommandInput
  >[] = await evaluateSelectorGlobally(
    "S3|GetBucketWebsite|[]",
    stateConnector,
  );

  return s3ConnectedDomains
    .map(({ Name }) => {
      const s3Bucket = s3State.find(
        ({ _parameters }) => `${_parameters?.Bucket}.` === Name,
      );
      if (s3Bucket && Name && s3Bucket._parameters?.Bucket) {
        /* eslint-disable no-underscore-dangle */
        const formattedS3Arn = formatS3NodeId(s3Bucket._parameters.Bucket);
        return formatEdge(Name, { name: Name, target: formattedS3Arn });
      }
      return null;
    })
    .filter((edge): edge is SelectedEdge => edge != null);
}

export async function resolveElbEdges(
  elbConnectedDomains: ResourceRecordSet[],
  stateConnector: Connector,
): Promise<SelectedEdge[]> {
  const elbState: State<DescribeLoadBalancersOutput>[] =
    await evaluateSelectorGlobally(
      "ElasticLoadBalancingV2|DescribeLoadBalancers|[]",
      stateConnector,
    );

  const elbs = elbState
    .flatMap(({ _result }) => _result.LoadBalancers)
    .filter((lb) => Boolean(lb)) as LoadBalancer[];

  return elbConnectedDomains
    .map(({ Name, AliasTarget }) => {
      const loadBalancer = elbs.find(({ DNSName }) =>
        AliasTarget?.DNSName?.endsWith(`${DNSName}.`),
      );
      if (loadBalancer?.LoadBalancerArn && Name) {
        return formatEdge(Name, {
          name: Name,
          target: loadBalancer.LoadBalancerArn,
        });
      }
      return null;
    })
    .filter((edge): edge is SelectedEdge => edge != null);
}

export async function resolveSnsEdges(
  route53Records: ResourceRecordSet[],
  stateConnector: Connector,
): Promise<SelectedEdge[]> {
  const snsSubscriptionState: State<ListSubscriptionsByTopicCommandOutput>[] =
    await evaluateSelectorGlobally(
      "SNS|ListSubscriptionsByTopic|[]",
      stateConnector,
    );
  const snsSubscriptionInfo = snsSubscriptionState
    .flatMap(({ _result }) => _result.Subscriptions)
    .filter((subscriptions) => Boolean(subscriptions)) as Subscription[];

  const webhookSubscriptions = snsSubscriptionInfo.filter(({ Protocol }) =>
    Protocol?.startsWith("http"),
  );

  return webhookSubscriptions
    .flatMap(({ Endpoint, TopicArn, SubscriptionArn }) => {
      if (Endpoint && TopicArn) {
        const parsedUrl = new URL(Endpoint);
        const hostname = `${parsedUrl.host}.`;
        const targetRecord = route53Records.find(
          ({ Name }) => Name === hostname,
        );
        if (targetRecord?.Name && SubscriptionArn) {
          return formatEdge(TopicArn, {
            name: targetRecord.Name,
            target: SubscriptionArn,
          });
        }
      }
      return null;
    })
    .filter((edge): edge is SelectedEdge => edge != null);
}

export async function getEdges(
  stateConnector: Connector,
): Promise<SelectedEdge[]> {
  const route53State: State<ListResourceRecordSetsCommandOutput>[] =
    await evaluateSelectorGlobally(
      "Route53|ListResourceRecordSets|[]",
      stateConnector,
    );

  const route53Records = route53State
    .flatMap(({ _result }) => _result.ResourceRecordSets)
    .filter((recordSet) => recordSet != null) as ResourceRecordSet[];

  const { cloudfront, s3, elb } =
    await aggregateRoute53RecordsByConnectedService(route53Records);
  const cloudfrontEdges = await resolveCloudfrontEdges(
    cloudfront,
    stateConnector,
  );
  const s3Edges = await resolveS3Edges(s3, stateConnector);
  const elbEdges = await resolveElbEdges(elb, stateConnector);
  const snsEdges = await resolveSnsEdges(route53Records, stateConnector);

  return cloudfrontEdges.concat(s3Edges).concat(elbEdges).concat(snsEdges);
}
