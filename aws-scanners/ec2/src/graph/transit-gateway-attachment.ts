import {
  DescribeTransitGatewayAttachmentsCommandInput,
  DescribeTransitGatewayAttachmentsCommandOutput,
  TransitGatewayAttachment,
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
  /**
   * The `tgw-attach-…` id. For peering attachments the node id is `<attachment id>:<transit gateway id>`, since each
   * end of the peering is reported against its own transit gateway, possibly in another account or region.
   */
  attachmentId?: string;
}

export interface TransitGatewayAttachmentState
  extends BaseState<DescribeTransitGatewayAttachmentsCommandInput> {
  transitGatewayAttachment?: TransitGatewayAttachmentDetails;
}

/**
 * DescribeTransitGatewayAttachments state with the placement of each attachment. An attachment to a shared transit
 * gateway is reported by both the transit gateway owner and the resource owner but is one node, owned by
 * `ResourceOwnerId`.
 */
export type TransitGatewayAttachmentRawState = State<
  DescribeTransitGatewayAttachmentsCommandOutput,
  DescribeTransitGatewayAttachmentsCommandInput
> & {
  $placements?: Placements;
};

const PEERING_RESOURCE_TYPES = ["peering", "tgw-peering"];

function isPeering(attachment: Pick<TransitGatewayAttachment, "ResourceType">) {
  return PEERING_RESOURCE_TYPES.includes(attachment.ResourceType ?? "");
}

/**
 * Both ends of a transit gateway peering share an attachment id but each is reported against its own transit gateway
 * (in its own account and region), so peering attachments are keyed by attachment and transit gateway.
 */
export function transitGatewayAttachmentNodeId(
  attachment: Pick<
    TransitGatewayAttachment,
    "TransitGatewayAttachmentId" | "TransitGatewayId" | "ResourceType"
  >,
): string | undefined {
  if (attachment.TransitGatewayAttachmentId == null) {
    return undefined;
  }
  return isPeering(attachment) && attachment.TransitGatewayId != null
    ? `${attachment.TransitGatewayAttachmentId}:${attachment.TransitGatewayId}`
    : attachment.TransitGatewayAttachmentId;
}

/**
 * The account an attachment belongs to: the attached resource's owner, or for a peering end the owner of the transit
 * gateway it is reported against.
 */
function attachmentOwnerId(
  attachment: Pick<
    TransitGatewayAttachment,
    "ResourceType" | "ResourceOwnerId" | "TransitGatewayOwnerId"
  >,
): string | undefined {
  return isPeering(attachment)
    ? attachment.TransitGatewayOwnerId
    : attachment.ResourceOwnerId ?? attachment.TransitGatewayOwnerId;
}

export const TransitGatewayAttachmentEntity: TranslatedEntity<
  TransitGatewayAttachmentState,
  TransitGatewayAttachmentRawState,
  WithCallContext<
    TransitGatewayAttachment & { $placement?: Placement },
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

  async getState(state, context) {
    const pages =
      (await evaluateSelector<Serialized<TransitGatewayAttachmentRawState>>(
        context.account,
        context.region,
        TransitGatewayAttachmentEntity.selector,
        state,
      )) ?? [];
    const $placements = await resolvePlacements(
      state,
      context,
      pages.flatMap((page) => page._result?.TransitGatewayAttachments ?? []),
      {
        getId: transitGatewayAttachmentNodeId,
        getOwner: (attachment) => ({ account: attachmentOwnerId(attachment) }),
        ownerItemsSelector:
          "EC2|DescribeTransitGatewayAttachments|[]._result.TransitGatewayAttachments[]",
      },
    );
    return pages.map((page) => ({ ...page, $placements }));
  },

  translate(val) {
    return (
      val._result.TransitGatewayAttachments?.filter((attachment) =>
        isPlaced(val.$placements, transitGatewayAttachmentNodeId(attachment)),
      ).map((attachment) => ({
        $metadata: val._metadata,
        $parameters: val._parameters,
        $placement:
          val.$placements?.[transitGatewayAttachmentNodeId(attachment)!],
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
        id: transitGatewayAttachmentNodeId(val)!,
        label: val.TransitGatewayAttachmentId!,
        nodeClass: "informational",
        nodeType: TransitGatewayAttachmentEntity.nodeType,
        parent: placedParent(val.$placement, val.$metadata),
      };
    },

    tenant(val) {
      return {
        provider: TransitGatewayAttachmentEntity.provider,
        partition: val.$metadata.partition,
        tenantId: attachmentOwnerId(val) ?? val.$metadata.account,
      };
    },

    resource(val) {
      return {
        id: transitGatewayAttachmentNodeId(val)!,
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
        attachmentId: val.TransitGatewayAttachmentId,
      };
    },
  },
};
