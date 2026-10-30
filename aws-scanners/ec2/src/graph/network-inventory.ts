import type {
  Address,
  DescribeVpcAttributeResult,
  DhcpOptions,
  EgressOnlyInternetGateway,
  FlowLog,
  GetManagedPrefixListEntriesCommandInput,
  GetManagedPrefixListEntriesCommandOutput,
  InternetGateway,
  ManagedPrefixList,
  NatGateway,
  NetworkAcl,
  NetworkInterface,
  PrefixListEntry,
  RouteTable,
  SecurityGroup,
  Subnet,
  TransitGateway,
  TransitGatewayAttachment,
  Vpc,
  VpcEndpoint,
  VpcPeeringConnection,
  VpnGateway,
} from "@aws-sdk/client-ec2";
import { evaluateSelector } from "@infrascan/core";
import type {
  AwsContext,
  Connector,
  Serialized,
  State,
} from "@infrascan/shared-types";

/**
 * Everything the EC2 scanner knows about the networking of a single account + region, gathered from the state of
 * the scanner's getters. It is loaded once by the VPC and subnet entities (mirroring how the auto scaling entity
 * joins DescribePolicies/DescribeLifecycleHooks state) and used to build the `networkContext` component.
 */
export interface RawNetworkInventory {
  vpcs: Vpc[];
  vpcAttributes: DescribeVpcAttributeResult[];
  subnets: Subnet[];
  securityGroups: SecurityGroup[];
  networkInterfaces: NetworkInterface[];
  natGateways: NatGateway[];
  routeTables: RouteTable[];
  internetGateways: InternetGateway[];
  egressOnlyInternetGateways: EgressOnlyInternetGateway[];
  vpcEndpoints: VpcEndpoint[];
  networkAcls: NetworkAcl[];
  peeringConnections: VpcPeeringConnection[];
  transitGateways: TransitGateway[];
  transitGatewayAttachments: TransitGatewayAttachment[];
  vpnGateways: VpnGateway[];
  prefixLists: ManagedPrefixList[];
  prefixListEntries: { prefixListId: string; entries: PrefixListEntry[] }[];
  dhcpOptions: DhcpOptions[];
  flowLogs: FlowLog[];
  addresses: Address[];
}

export type NetworkInventory = Serialized<RawNetworkInventory>;

/**
 * Removes nullish values and items which share an id (e.g. the same resource returned by more than one call),
 * keeping the first occurrence. Items with no id can't be referenced, so they are dropped.
 */
export function uniqueBy<T>(
  items: (T | null | undefined)[],
  getId: (item: T) => string | undefined,
): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (item != null) {
      const id = getId(item);
      if (id != null && !seen.has(id)) {
        seen.add(id);
        unique.push(item);
      }
    }
  }
  return unique;
}

type PrefixListEntriesState = Serialized<
  State<
    GetManagedPrefixListEntriesCommandOutput,
    GetManagedPrefixListEntriesCommandInput
  >
>;

/**
 * Loads the network inventory for the account + region in the given context. Missing state (e.g. a getter that
 * was denied, or state from a scan before the getter existed) is treated as empty.
 */
