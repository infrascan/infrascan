import {
  DescribeTransitGatewayAttachmentsCommandInput,
  DescribeTransitGatewayAttachmentsCommandOutput,
  TransitGatewayAttachment,
} from "@aws-sdk/client-ec2";
import { evaluateSelector, tryNormalizeDateEpoch } from "@infrascan/core";
import type {
  BaseState,
  State,
  TranslatedEntity,
  WithCallContext,
} from "@infrascan/shared-types";

export interface TransitGatewayAttachmentDetails {
  transitGatewayId?: string;
  transitGatewayOwnerId?: string;
  /**
   * `vpc`, `vpn`, `direct-connect-gateway`, `connect`, `peering`, `tgw-peering` or `network-function`
   */
  resourceType?: string;
  resourceId?: string;
  resourceOwnerId?: string;
  state?: string;
  /**
   * The transit gateway route table the attachment is associated with
   */
  association?: { transitGatewayRouteTableId?: string; state?: string };
}

export interface TransitGatewayAttachmentState
  extends BaseState<DescribeTransitGatewayAttachmentsCommandInput> {
  transitGatewayAttachment?: TransitGatewayAttachmentDetails;
}

export const TransitGatewayAttachmentEntity: TranslatedEntity<
  TransitGatewayAttachmentState,
  State<
    DescribeTransitGatewayAttachmentsCommandOutput,
    DescribeTransitGatewayAttachmentsCommandInput
  >,
  WithCallContext<
    TransitGatewayAttachment,
    DescribeTransitGatewayAttachmentsCommandInput
  >
> = {
  version: "0.1.0",
  debugLabel: "ec2-transit-gateway-attachment",
  provider: "aws",
  command: "DescribeTransitGatewayAttachments",
  category: "ec2",
  subcategory: "transit-gateway-attachment",
  nodeType: "ec2-transit-gateway-attachment",
  selector: "EC2|DescribeTransitGatewayAttachments|[]",

  getState(state, context) {
    return evaluateSelector(
      context.account,
      context.region,
      TransitGatewayAttachmentEntity.selector,
      state,
    );
  },

  translate(val) {
    return (
      val._result.TransitGatewayAttachments?.map((attachment) => ({
        $metadata: val._metadata,
        $parameters: val._parameters,
        ...attachment,
      })) ?? []
    );
  },

  components: {
    $metadata(val) {
      return {
        version: TransitGatewayAttachmentEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    // The attached resource can belong to another account when the transit gateway is shared
    $graph(val) {
      return {
        id: val.TransitGatewayAttachmentId!,
        label: val.TransitGatewayAttachmentId!,
        nodeClass: "informational",
        nodeType: TransitGatewayAttachmentEntity.nodeType,
        parent: `${val.$metadata.account}-${val.$metadata.region}`,
      };
    },

    tenant(val) {
      return {
        provider: TransitGatewayAttachmentEntity.provider,
        partition: val.$metadata.partition,
        tenantId: val.$metadata.account,
      };
    },

    resource(val) {
      return {
        id: val.TransitGatewayAttachmentId!,
        name: val.TransitGatewayAttachmentId!,
        category: TransitGatewayAttachmentEntity.category,
        subcategory: TransitGatewayAttachmentEntity.subcategory,
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
        command: TransitGatewayAttachmentEntity.command,
        parameters: val.$parameters,
      };
    },

    location(val) {
      return {
        code: val.$metadata.region,
      };
    },

    network(val) {
      return {
        vpc:
          val.ResourceType === "vpc" && val.ResourceId != null
            ? { id: val.ResourceId }
            : undefined,
      };
    },

    audit(val) {
      return {
        createdAt: tryNormalizeDateEpoch(val.CreationTime),
      };
    },

    transitGatewayAttachment(val) {
      return {
        transitGatewayId: val.TransitGatewayId,
        transitGatewayOwnerId: val.TransitGatewayOwnerId,
        resourceType: val.ResourceType,
        resourceId: val.ResourceId,
        resourceOwnerId: val.ResourceOwnerId,
        state: val.State,
        association:
          val.Association != null
            ? {
                transitGatewayRouteTableId:
                  val.Association.TransitGatewayRouteTableId,
                state: val.Association.State,
              }
            : undefined,
      };
    },
  },
};
