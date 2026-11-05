import {
  DescribeTransitGatewaysCommandInput,
  DescribeTransitGatewaysCommandOutput,
  TransitGateway,
} from "@aws-sdk/client-ec2";
import { evaluateSelector, tryNormalizeDateEpoch } from "@infrascan/core";
import type {
  BaseState,
  Serialized,
  State,
  TranslatedEntity,
  WithCallContext,
} from "@infrascan/shared-types";
import {
  isPlaced,
  placedParent,
  resolvePlacements,
  type Placement,
  type Placements,
} from "./ownership";

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

/**
 * DescribeTransitGateways state with the placement of each transit gateway. A transit gateway shared through RAM is
 * reported by its owner and by every participant, but is one node: tenant and parent come from its `OwnerId`.
 */
export type TransitGatewayRawState = State<
  DescribeTransitGatewaysCommandOutput,
  DescribeTransitGatewaysCommandInput
> & {
  $placements?: Placements;
};

export const TransitGatewayEntity: TranslatedEntity<
  TransitGatewayState,
  TransitGatewayRawState,
  WithCallContext<
    TransitGateway & { $placement?: Placement },
    DescribeTransitGatewaysCommandInput
  >
> = {
  version: "0.1.0",
  debugLabel: "ec2-transit-gateway",
  provider: "aws",
  command: "DescribeTransitGateways",
  category: "ec2",
  subcategory: "transit-gateway",
  nodeType: "ec2-transit-gateway",
  selector: "EC2|DescribeTransitGateways|[]",

  async getState(state, context) {
    const pages =
      (await evaluateSelector<Serialized<TransitGatewayRawState>>(
        context.account,
        context.region,
        TransitGatewayEntity.selector,
        state,
      )) ?? [];
    const $placements = await resolvePlacements(
      state,
      context,
      pages.flatMap((page) => page._result?.TransitGateways ?? []),
      {
        getId: (transitGateway) => transitGateway.TransitGatewayId,
        getOwner: (transitGateway) => ({ account: transitGateway.OwnerId }),
        ownerItemsSelector:
          "EC2|DescribeTransitGateways|[]._result.TransitGateways[]",
      },
    );
    return pages.map((page) => ({ ...page, $placements }));
  },

  translate(val) {
    return (
      val._result.TransitGateways?.filter((transitGateway) =>
        isPlaced(val.$placements, transitGateway.TransitGatewayId),
      ).map((transitGateway) => ({
        $metadata: val._metadata,
        $parameters: val._parameters,
        $placement: val.$placements?.[transitGateway.TransitGatewayId!],
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
        parent: placedParent(val.$placement, val.$metadata),
      };
    },

    tenant(val) {
      return {
        provider: TransitGatewayEntity.provider,
        partition: val.$metadata.partition,
        tenantId: val.OwnerId ?? val.$metadata.account,
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
