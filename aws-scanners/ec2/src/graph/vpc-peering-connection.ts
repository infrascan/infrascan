import {
  DescribeVpcPeeringConnectionsCommandInput,
  DescribeVpcPeeringConnectionsCommandOutput,
  VpcPeeringConnection,
  VpcPeeringConnectionVpcInfo,
} from "@aws-sdk/client-ec2";
import { evaluateSelector, tryNormalizeDateEpoch } from "@infrascan/core";
import type {
  BaseState,
  Serialized,
  State,
  TranslatedEntity,
  WithCallContext,
} from "@infrascan/shared-types";

export interface PeeredVpc {
  vpcId?: string;
  ownerId?: string;
  region?: string;
  cidrBlocks: string[];
  ipv6CidrBlocks: string[];
  allowDnsResolutionFromRemoteVpc?: boolean;
}

export interface VpcPeeringConnectionDetails {
  status?: string;
  statusMessage?: string;
  /**
   * When an unaccepted request expires, epoch milliseconds
   */
  expiresAt?: number | null;
  requester?: PeeredVpc;
  accepter?: PeeredVpc;
}

export interface VpcPeeringConnectionState
  extends BaseState<DescribeVpcPeeringConnectionsCommandInput> {
  vpcPeeringConnection?: VpcPeeringConnectionDetails;
}

function toPeeredVpc(
  info?: Serialized<VpcPeeringConnectionVpcInfo>,
): PeeredVpc | undefined {
  if (info == null) {
    return undefined;
  }
  const cidrBlocks =
    info.CidrBlockSet?.map((block) => block.CidrBlock).filter(
      (cidr): cidr is string => cidr != null,
    ) ?? [];
  return {
    vpcId: info.VpcId,
    ownerId: info.OwnerId,
    region: info.Region,
    cidrBlocks:
      cidrBlocks.length === 0 && info.CidrBlock != null
        ? [info.CidrBlock]
        : cidrBlocks,
    ipv6CidrBlocks:
      info.Ipv6CidrBlockSet?.map((block) => block.Ipv6CidrBlock).filter(
        (cidr): cidr is string => cidr != null,
      ) ?? [],
    allowDnsResolutionFromRemoteVpc:
      info.PeeringOptions?.AllowDnsResolutionFromRemoteVpc,
  };
}

export const VpcPeeringConnectionEntity: TranslatedEntity<
  VpcPeeringConnectionState,
  State<
    DescribeVpcPeeringConnectionsCommandOutput,
    DescribeVpcPeeringConnectionsCommandInput
  >,
  WithCallContext<
    VpcPeeringConnection,
    DescribeVpcPeeringConnectionsCommandInput
  >
> = {
  version: "0.1.0",
  debugLabel: "ec2-vpc-peering-connection",
  provider: "aws",
  command: "DescribeVpcPeeringConnections",
  category: "ec2",
  subcategory: "vpc-peering-connection",
  nodeType: "ec2-vpc-peering-connection",
  selector: "EC2|DescribeVpcPeeringConnections|[]",

  getState(state, context) {
    return evaluateSelector(
      context.account,
      context.region,
      VpcPeeringConnectionEntity.selector,
      state,
    );
  },

  translate(val) {
    return (
      val._result.VpcPeeringConnections?.map((connection) => ({
        $metadata: val._metadata,
        $parameters: val._parameters,
        ...connection,
      })) ?? []
    );
  },

  components: {
    $metadata(val) {
      return {
        version: VpcPeeringConnectionEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    // Peered VPCs can be in other accounts or regions, so the connection sits under the region rather than a VPC
    $graph(val) {
      return {
        id: val.VpcPeeringConnectionId!,
        label: val.VpcPeeringConnectionId!,
        nodeClass: "informational",
        nodeType: VpcPeeringConnectionEntity.nodeType,
        parent: `${val.$metadata.account}-${val.$metadata.region}`,
      };
    },

    tenant(val) {
      return {
        provider: VpcPeeringConnectionEntity.provider,
        partition: val.$metadata.partition,
        tenantId: val.$metadata.account,
      };
    },

    resource(val) {
      return {
        id: val.VpcPeeringConnectionId!,
        name: val.VpcPeeringConnectionId!,
        category: VpcPeeringConnectionEntity.category,
        subcategory: VpcPeeringConnectionEntity.subcategory,
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
        command: VpcPeeringConnectionEntity.command,
        parameters: val.$parameters,
      };
    },

    location(val) {
      return {
        code: val.$metadata.region,
      };
    },

    vpcPeeringConnection(val) {
      return {
        status: val.Status?.Code,
        statusMessage: val.Status?.Message,
        expiresAt: tryNormalizeDateEpoch(val.ExpirationTime),
        requester: toPeeredVpc(val.RequesterVpcInfo),
        accepter: toPeeredVpc(val.AccepterVpcInfo),
      };
    },
  },
};