export async function loadNetworkInventory(
  connector: Connector,
  context: AwsContext,
): Promise<NetworkInventory> {
  async function select<T>(selector: string): Promise<T[]> {
    const result = await evaluateSelector<T>(
      context.account,
      context.region,
      selector,
      connector,
    );
    return Array.isArray(result) ? result.filter((item) => item != null) : [];
  }

  type S<T> = Serialized<T>;
  const [
    vpcs,
    vpcAttributes,
    subnets,
    securityGroups,
    networkInterfaces,
    natGateways,
    routeTables,
    internetGateways,
    egressOnlyInternetGateways,
    vpcEndpoints,
    networkAcls,
    peeringConnections,
    transitGateways,
    transitGatewayAttachments,
    vpnGateways,
    prefixLists,
    prefixListEntryStates,
    dhcpOptions,
    flowLogs,
    addresses,
  ] = await Promise.all([
    select<S<Vpc>>("EC2|DescribeVpcs|[]._result.Vpcs[]"),
    select<S<DescribeVpcAttributeResult>>(
      "EC2|DescribeVpcAttribute|[]._result",
    ),
    select<S<Subnet>>("EC2|DescribeSubnets|[]._result.Subnets[]"),
    select<S<SecurityGroup>>(
      "EC2|DescribeSecurityGroups|[]._result.SecurityGroups[]",
    ),
    select<S<NetworkInterface>>(
      "EC2|DescribeNetworkInterfaces|[]._result.NetworkInterfaces[]",
    ),
    select<S<NatGateway>>("EC2|DescribeNatGateways|[]._result.NatGateways[]"),
    select<S<RouteTable>>("EC2|DescribeRouteTables|[]._result.RouteTables[]"),
    select<S<InternetGateway>>(
      "EC2|DescribeInternetGateways|[]._result.InternetGateways[]",
    ),
    select<S<EgressOnlyInternetGateway>>(
      "EC2|DescribeEgressOnlyInternetGateways|[]._result.EgressOnlyInternetGateways[]",
    ),
    select<S<VpcEndpoint>>(
      "EC2|DescribeVpcEndpoints|[]._result.VpcEndpoints[]",
    ),
    select<S<NetworkAcl>>("EC2|DescribeNetworkAcls|[]._result.NetworkAcls[]"),
    select<S<VpcPeeringConnection>>(
      "EC2|DescribeVpcPeeringConnections|[]._result.VpcPeeringConnections[]",
    ),
    select<S<TransitGateway>>(
      "EC2|DescribeTransitGateways|[]._result.TransitGateways[]",
    ),
    select<S<TransitGatewayAttachment>>(
      "EC2|DescribeTransitGatewayAttachments|[]._result.TransitGatewayAttachments[]",
    ),
    select<S<VpnGateway>>("EC2|DescribeVpnGateways|[]._result.VpnGateways[]"),
    select<S<ManagedPrefixList>>(
      "EC2|DescribeManagedPrefixLists|[]._result.PrefixLists[]",
    ),
    select<PrefixListEntriesState>("EC2|GetManagedPrefixListEntries|[]"),
    select<S<DhcpOptions>>("EC2|DescribeDhcpOptions|[]._result.DhcpOptions[]"),
    select<S<FlowLog>>("EC2|DescribeFlowLogs|[]._result.FlowLogs[]"),
    select<S<Address>>("EC2|DescribeAddresses|[]._result.Addresses[]"),
  ]);

  // Entries for a list can span several pages, merge them by list id
  const entriesByList = new Map<string, S<PrefixListEntry>[]>();
  for (const entryState of prefixListEntryStates) {
    const prefixListId = entryState._parameters?.PrefixListId;
    if (prefixListId != null) {
      const existing = entriesByList.get(prefixListId) ?? [];
      entriesByList.set(
        prefixListId,
        existing.concat(entryState._result?.Entries ?? []),
      );
    }
  }

  return {
    vpcs: uniqueBy(vpcs, (vpc) => vpc.VpcId),
    vpcAttributes: vpcAttributes.filter((attr) => attr.VpcId != null),
    subnets: uniqueBy(subnets, (subnet) => subnet.SubnetId),
    securityGroups: uniqueBy(securityGroups, (group) => group.GroupId),
    networkInterfaces: uniqueBy(
      networkInterfaces,
      (eni) => eni.NetworkInterfaceId,
    ),
    natGateways: uniqueBy(natGateways, (nat) => nat.NatGatewayId),
    routeTables: uniqueBy(routeTables, (table) => table.RouteTableId),
    internetGateways: uniqueBy(
      internetGateways,
      (igw) => igw.InternetGatewayId,
    ),
    egressOnlyInternetGateways: uniqueBy(
      egressOnlyInternetGateways,
      (eigw) => eigw.EgressOnlyInternetGatewayId,
    ),
    vpcEndpoints: uniqueBy(vpcEndpoints, (endpoint) => endpoint.VpcEndpointId),
    networkAcls: uniqueBy(networkAcls, (acl) => acl.NetworkAclId),
    peeringConnections: uniqueBy(
      peeringConnections,
      (pcx) => pcx.VpcPeeringConnectionId,
    ),
    transitGateways: uniqueBy(transitGateways, (tgw) => tgw.TransitGatewayId),
    transitGatewayAttachments: uniqueBy(
      transitGatewayAttachments,
      (attachment) => attachment.TransitGatewayAttachmentId,
    ),
    vpnGateways: uniqueBy(vpnGateways, (vgw) => vgw.VpnGatewayId),
    prefixLists: uniqueBy(prefixLists, (list) => list.PrefixListId),
    prefixListEntries: [...entriesByList.entries()].map(
      ([prefixListId, entries]) => ({ prefixListId, entries }),
    ),
    dhcpOptions: uniqueBy(dhcpOptions, (options) => options.DhcpOptionsId),
    flowLogs: uniqueBy(flowLogs, (flowLog) => flowLog.FlowLogId),
    addresses: uniqueBy(
      addresses,
      (address) => address.AllocationId ?? address.PublicIp,
    ),
  };
}
