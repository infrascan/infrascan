import type {
  ListResourceRecordSetsCommandInput,
  ListResourceRecordSetsCommandOutput,
  ResourceRecordSet,
} from "@aws-sdk/client-route-53";
import { evaluateSelector } from "@infrascan/core";
import {
  type TranslatedEntity,
  type BaseState,
  type State,
  type WithCallContext,
} from "@infrascan/shared-types";

export interface AliasTarget {
  hostedZoneId?: string;
  dnsName?: string;
  evaluateTargetHealth?: boolean;
}

export type Route53Record = BaseState<ListResourceRecordSetsCommandInput> & {
  route53: {
    alias?: AliasTarget;
    ttl?: number;
  };
};

export const Route53RecordEntity: TranslatedEntity<
  Route53Record,
  State<
    ListResourceRecordSetsCommandOutput[],
    ListResourceRecordSetsCommandInput
  >,
  WithCallContext<ResourceRecordSet, ListResourceRecordSetsCommandInput>
> = {
  version: "0.1.0",
  debugLabel: "route53-record",
  provider: "aws",
  command: "ListResourceRecordSets",
  category: "route53",
  subcategory: "record",
  nodeType: "route53-record",
  selector: "Route53|ListResourceRecordSets|[]",

  getState(state, context) {
    return evaluateSelector(
      context.account,
      context.region,
      Route53RecordEntity.selector,
      state,
    );
  },

  translate(val) {
    return val._result
      .flatMap((record) => record.ResourceRecordSets ?? [])
      .filter((record) => record.Type === "A")
      .map((record) =>
        Object.assign(record, {
          $metadata: val._metadata,
          $parameters: val._parameters,
        }),
      );
  },

  components: {
    $metadata(val) {
      return {
        version: Route53RecordEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: val.Name!,
        label: val.Name!,
        nodeType: Route53RecordEntity.nodeType,
      };
    },

    $source(val) {
      return {
        command: Route53RecordEntity.command,
        parameters: val.$parameters,
      };
    },

    tenant(val) {
      return {
        tenantId: val.$metadata.account,
        provider: Route53RecordEntity.provider,
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
        id: val.Name!,
        name: val.Name!,
        category: Route53RecordEntity.category,
        subcategory: Route53RecordEntity.subcategory,
      };
    },

    dns(val) {
      const domains = [];
      if (val.Name) {
        domains.push(val.Name);
      }
      return {
        domains,
      };
    },

    route53(val) {
      return {
        ttl: val.TTL,
        alias: {
          hostedZoneId: val.AliasTarget?.HostedZoneId,
          dnsName: val.AliasTarget?.DNSName,
          evaluateTargetHealth: val.AliasTarget?.EvaluateTargetHealth,
        },
      };
    },
  },
};
