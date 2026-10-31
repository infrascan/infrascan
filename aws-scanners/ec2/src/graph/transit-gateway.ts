import {
  DescribeTransitGatewaysCommandInput,
  DescribeTransitGatewaysCommandOutput,
  TransitGateway,
} from "@aws-sdk/client-ec2";
import { evaluateSelector, tryNormalizeDateEpoch } from "@infrascan/core";
import type {
  BaseState,
  State,
  TranslatedEntity,
  WithCallContext,
} from "@infrascan/shared-types";

export interface TransitGatewayDetails {
  arn?: string;
  state?: string;
  ownerId?: string;
  description?: string;
  amazonSideAsn?: number;
  autoAcceptSharedAttachments?: string;
  defaultRouteTableAssociation?: string;
  associationDefaultRouteTableId?: string;
  defaultRouteTablePropagation?: string;
  propagationDefaultRouteTableId?: string;
  dnsSupport?: string;
  vpnEcmpSupport?: string;
  cidrBlocks: string[];
}

export interface TransitGatewayState
  extends BaseState<DescribeTransitGatewaysCommandInput> {
  transitGateway?: TransitGatewayDetails;
}

export const TransitGatewayEntity: TranslatedEntity<
  TransitGatewayState,
  State<
    DescribeTransitGatewaysCommandOutput,
    DescribeTransitGatewaysCommandInput
  >,
  WithCallContext<TransitGateway, DescribeTransitGatewaysCommandInput>
> = {
  version: "0.1.0",
  debugLabel: "ec2-transit-gateway",
  provider: "aws",
  command: "DescribeTransitGateways",
  category: "ec2",
  subcategory: "transit-gateway",
  nodeType: "ec2-transit-gateway",
  selector: "EC2|DescribeTransitGateways|[]",

  getState(state, context) {
    return evaluateSelector(
      context.account,
      context.region,
      TransitGatewayEntity.selector,
      state,
    );
  },

  translate(val) {
    return (
      val._result.TransitGateways?.map((transitGateway) => ({
        $metadata: val._metadata,
        $parameters: val._parameters,
        ...transitGateway,
      })) ?? []
    );
  },

  components: {
    $metadata(val) {
      return {
        version: TransitGatewayEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: val.TransitGatewayId!,
        label: val.TransitGatewayId!,
        nodeClass: "informational",
        nodeType: TransitGatewayEntity.nodeType,
        parent: `${val.$metadata.account}-${val.$metadata.region}`,
      };
    },

    tenant(val) {
      return {
        provider: TransitGatewayEntity.provider,
        partition: val.$metadata.partition,
        tenantId: val.$metadata.account,
      };
    },

    resource(val) {
      return {
        id: val.TransitGatewayId!,
        name: val.TransitGatewayId!,
        category: TransitGatewayEntity.category,
        subcategory: TransitGatewayEntity.subcategory,
        description: val.Description,
      };
    },

    tags(val) {
      return val.Tags?.map((tag) => ({
        key: tag.Key,
        value: tag.Value,
      }));
    },

    $source(val) {
      return {
        command: TransitGatewayEntity.command,
        parameters: val.$parameters,
      };
    },

    location(val) {
      return {
        code: val.$metadata.region,
      };
    },

    audit(val) {
      return {
        createdAt: tryNormalizeDateEpoch(val.CreationTime),
      };
    },

    transitGateway(val) {
      return {
        arn: val.TransitGatewayArn,
        state: val.State,
        ownerId: val.OwnerId,
        description: val.Description,
        amazonSideAsn: val.Options?.AmazonSideAsn,
        autoAcceptSharedAttachments: val.Options?.AutoAcceptSharedAttachments,
        defaultRouteTableAssociation: val.Options?.DefaultRouteTableAssociation,
        associationDefaultRouteTableId:
          val.Options?.AssociationDefaultRouteTableId,
        defaultRouteTablePropagation: val.Options?.DefaultRouteTablePropagation,
        propagationDefaultRouteTableId:
          val.Options?.PropagationDefaultRouteTableId,
        dnsSupport: val.Options?.DnsSupport,
        vpnEcmpSupport: val.Options?.VpnEcmpSupport,
        cidrBlocks: val.Options?.TransitGatewayCidrBlocks ?? [],
      };
    },
  },
};
