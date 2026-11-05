import {
  DescribeNatGatewaysCommandInput,
  DescribeNatGatewaysCommandOutput,
  DescribeNetworkInterfacesCommandInput,
  DescribeNetworkInterfacesCommandOutput,
  DescribeVpcEndpointsCommandInput,
  DescribeVpcEndpointsCommandOutput,
  NetworkInterface,
} from "@aws-sdk/client-ec2";
import { evaluateSelector } from "@infrascan/core";
import type {
  BaseState,
  Serialized,
  State,
  TranslatedEntity,
  WithCallContext,
} from "@infrascan/shared-types";

/**
 * The resource an interface belongs to, only set from an exact id reported by AWS: the attachment's instance, or a NAT
 * gateway or VPC endpoint whose own record lists this interface
 */
export interface NetworkInterfaceOwner {
  type: "instance" | "nat-gateway" | "vpc-endpoint";
  id: string;
}

export interface NetworkInterfaceDetails {
  interfaceType?: string;
  status?: string;
  description?: string;
  /**
   * Account that owns the interface
   */
  ownerId?: string;
  /**
   * Whether the interface is managed by an AWS service on your behalf
   */
  requesterManaged?: boolean;
  /**
   * The AWS service (or account) that created the interface
   */
  requesterId?: string;
  attachment?: {
    attachmentId?: string;
    instanceId?: string;
    instanceOwnerId?: string;
    deviceIndex?: number;
    status?: string;
  };
  subnetId?: string;
  sourceDestCheck?: boolean;
  elasticIp?: {
    allocationId?: string;
    associationId?: string;
    ipOwnerId?: string;
  };
  /**
   * The service or account that manages the interface (`Operator`), e.g. a managed interface that cannot be modified
   */
  operator?: { managed?: boolean; principal?: string };
  /**
   * Owner of the primary public IP (`Association.IpOwnerId`), `amazon` for AWS assigned addresses
   */
  ipOwnerId?: string;
  /**
   * Every private IPv4 address of the interface, the primary first as AWS reports it, with its public association
   */
  privateIpAddresses: {
    address?: string;
    primary?: boolean;
    privateDnsName?: string;
    publicIp?: string;
    ipOwnerId?: string;
    allocationId?: string;
  }[];
  ipv6Addresses: { address?: string; isPrimary?: boolean }[];
  owner?: NetworkInterfaceOwner;
}

export interface NetworkInterfaceState
  extends BaseState<DescribeNetworkInterfacesCommandInput> {
  networkInterface?: NetworkInterfaceDetails;
}

type NatGatewaysState = Serialized<
  State<DescribeNatGatewaysCommandOutput, DescribeNatGatewaysCommandInput>
>;
type VpcEndpointsState = Serialized<
  State<DescribeVpcEndpointsCommandOutput, DescribeVpcEndpointsCommandInput>
>;

/**
 * DescribeNetworkInterfaces state joined with the DescribeNatGateways and DescribeVpcEndpoints results for the same
 * account and region, which list the interfaces they own by id
 */
export type NetworkInterfaceRawState = State<
  DescribeNetworkInterfacesCommandOutput,
  DescribeNetworkInterfacesCommandInput
> & {
  $natGateways?: NatGatewaysState[];
  $vpcEndpoints?: VpcEndpointsState[];
};

type NetworkInterfaceWithOwner = NetworkInterface & {
  $owner?: NetworkInterfaceOwner;
};

function resolveOwner(
  networkInterface: Pick<NetworkInterface, "NetworkInterfaceId"> & {
    Attachment?: { InstanceId?: string };
  },
  natGateways: NatGatewaysState[],
  vpcEndpoints: VpcEndpointsState[],
): NetworkInterfaceOwner | undefined {
  const id = networkInterface.NetworkInterfaceId;
  if (id == null) {
    return undefined;
  }
  const natGateway = natGateways
    .flatMap((page) => page._result?.NatGateways ?? [])
    .find((candidate) =>
      candidate.NatGatewayAddresses?.some(
        (address) => address.NetworkInterfaceId === id,
      ),
    );
  if (natGateway?.NatGatewayId != null) {
    return { type: "nat-gateway", id: natGateway.NatGatewayId };
  }
  const vpcEndpoint = vpcEndpoints
    .flatMap((page) => page._result?.VpcEndpoints ?? [])
    .find((candidate) => candidate.NetworkInterfaceIds?.includes(id));
  if (vpcEndpoint?.VpcEndpointId != null) {
    return { type: "vpc-endpoint", id: vpcEndpoint.VpcEndpointId };
  }
  if (networkInterface.Attachment?.InstanceId != null) {
    return { type: "instance", id: networkInterface.Attachment.InstanceId };
  }
  return undefined;
}

export const NetworkInterfaceEntity: TranslatedEntity<
  NetworkInterfaceState,
  NetworkInterfaceRawState,
  WithCallContext<
    NetworkInterfaceWithOwner,
    DescribeNetworkInterfacesCommandInput
  >
