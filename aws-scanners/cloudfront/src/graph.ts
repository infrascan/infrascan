import type {
  CacheBehavior,
  DefaultCacheBehavior,
  DistributionSummary,
  ListDistributionsCommandInput,
  ListDistributionsCommandOutput,
  OriginGroup,
} from "@aws-sdk/client-cloudfront";
import { evaluateSelector } from "@infrascan/core";
import type {
  TranslatedEntity,
  BaseState,
  State,
  CommandCallMetadata,
} from "@infrascan/shared-types";

export type CloudfrontDistribution =
  BaseState<ListDistributionsCommandInput> & {
    distribution: {
      originGroups?: OriginGroup[];
      cacheBehaviours?: CacheBehavior[];
      defaultCacheBehaviour?: DefaultCacheBehavior;
    };
  };

type WithCallContext<T, Input> = T & {
  $metadata: CommandCallMetadata;
  $parameters?: Input;
};

export const CloudfrontDistributionEntity: TranslatedEntity<
  CloudfrontDistribution,
  State<ListDistributionsCommandOutput[], ListDistributionsCommandInput>,
  WithCallContext<DistributionSummary, ListDistributionsCommandInput>
> = {
  version: "0.1.0",
  debugLabel: "cloudfront",
  provider: "aws",
  command: "ListDistributions",
  category: "cloudfront",
  subcategory: "distribution",
  nodeType: "cloudfront-distribution",
  selector: "CloudFront|ListDistributions|[]",

  getState(state, context) {
    return evaluateSelector(
      context.account,
      context.region,
      CloudfrontDistributionEntity.selector,
      state,
    );
  },

  translate(val) {
    return val._result
      .flatMap((distributions) => distributions.DistributionList?.Items ?? [])
      .map((distribution) =>
        Object.assign(distribution, {
          $metadata: val._metadata,
          $parameters: val._parameters,
        }),
      );
  },

  components: {
    $metadata(val) {
      return {
        version: CloudfrontDistributionEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: val.ARN!,
        label: val.DomainName!,
        nodeType: CloudfrontDistributionEntity.nodeType,
      };
    },

    $source(val) {
      return {
        command: CloudfrontDistributionEntity.command,
        parameters: val.$parameters,
      };
    },

    dns(val) {
      const domains = [val.DomainName!];
      if (val.Aliases?.Items == null) {
        return { domains };
      }
      return {
        domains: domains.concat(val.Aliases.Items),
      };
    },

    tenant(val) {
      return {
        tenantId: val.$metadata.account,
        provider: CloudfrontDistributionEntity.provider,
        partition: val.$metadata.partition,
      };
    },

    location(val) {
      return {
        code: val.$metadata.region,
      };
    },

    resource(val) {
      return {
        id: val.ARN!,
        name: val.DomainName!,
        category: CloudfrontDistributionEntity.category,
        subcategory: CloudfrontDistributionEntity.subcategory,
        description: val.Comment,
      };
    },

    distribution(val) {
      return {
        originGroups: val.OriginGroups?.Items,
        cacheBehaviours: val.CacheBehaviors?.Items,
        defaultCacheBehaviour: val.DefaultCacheBehavior,
      };
    },
  },
};
