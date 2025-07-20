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

export interface Route53State {
  alias?: AliasTarget;
  resourceRecords?: string[];
  ttl?: number;
}

export type Route53Record = BaseState<ListResourceRecordSetsCommandInput> & {
  route53: Route53State;
};
export type GraphState = Route53Record;

export const Route53RecordEntity: TranslatedEntity<
  Route53Record,
  State<
    ListResourceRecordSetsCommandOutput,
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
    return (val._result.ResourceRecordSets ?? [])
      .filter(
        (record) =>
          record.Type === "A" ||
          record.Type === "AAAA" ||
          record.Type === "CNAME",
      )
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
        parent: val.$metadata.account,
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

    route53(val): Route53State {
      const route53Context: Route53State = { ttl: val.TTL };
      if (
        val.AliasTarget?.HostedZoneId != null ||
        val.AliasTarget?.DNSName != null ||
        val.AliasTarget?.EvaluateTargetHealth != null
      ) {
        route53Context.alias = {
          hostedZoneId: val.AliasTarget?.HostedZoneId,
          dnsName: val.AliasTarget?.DNSName,
          evaluateTargetHealth: val.AliasTarget?.EvaluateTargetHealth,
        };
      }

      if (
        val.ResourceRecords?.length != null &&
        val.ResourceRecords.length > 0
      ) {
        route53Context.resourceRecords = val.ResourceRecords.map(
          (record) => record.Value,
        ).filter((record) => record != null);
      }

      return route53Context;
    },
  },
};
