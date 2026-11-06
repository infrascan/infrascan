import {
  DescribeNetworkAclsCommandInput,
  DescribeNetworkAclsCommandOutput,
  DescribeRouteTablesCommandInput,
  DescribeRouteTablesCommandOutput,
  DescribeSubnetsCommandInput,
  DescribeSubnetsCommandOutput,
  Subnet as Ec2Subnet,
  SubnetState as Ec2SubnetState,
  PrivateDnsNameOptionsOnLaunch,
} from "@aws-sdk/client-ec2";
import { evaluateSelector } from "@infrascan/core";
import type {
  BaseState,
  ReservedAddresses,
  Serialized,
  State,
  TranslatedEntity,
  WithCallContext,
} from "@infrascan/shared-types";

export interface SubnetOnLaunch {
  publicIp?: boolean;
  customerOwnedIp?: boolean;
  privateDns?: PrivateDnsNameOptionsOnLaunch;
}

/**
 * The route table that applies to a subnet
 */
export interface SubnetRouteTable {
  /**
   * `rtb-…` id
   */
  id: string;
  /**
   * The subnet's explicit association, undefined when the association is implicit
   */
  associationId?: string;
  /**
   * Whether the table is the VPC's main route table
   */
  main: boolean;
  /**
   * True when the subnet has no explicit association, so the VPC's main route table applies
   */
  implicit: boolean;
}

/**
 * The network ACL that applies to a subnet. AWS reports an association for every subnet, including those on the
 * VPC's default network ACL.
 */
export interface SubnetNetworkAcl {
  /**
   * `acl-…` id
   */
  id: string;
  associationId?: string;
  isDefault: boolean;
}

export interface Subnet {
  outpostArn?: string;
  isDefault?: boolean;
  onLaunch?: SubnetOnLaunch;
  enableDns64?: boolean;
  state?: Ec2SubnetState;
  assignIpv6?: boolean;
  enablLniAtDeviceIndex?: number;
  /**
   * The `subnet-…` id every other resource references the subnet by (the node id is the subnet ARN)
   */
  subnetId?: string;
  vpcId?: string;
  availabilityZoneId?: string;
  /**
   * Account that owns the subnet, which differs from the scanned account for subnets shared through RAM
   */
  ownerId?: string;
  /**
   * Customer-owned IPv4 address pool (Outposts) the subnet assigns addresses from, a pool id rather than a CIDR
   */
  customerOwnedIpv4Pool?: string;
  /**
   * Undefined when route tables could not be read
   */
  routeTable?: SubnetRouteTable;
  /**
   * Undefined when network ACLs could not be read, or none reports an association for the subnet
   */
  networkAcl?: SubnetNetworkAcl;
}

export interface SubnetState extends BaseState<DescribeSubnetsCommandInput> {
  subnet: Subnet;
}

type RouteTablesState = Serialized<
  State<DescribeRouteTablesCommandOutput, DescribeRouteTablesCommandInput>
>;
type NetworkAclsState = Serialized<
  State<DescribeNetworkAclsCommandOutput, DescribeNetworkAclsCommandInput>
>;

/**
 * DescribeSubnets state joined with the DescribeRouteTables and DescribeNetworkAcls results for the same account and
 * region
 */
export type SubnetRawState = State<
  DescribeSubnetsCommandOutput,
  DescribeSubnetsCommandInput
> & {
  $routeTables?: RouteTablesState[];
  $networkAcls?: NetworkAclsState[];
};

type SubnetWithMembership = Ec2Subnet & {
  $routeTable?: SubnetRouteTable;
  $networkAcl?: SubnetNetworkAcl;
};

const INACTIVE_ASSOCIATION_STATES = [
  "disassociating",
  "disassociated",
  "failed",
];

function isActiveAssociation(state?: string) {
  return state == null || !INACTIVE_ASSOCIATION_STATES.includes(state);
}

function resolveRouteTable(
  subnet: Pick<Ec2Subnet, "SubnetId" | "VpcId">,
  pages: RouteTablesState[],
): SubnetRouteTable | undefined {
  const routeTables = pages
    .flatMap((page) => page._result?.RouteTables ?? [])
    .filter((routeTable) => routeTable.VpcId === subnet.VpcId);
  const isMain = (routeTable: (typeof routeTables)[number]) =>
    routeTable.Associations?.some(
      (association) =>
        association.Main === true &&
        isActiveAssociation(association.AssociationState?.State),
    ) ?? false;

  for (const routeTable of routeTables) {
    const explicit = routeTable.Associations?.find(
      (association) =>
        association.SubnetId != null &&
        association.SubnetId === subnet.SubnetId &&
        isActiveAssociation(association.AssociationState?.State),
    );
    if (explicit != null && routeTable.RouteTableId != null) {
      return {
        id: routeTable.RouteTableId,
        associationId: explicit.RouteTableAssociationId,
        main: isMain(routeTable),
        implicit: false,
      };
    }
  }

  // A subnet without an explicit association uses the VPC's main route table
  const main = routeTables.find(isMain);
  if (main?.RouteTableId == null) {
    return undefined;
  }
  return { id: main.RouteTableId, main: true, implicit: true };
}