> = {
  version: "0.1.0",
  debugLabel: "ec2-network-interface",
  provider: "aws",
  command: "DescribeNetworkInterfaces",
  category: "ec2",
  subcategory: "network-interface",
  nodeType: "ec2-network-interface",
  selector: "EC2|DescribeNetworkInterfaces|[]",

  translate(val) {
    return (
      val._result.NetworkInterfaces?.map((networkInterface) => ({
        $metadata: val._metadata,
        $parameters: val._parameters,
        ...networkInterface,
        $owner: resolveOwner(
          networkInterface,
          val.$natGateways ?? [],
          val.$vpcEndpoints ?? [],
        ),
      })) ?? []
    );
  },

  async getState(state, context) {
    const [interfacesState, natGatewaysState, vpcEndpointsState] =
      await Promise.all([
        evaluateSelector<Serialized<NetworkInterfaceRawState>>(
          context.account,
          context.region,
          NetworkInterfaceEntity.selector,
          state,
        ),
        evaluateSelector<NatGatewaysState>(
          context.account,
          context.region,
          "EC2|DescribeNatGateways|[]",
          state,
        ),
        evaluateSelector<VpcEndpointsState>(
          context.account,
          context.region,
          "EC2|DescribeVpcEndpoints|[]",
          state,
        ),
      ]);
    return (interfacesState ?? []).map((interfaceState) => ({
      ...interfaceState,
      $natGateways: natGatewaysState ?? [],
      $vpcEndpoints: vpcEndpointsState ?? [],
    }));
  },

  components: {
    $metadata(val) {
      return {
        version: NetworkInterfaceEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: val.NetworkInterfaceId!,
        label: val.PrivateDnsName ?? val.NetworkInterfaceId!,
        nodeClass: "informational",
        nodeType: NetworkInterfaceEntity.nodeType,
        parent: val.VpcId,
      };
    },

    tenant(val) {
      return {
        provider: NetworkInterfaceEntity.provider,
        partition: val.$metadata.partition,
        tenantId: val.$metadata.account,
      };
    },

    resource(val) {
      return {
        id: val.NetworkInterfaceId!,
        name: val.PrivateDnsName ?? val.NetworkInterfaceId!,
        category: NetworkInterfaceEntity.category,
        subcategory: NetworkInterfaceEntity.subcategory,
        description: val.Description?.length ? val.Description : undefined,
      };
    },

    tags(val) {
      return val.TagSet?.map((tag) => ({
        key: tag.Key,
        value: tag.Value,
      }));
    },

    $source(val) {
      return {
        command: NetworkInterfaceEntity.command,
        parameters: val.$parameters,
      };
    },

    location(val) {
      return {
        code: val.$metadata.region,
        zone: val.AvailabilityZone != null ? [val.AvailabilityZone] : undefined,
      };
    },

    network(val) {
      return {
        targetSubnets: val.SubnetId != null ? [val.SubnetId] : undefined,
        assignedAddresses: {
          ipv4: val.PrivateIpAddress,
          ipv6: val.Ipv6Addresses?.length
            ? val.Ipv6Addresses.map((address) => address.Ipv6Address)
                .filter((address): address is string => address != null)
                .join(", ")
            : undefined,
        },
        publicIp:
          val.Association?.PublicIp != null
            ? {
                status: "enabled",
                address: val.Association?.PublicIp,
              }
            : undefined,
        vpc: {
          id: val.VpcId,
        },
        securityGroups: val.Groups?.map((group) => group.GroupId!),
      };
    },
    dns(val) {
      const domains = [];
      if (val.PrivateDnsName) {
        domains.push(val.PrivateDnsName);
      }
      if (val.Association?.PublicDnsName) {
        domains.push(val.Association?.PublicDnsName);
      }
      return {
        domains,
      };
    },

    networkInterface(val) {
      return {
        interfaceType: val.InterfaceType,
        status: val.Status,
        description: val.Description?.length ? val.Description : undefined,
        ownerId: val.OwnerId,
        requesterManaged: val.RequesterManaged,
        requesterId: val.RequesterId,
        attachment:
          val.Attachment != null
            ? {
                attachmentId: val.Attachment.AttachmentId,
                instanceId: val.Attachment.InstanceId,
                instanceOwnerId: val.Attachment.InstanceOwnerId,
                deviceIndex: val.Attachment.DeviceIndex,
                status: val.Attachment.Status,
              }
            : undefined,
        subnetId: val.SubnetId,
        sourceDestCheck: val.SourceDestCheck,
        elasticIp:
          val.Association?.AllocationId != null
            ? {
                allocationId: val.Association.AllocationId,
                associationId: val.Association.AssociationId,
                ipOwnerId: val.Association.IpOwnerId,
              }
            : undefined,
        operator:
          val.Operator != null
            ? {
                managed: val.Operator.Managed,
                principal: val.Operator.Principal,
              }
            : undefined,
        ipOwnerId: val.Association?.IpOwnerId,
        privateIpAddresses:
          val.PrivateIpAddresses?.map((address) => ({
            address: address.PrivateIpAddress,
            primary: address.Primary,
            privateDnsName: address.PrivateDnsName,
            publicIp: address.Association?.PublicIp,
            ipOwnerId: address.Association?.IpOwnerId,
            allocationId: address.Association?.AllocationId,
          })) ?? [],
        ipv6Addresses:
          val.Ipv6Addresses?.map((address) => ({
            address: address.Ipv6Address,
            isPrimary: address.IsPrimaryIpv6,
          })) ?? [],
        owner: val.$owner,
      };
    },
  },
};