function resolveNetworkAcl(
  subnet: Pick<Ec2Subnet, "SubnetId">,
  pages: NetworkAclsState[],
): SubnetNetworkAcl | undefined {
  for (const networkAcl of pages.flatMap(
    (page) => page._result?.NetworkAcls ?? [],
  )) {
    const association = networkAcl.Associations?.find(
      (candidate) =>
        candidate.SubnetId != null && candidate.SubnetId === subnet.SubnetId,
    );
    if (association != null && networkAcl.NetworkAclId != null) {
      return {
        id: networkAcl.NetworkAclId,
        associationId: association.NetworkAclAssociationId,
        isDefault: networkAcl.IsDefault === true,
      };
    }
  }
  return undefined;
}

export const SubnetEntity: TranslatedEntity<
  SubnetState,
  SubnetRawState,
  WithCallContext<SubnetWithMembership, DescribeSubnetsCommandInput>
> = {
  version: "0.1.0",
  debugLabel: "ec2-subnet",
  provider: "aws",
  command: "DescribeSubnets",
  category: "ec2",
  subcategory: "subnet",
  nodeType: "ec2-subnet",
  selector: "EC2|DescribeSubnets|[]",

  async getState(stateConnector, context) {
    const [subnetsState, routeTablesState, networkAclsState] =
      await Promise.all([
        evaluateSelector<Serialized<SubnetRawState>>(
          context.account,
          context.region,
          SubnetEntity.selector,
          stateConnector,
        ),
        evaluateSelector<RouteTablesState>(
          context.account,
          context.region,
          "EC2|DescribeRouteTables|[]",
          stateConnector,
        ),
        evaluateSelector<NetworkAclsState>(
          context.account,
          context.region,
          "EC2|DescribeNetworkAcls|[]",
          stateConnector,
        ),
      ]);
    return (subnetsState ?? []).map((subnetState) => ({
      ...subnetState,
      $routeTables: routeTablesState ?? [],
      $networkAcls: networkAclsState ?? [],
    }));
  },

  translate(val) {
    return (
      val._result.Subnets?.map((subnet) => ({
        $parameters: val._parameters,
        $metadata: val._metadata,
        ...subnet,
        $routeTable: resolveRouteTable(subnet, val.$routeTables ?? []),
        $networkAcl: resolveNetworkAcl(subnet, val.$networkAcls ?? []),
      })) ?? []
    );
  },

  components: {
    $metadata(val) {
      return {
        version: SubnetEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },
    $graph(val) {
      return {
        id: val.SubnetArn!,
        label: val.SubnetId!,
        nodeClass: "informational",
        nodeType: SubnetEntity.nodeType,
        parent: `${val.$metadata.account}-${val.$metadata.region}`,
      };
    },
    tenant(val) {
      return {
        tenantId: val.$metadata.account,
        provider: SubnetEntity.provider,
        partition: val.$metadata.partition,
      };
    },
    resource(val) {
      return {
        id: val.SubnetArn!,
        name: val.SubnetId!,
        category: SubnetEntity.category,
        subcategory: SubnetEntity.subcategory,
      };
    },
    $source(val) {
      return {
        command: SubnetEntity.command,
        parameters: val.$parameters,
      };
    },
    location(val) {
      return {
        code: val.$metadata.region,
        zone: val.AvailabilityZone != null ? [val.AvailabilityZone] : undefined,
      };
    },
    tags(val) {
      return val.Tags?.map((tag) => ({
        key: tag.Key,
        value: tag.Value,
      }));
    },

    subnet(val) {
      return {
        state: val.State,
        isDefault: val.DefaultForAz,
        onLaunch: {
          publicIp: val.MapPublicIpOnLaunch,
          customerOwnedIp: val.MapCustomerOwnedIpOnLaunch,
          privateDns: val.PrivateDnsNameOptionsOnLaunch,
        },
        enableDns64: val.EnableDns64,
        assignIpv6: val.AssignIpv6AddressOnCreation,
        enablLniAtDeviceIndex: val.EnableLniAtDeviceIndex,
        subnetId: val.SubnetId,
        vpcId: val.VpcId,
        availabilityZoneId: val.AvailabilityZoneId,
        ownerId: val.OwnerId,
        customerOwnedIpv4Pool: val.CustomerOwnedIpv4Pool,
        routeTable: val.$routeTable,
        networkAcl: val.$networkAcl,
      };
    },

    network(val) {
      const addresses: ReservedAddresses[] = [];
      if (val.CidrBlock != null) {
        addresses.push({ family: "ipv4", cidrBlock: val.CidrBlock });
      }
      if (
        val.Ipv6CidrBlockAssociationSet != null &&
        val.Ipv6CidrBlockAssociationSet.length > 0
      ) {
        val.Ipv6CidrBlockAssociationSet.forEach((ipv6Assoc) => {
          if (ipv6Assoc.Ipv6CidrBlock != null) {
            addresses.push({
              family: "ipv6",
              cidrBlock: ipv6Assoc.Ipv6CidrBlock,
            });
          }
        });
      }

      return {
        reservedAddresses: addresses,
        vpc: val.VpcId != null ? { id: val.VpcId } : undefined,
        subnet: {
          ipv6Only: val.Ipv6Native,
          availableAddressCount: val.AvailableIpAddressCount,
        },
      };
    },
  },
};
