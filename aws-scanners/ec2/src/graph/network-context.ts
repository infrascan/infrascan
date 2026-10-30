import type {
  FlowLog,
  NetworkAcl,
  NetworkAclEntry,
  NetworkInterface,
  Route,
  RouteTable,
  Subnet,
  VpcEndpoint,
} from "@aws-sdk/client-ec2";
import type { Serialized } from "@infrascan/shared-types";
import { classifyEniOwner, type EniOwner } from "./eni-owner";
import type { NetworkInventory } from "./network-inventory";

/*
 * Network context attached to the VPC and subnet nodes as the `networkContext` component.
 *
 * Id conventions: every reference is either the id of a node in the graph or is described in the same context
 * block. VPC, NAT gateway, network interface and security group nodes use their bare ids (`vpc-…`, `nat-…`,
 * `eni-…`, `sg-…`). Subnet nodes are keyed by their ARN, so wherever a subnet is referenced the `subnet-…` id
 * is given alongside its node id as `subnetNodeId`.
 */

export type RouteTargetType =
  | "local"
  | "igw"
  | "eigw"
  | "nat"
  | "tgw"
  | "pcx"
  | "vpce"
  | "eni"
  | "vgw"
  | "instance"
  | "local-gateway"
  | "carrier-gateway"
  | "core-network"
  | "odb-network"
  | "blackhole"
  | "unknown";

export type RouteDestinationType = "ipv4" | "ipv6" | "prefix-list";

export interface InternetGatewayTarget {
  internetGatewayId: string;
  attachmentState?: string;
  attachedToVpc: boolean;
}

export interface EgressOnlyInternetGatewayTarget {
  egressOnlyInternetGatewayId: string;
  attachmentState?: string;
  attachedToVpc: boolean;
}

export interface NatGatewayTarget {
  natGatewayId: string;
  state?: string;
  connectivityType?: string;
  /**
   * Subnet the NAT gateway lives in, follow this subnet's route table for the next hop
   */
  subnetId?: string;
  subnetNodeId?: string;
  vpcId?: string;
  publicIps: string[];
  privateIps: string[];
}

export interface TransitGatewayTarget {
  transitGatewayId: string;
  ownerId?: string;
  state?: string;
  amazonSideAsn?: number;
  /**
   * The attachment connecting this VPC to the transit gateway
   */
  attachment?: TransitGatewayAttachmentSummary;
}

export interface PeerVpcInfo {
  vpcId?: string;
  ownerId?: string;
  region?: string;
  cidrs: string[];
  ipv6Cidrs: string[];
}

export interface PeeringTarget {
  vpcPeeringConnectionId: string;
  status?: string;
  statusMessage?: string;
  /**
   * The role the local VPC plays in the peering connection
   */
  localRole: "requester" | "accepter" | "unknown";
  peer: PeerVpcInfo;
}

export interface VpcEndpointTarget {
  vpcEndpointId: string;
  serviceName?: string;
  endpointType?: string;
  state?: string;
  subnetIds: string[];
}

export interface VpnGatewayTarget {
  vpnGatewayId: string;
  state?: string;
  type?: string;
  amazonSideAsn?: number;
  attachmentState?: string;
  attachedToVpc: boolean;
}

export interface NetworkInterfaceTarget {
  networkInterfaceId: string;
  interfaceType?: string;
  owner: EniOwner;
  instanceId?: string;
  subnetId?: string;
  subnetNodeId?: string;
  sourceDestCheck?: boolean;
}

export interface LocalTarget {
  vpcId?: string;
}

export type RouteTargetDetail =
  | LocalTarget
  | InternetGatewayTarget
  | EgressOnlyInternetGatewayTarget
  | NatGatewayTarget
  | TransitGatewayTarget
  | PeeringTarget
  | VpcEndpointTarget
  | VpnGatewayTarget
  | NetworkInterfaceTarget;

export interface ResolvedRoute {
  destination: string;
  destinationType: RouteDestinationType;
  /**
   * Name of the managed prefix list, when the destination is a prefix list
   */
  destinationPrefixListName?: string;
  targetType: RouteTargetType;
  targetId?: string;
  /**
   * `active` or `blackhole`
   */
  state?: string;
  /**
   * How the route was created: CreateRouteTable, CreateRoute or EnableVgwRoutePropagation
   */
  origin?: string;
  /**
   * Whether the route target was found in the scanned state
   */
  resolved: boolean;
  /**
   * Id of the graph node for the target, when the target is itself a node (VPC for `local`, NAT gateway, ENI)
   */
  targetNodeId?: string;
  /**
   * Details of the target needed to follow it to the next hop. Only set on subnet routes, the VPC context
   * describes each target once in its own lists.
   */
  target?: RouteTargetDetail;
}

export type RouteTableAssociationKind = "explicit" | "main";

export interface SubnetRouteTable {
  routeTableId: string;
  /**
   * `explicit` when the subnet is associated with the table, `main` when it inherits the VPC's main route table
   */
  association: RouteTableAssociationKind;
  associationId?: string;
  propagatingVgwIds: string[];
  routes: ResolvedRoute[];
}

export type SubnetTier =
  | "public"
  | "private-nat"
  | "private-tgw"
  | "private-vgw"
  | "private-pcx"
  | "private-appliance"
  | "private-gwlb-endpoint"
  | "private-other"
  | "blackhole"
  | "isolated"
  | "unknown";

export type SubnetIpv6Tier =
  | "public"
  | "egress-only"
  | "private-nat"
  | "private-tgw"
  | "private-vgw"
  | "private-pcx"
  | "private-appliance"
  | "private-gwlb-endpoint"
  | "private-other"
  | "blackhole"
  | "isolated"
  | "no-ipv6"
  | "unknown";

export interface DefaultRouteSummary {
  destination: string;
  targetType: RouteTargetType;
  targetId?: string;
  state?: string;
}

export interface TierBasis {
  routeTableId?: string;
  routeTableAssociation?: RouteTableAssociationKind;
  /**
   * The subnet's `0.0.0.0/0` route, null when there is none
   */
  ipv4DefaultRoute: DefaultRouteSummary | null;
  /**
   * The subnet's `::/0` route, null when there is none
   */
  ipv6DefaultRoute: DefaultRouteSummary | null;
  hasIpv6Cidr: boolean;
}

export type EgressStatus =
  | "internet"
  | "internet-egress-only"
  | "private-network"
  | "blackhole"
  | "no-default-route"
  | "unresolved"
  | "loop"
  | "unknown";

export interface EgressHop {
  hop: number;
  /**
   * The subnet whose route table is evaluated at this hop
   */
  subnetId: string;
  subnetNodeId?: string;
  routeTableId: string;
  routeTableAssociation: RouteTableAssociationKind;
  destination: string;
  targetType: RouteTargetType;
  targetId?: string;
  state?: string;
  targetNodeId?: string;
  resolved: boolean;
}

export interface EgressPath {
  status: EgressStatus;
  /**
   * The last target on the path
   */
  exit?: { targetType: RouteTargetType; targetId?: string };
  hops: EgressHop[];
  /**
   * Anything that stops or weakens the path, e.g. blackholes, missing targets or unscanned route tables
   */
  issues: string[];
}

export interface EndpointPolicySummary {
  present: boolean;
  /**
   * True for the default policy: a single Allow statement for any principal, action and resource with no conditions
   */
  fullAccess?: boolean;
  statementCount?: number;
  allowStatements?: number;
  denyStatements?: number;
  /**
   * Whether any statement restricts principals to something other than `*`
   */
  restrictsPrincipals?: boolean;
  conditionKeys?: string[];
  parseError?: boolean;
}

export interface GatewayEndpointAccess {
  vpcEndpointId: string;
  serviceName?: string;
  state?: string;
  prefixListId?: string;
  prefixListName?: string;
  routeTableId: string;
  /**
   * Whether the subnet's route table has a route to the endpoint (the endpoint lists the table, or there is a
   * prefix list route targeting it)
   */
  routePresent: boolean;
  policy: EndpointPolicySummary;
}

export interface InterfaceEndpointAccess {
  vpcEndpointId: string;
  serviceName?: string;
  endpointType?: string;
  state?: string;
  /**
   * `in-subnet` when the endpoint has an interface in this subnet, otherwise reachable over the VPC local route
   */
  reachableVia: "in-subnet" | "vpc-local-route";
  endpointSubnetIds: string[];
  networkInterfaceIds: string[];
  privateDnsEnabled?: boolean;
  securityGroupIds: string[];
  policy: EndpointPolicySummary;
}

export interface PrivateServiceAccess {
  gatewayEndpoints: GatewayEndpointAccess[];
  interfaceEndpoints: InterfaceEndpointAccess[];
}

export interface NetworkAclRule {
  ruleNumber?: number;
  action?: string;
  protocol: string;
  cidrBlock?: string;
  ipv6CidrBlock?: string;
  portRange?: { from?: number; to?: number };
  icmp?: { type?: number; code?: number };
  /**
   * The catch-all deny rule (`*`, rule number 32767) every NACL ends with
   */
  isDefaultRule: boolean;
}

export interface NetworkAclContext {
  networkAclId: string;
  isDefault?: boolean;
  /**
   * `explicit` when an association for the subnet was scanned, `default-inferred` when the subnet is assumed to
   * use the VPC's default NACL
   */
  association: "explicit" | "default-inferred";
  associationId?: string;
  inbound: NetworkAclRule[];
  outbound: NetworkAclRule[];
}

export interface FlowLogSummary {
  flowLogId: string;
  scope: "vpc" | "subnet" | "network-interface" | "other";
  resourceId?: string;
  trafficType?: string;
  status?: string;
  deliverLogsStatus?: string;
  destinationType?: string;
  destination?: string;
  logGroupName?: string;
  deliverLogsPermissionArn?: string;
}

export interface PrefixListInfo {
  /**
   * Whether the prefix list was found in the scanned state
   */
  resolved: boolean;
  name?: string;
  ownerId?: string;
  addressFamily?: string;
  maxEntries?: number;
  state?: string;
  /**
   * CIDRs in the list, only fetched for customer managed lists
   */
  entries?: { cidr?: string; description?: string }[];
}

export interface SubnetNetworkContext {
  scope: "subnet";
  subnetId: string;
  subnetNodeId?: string;
  vpcId?: string;
  availabilityZone?: string;
  cidrs: { ipv4: string[]; ipv6: string[] };
  /**
   * The route table in effect for this subnet, undefined when no route table data was scanned
   */
  routeTable?: SubnetRouteTable;
  tier: SubnetTier;
  ipv6Tier: SubnetIpv6Tier;
  tierBasis: TierBasis;
  defaultEgress: { ipv4: EgressPath; ipv6: EgressPath };
  privateServiceAccess: PrivateServiceAccess;
  networkAcl?: NetworkAclContext;
  flowLogs: FlowLogSummary[];
  /**
   * Managed prefix lists referenced by this subnet's routes
   */
  prefixLists: Record<string, PrefixListInfo>;
}

export interface VpcRouteTable {
  routeTableId: string;
  main: boolean;
  associatedSubnetIds: string[];
  gatewayAssociations: {
    gatewayId?: string;
    associationId?: string;
    state?: string;
  }[];
  propagatingVgwIds: string[];
  routes: ResolvedRoute[];
}

export interface VpcSubnetSummary {
  subnetId: string;
  subnetNodeId?: string;
  availabilityZone?: string;
  ipv4Cidr?: string;
  ipv6Cidrs: string[];
  routeTableId?: string;
  routeTableAssociation?: RouteTableAssociationKind;
  networkAclId?: string;
  tier: SubnetTier;
  ipv6Tier: SubnetIpv6Tier;
}

export interface VpcEndpointSummary {
  vpcEndpointId: string;
  endpointType?: string;
  serviceName?: string;
  state?: string;
  routeTableIds: string[];
  subnetIds: string[];
  securityGroupIds: string[];
  networkInterfaceIds: string[];
  privateDnsEnabled?: boolean;
  dnsNames: string[];
  policy: EndpointPolicySummary;
}

export interface TransitGatewayAttachmentSummary {
  transitGatewayAttachmentId: string;
  transitGatewayId?: string;
  transitGatewayOwnerId?: string;
  state?: string;
  transitGatewayRouteTableId?: string;
  associationState?: string;
  transitGateway?: {
    state?: string;
    ownerId?: string;
    amazonSideAsn?: number;
    description?: string;
  };
}

export interface ElasticIpSummary {
  allocationId?: string;
  publicIp?: string;
  associationId?: string;
  networkInterfaceId?: string;
  instanceId?: string;
  privateIpAddress?: string;
  /**
   * What owns the interface the address is associated with
   */
  ownedBy?: EniOwner;
}

export interface VpcNetworkContext {
  scope: "vpc";
  vpcId: string;
  cidrs: { ipv4: string[]; ipv6: string[] };
  dns: { enableDnsSupport?: boolean; enableDnsHostnames?: boolean };
  dhcpOptions?: {
    dhcpOptionsId: string;
    resolved: boolean;
    domainName?: string[];
    domainNameServers?: string[];
    ntpServers?: string[];
    netbiosNameServers?: string[];
    netbiosNodeType?: string[];
  };
  mainRouteTableId?: string;
  subnets: VpcSubnetSummary[];
  routeTables: VpcRouteTable[];
  internetGateways: { internetGatewayId: string; attachmentState?: string }[];
  egressOnlyInternetGateways: {
    egressOnlyInternetGatewayId: string;
    attachmentState?: string;
  }[];
  natGateways: (NatGatewayTarget & { allocationIds: string[] })[];
  vpcEndpoints: VpcEndpointSummary[];
  peeringConnections: PeeringTarget[];
  transitGatewayAttachments: TransitGatewayAttachmentSummary[];
  vpnGateways: VpnGatewayTarget[];
  flowLogs: FlowLogSummary[];
  elasticIps: ElasticIpSummary[];
  /**
   * Managed prefix lists referenced by this VPC's routes, gateway endpoints and security group rules
   */
  prefixLists: Record<string, PrefixListInfo>;
}

type S<T> = Serialized<T>;

const IPV4_DEFAULT = "0.0.0.0/0";
const IPV6_DEFAULT = "::/0";
const MAX_EGRESS_HOPS = 8;

function byString(a?: string, b?: string): number {
  return (a ?? "").localeCompare(b ?? "");
}

function sortedUnique(values: (string | undefined | null)[]): string[] {
  return [
    ...new Set(values.filter((value): value is string => value != null)),
  ].sort(byString);
}

function groupBy<T>(
  items: T[],
  getKey: (item: T) => (string | undefined)[] | string | undefined,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const keys = getKey(item);
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      if (key != null) {
        const existing = grouped.get(key);
        if (existing != null) {
          existing.push(item);
        } else {
          grouped.set(key, [item]);
        }
      }
    }
  }
  return grouped;
}

function indexBy<T>(
  items: T[],
  getKey: (item: T) => string | undefined,
): Map<string, T> {
  const indexed = new Map<string, T>();
  for (const item of items) {
    const key = getKey(item);
    if (key != null && !indexed.has(key)) {
      indexed.set(key, item);
    }
  }
  return indexed;
}

/**
 * Lookup tables over a network inventory, built once per inventory and reused for every node
 */
export interface NetworkIndex {
  inventory: NetworkInventory;
  vpcsById: Map<string, NetworkInventory["vpcs"][number]>;
  subnetsById: Map<string, S<Subnet>>;
  subnetsByVpc: Map<string, S<Subnet>[]>;
  routeTablesByVpc: Map<string, S<RouteTable>[]>;
  mainRouteTableByVpc: Map<string, S<RouteTable>>;
  explicitRouteTableBySubnet: Map<
    string,
    { routeTable: S<RouteTable>; associationId?: string }
  >;
  natGatewaysById: Map<string, NetworkInventory["natGateways"][number]>;
  internetGatewaysById: Map<
    string,
    NetworkInventory["internetGateways"][number]
  >;
  egressOnlyInternetGatewaysById: Map<
    string,
    NetworkInventory["egressOnlyInternetGateways"][number]
  >;
  vpcEndpointsById: Map<string, S<VpcEndpoint>>;
  peeringConnectionsById: Map<
    string,
    NetworkInventory["peeringConnections"][number]
  >;
  transitGatewaysById: Map<string, NetworkInventory["transitGateways"][number]>;
  transitGatewayAttachmentsByVpc: Map<
    string,
    NetworkInventory["transitGatewayAttachments"][number][]
  >;
  vpnGatewaysById: Map<string, NetworkInventory["vpnGateways"][number]>;
  networkInterfacesById: Map<string, S<NetworkInterface>>;
  networkInterfacesByInstance: Map<string, S<NetworkInterface>[]>;
  prefixListsById: Map<string, NetworkInventory["prefixLists"][number]>;
  prefixListEntriesById: Map<
    string,
    NetworkInventory["prefixListEntries"][number]["entries"]
  >;
  dhcpOptionsById: Map<string, NetworkInventory["dhcpOptions"][number]>;
  vpcAttributesByVpc: Map<
    string,
    { enableDnsSupport?: boolean; enableDnsHostnames?: boolean }
  >;
  networkAclBySubnet: Map<
    string,
    { networkAcl: S<NetworkAcl>; associationId?: string }
  >;
  defaultNetworkAclByVpc: Map<string, S<NetworkAcl>>;
  flowLogsByResource: Map<string, S<FlowLog>[]>;
}

const indexCache = new WeakMap<NetworkInventory, NetworkIndex>();

export function buildNetworkIndex(inventory: NetworkInventory): NetworkIndex {
  const cached = indexCache.get(inventory);
  if (cached != null) {
    return cached;
  }

  const routeTablesByVpc = groupBy(
    inventory.routeTables,
    (table) => table.VpcId,
  );
  const mainRouteTableByVpc = new Map<string, S<RouteTable>>();
  const explicitRouteTableBySubnet: NetworkIndex["explicitRouteTableBySubnet"] =
    new Map();
  for (const table of inventory.routeTables) {
    for (const association of table.Associations ?? []) {
      if (association.Main && table.VpcId != null) {
        mainRouteTableByVpc.set(table.VpcId, table);
      }
      if (
        association.SubnetId != null &&
        association.AssociationState?.State !== "disassociated"
      ) {
        explicitRouteTableBySubnet.set(association.SubnetId, {
          routeTable: table,
          associationId: association.RouteTableAssociationId,
        });
      }
    }
  }

  const vpcAttributesByVpc: NetworkIndex["vpcAttributesByVpc"] = new Map();
  for (const attributes of inventory.vpcAttributes) {
    const vpcId = attributes.VpcId!;
    const existing = vpcAttributesByVpc.get(vpcId) ?? {};
    if (attributes.EnableDnsSupport?.Value != null) {
      existing.enableDnsSupport = attributes.EnableDnsSupport.Value;
    }
    if (attributes.EnableDnsHostnames?.Value != null) {
      existing.enableDnsHostnames = attributes.EnableDnsHostnames.Value;
    }
    vpcAttributesByVpc.set(vpcId, existing);
  }

  const networkAclBySubnet: NetworkIndex["networkAclBySubnet"] = new Map();
  const defaultNetworkAclByVpc = new Map<string, S<NetworkAcl>>();
  for (const acl of inventory.networkAcls) {
    if (acl.IsDefault && acl.VpcId != null) {
      defaultNetworkAclByVpc.set(acl.VpcId, acl);
    }
    for (const association of acl.Associations ?? []) {
      if (association.SubnetId != null) {
        networkAclBySubnet.set(association.SubnetId, {
          networkAcl: acl,
          associationId: association.NetworkAclAssociationId,
        });
      }
    }
  }

  const index: NetworkIndex = {
    inventory,
    vpcsById: indexBy(inventory.vpcs, (vpc) => vpc.VpcId),
    subnetsById: indexBy(inventory.subnets, (subnet) => subnet.SubnetId),
    subnetsByVpc: groupBy(inventory.subnets, (subnet) => subnet.VpcId),
    routeTablesByVpc,
    mainRouteTableByVpc,
    explicitRouteTableBySubnet,
    natGatewaysById: indexBy(inventory.natGateways, (nat) => nat.NatGatewayId),
    internetGatewaysById: indexBy(
      inventory.internetGateways,
      (igw) => igw.InternetGatewayId,
    ),
    egressOnlyInternetGatewaysById: indexBy(
      inventory.egressOnlyInternetGateways,
      (eigw) => eigw.EgressOnlyInternetGatewayId,
    ),
    vpcEndpointsById: indexBy(
      inventory.vpcEndpoints,
      (endpoint) => endpoint.VpcEndpointId,
    ),
    peeringConnectionsById: indexBy(
      inventory.peeringConnections,
      (pcx) => pcx.VpcPeeringConnectionId,
    ),
    transitGatewaysById: indexBy(
      inventory.transitGateways,
      (tgw) => tgw.TransitGatewayId,
    ),
    transitGatewayAttachmentsByVpc: groupBy(
      inventory.transitGatewayAttachments,
      (attachment) =>
        attachment.ResourceType === "vpc" ? attachment.ResourceId : undefined,
    ),
    vpnGatewaysById: indexBy(inventory.vpnGateways, (vgw) => vgw.VpnGatewayId),
    networkInterfacesById: indexBy(
      inventory.networkInterfaces,
      (eni) => eni.NetworkInterfaceId,
    ),
    networkInterfacesByInstance: groupBy(
      inventory.networkInterfaces,
      (eni) => eni.Attachment?.InstanceId,
    ),
    prefixListsById: indexBy(
      inventory.prefixLists,
      (list) => list.PrefixListId,
    ),
    prefixListEntriesById: new Map(
      inventory.prefixListEntries.map(({ prefixListId, entries }) => [
        prefixListId,
        entries,
      ]),
    ),
    dhcpOptionsById: indexBy(
      inventory.dhcpOptions,
      (options) => options.DhcpOptionsId,
    ),
    vpcAttributesByVpc,
    networkAclBySubnet,
    defaultNetworkAclByVpc,
    flowLogsByResource: groupBy(
      inventory.flowLogs,
      (flowLog) => flowLog.ResourceId,
    ),
  };
  indexCache.set(inventory, index);
  return index;
}

function subnetNodeIdFor(
  index: NetworkIndex,
  subnetId?: string,
): string | undefined {
  return subnetId != null
    ? index.subnetsById.get(subnetId)?.SubnetArn
    : undefined;
}

function routeDestination(route: S<Route>): {
  destination: string;
  destinationType: RouteDestinationType;
} {
  if (route.DestinationCidrBlock != null) {
    return { destination: route.DestinationCidrBlock, destinationType: "ipv4" };
  }
  if (route.DestinationIpv6CidrBlock != null) {
    return {
      destination: route.DestinationIpv6CidrBlock,
      destinationType: "ipv6",
    };
  }
  return {
    destination: route.DestinationPrefixListId ?? "unknown",
    destinationType: "prefix-list",
  };
}

/**
 * Classifies a route's target. When a route carries more than one target field (e.g. an instance route also
 * carries the instance's ENI), the most specific one wins.
 */
export function classifyRouteTarget(route: S<Route>): {
  targetType: RouteTargetType;
  targetId?: string;
} {
  if (route.NatGatewayId != null) {
    return { targetType: "nat", targetId: route.NatGatewayId };
  }
  if (route.TransitGatewayId != null) {
    return { targetType: "tgw", targetId: route.TransitGatewayId };
  }
  if (route.VpcPeeringConnectionId != null) {
    return { targetType: "pcx", targetId: route.VpcPeeringConnectionId };
  }
  if (route.EgressOnlyInternetGatewayId != null) {
    return { targetType: "eigw", targetId: route.EgressOnlyInternetGatewayId };
  }
  if (route.GatewayId != null) {
    const gatewayId = route.GatewayId;
    if (gatewayId === "local") {
      return { targetType: "local", targetId: "local" };
    }
    if (gatewayId.startsWith("igw-")) {
      return { targetType: "igw", targetId: gatewayId };
    }
    if (gatewayId.startsWith("vgw-")) {
      return { targetType: "vgw", targetId: gatewayId };
    }
    if (gatewayId.startsWith("vpce-")) {
      return { targetType: "vpce", targetId: gatewayId };
    }
    return { targetType: "unknown", targetId: gatewayId };
  }
  if (route.InstanceId != null) {
    return { targetType: "instance", targetId: route.InstanceId };
  }
  if (route.NetworkInterfaceId != null) {
    return { targetType: "eni", targetId: route.NetworkInterfaceId };
  }
  if (route.LocalGatewayId != null) {
    return { targetType: "local-gateway", targetId: route.LocalGatewayId };
  }
  if (route.CarrierGatewayId != null) {
    return { targetType: "carrier-gateway", targetId: route.CarrierGatewayId };
  }
  if (route.CoreNetworkArn != null) {
    return { targetType: "core-network", targetId: route.CoreNetworkArn };
  }
  if (route.OdbNetworkArn != null) {
    return { targetType: "odb-network", targetId: route.OdbNetworkArn };
  }
  return { targetType: route.State === "blackhole" ? "blackhole" : "unknown" };
}

function attachmentFor(
  attachments: { VpcId?: string; State?: string }[] | undefined,
  vpcId: string | undefined,
) {
  return attachments?.find((attachment) => attachment.VpcId === vpcId);
}

function natTarget(
  index: NetworkIndex,
  natGatewayId: string,
): NatGatewayTarget | undefined {
  const nat = index.natGatewaysById.get(natGatewayId);
  if (nat == null) {
    return undefined;
  }
  return {
    natGatewayId,
    state: nat.State,
    connectivityType: nat.ConnectivityType,
    subnetId: nat.SubnetId,
    subnetNodeId: subnetNodeIdFor(index, nat.SubnetId),
    vpcId: nat.VpcId,
    publicIps: sortedUnique(
      nat.NatGatewayAddresses?.map((addr) => addr.PublicIp) ?? [],
    ),
    privateIps: sortedUnique(
      nat.NatGatewayAddresses?.map((addr) => addr.PrivateIp) ?? [],
    ),
  };
}

function transitGatewayAttachmentSummary(
  index: NetworkIndex,
  attachment: NetworkInventory["transitGatewayAttachments"][number],
): TransitGatewayAttachmentSummary {
  const tgw =
    attachment.TransitGatewayId != null
      ? index.transitGatewaysById.get(attachment.TransitGatewayId)
      : undefined;
  return {
    transitGatewayAttachmentId: attachment.TransitGatewayAttachmentId!,
    transitGatewayId: attachment.TransitGatewayId,
    transitGatewayOwnerId: attachment.TransitGatewayOwnerId,
    state: attachment.State,
    transitGatewayRouteTableId:
      attachment.Association?.TransitGatewayRouteTableId,
    associationState: attachment.Association?.State,
    transitGateway:
      tgw != null
        ? {
            state: tgw.State,
            ownerId: tgw.OwnerId,
            amazonSideAsn: tgw.Options?.AmazonSideAsn,
            description: tgw.Description,
          }
        : undefined,
  };
}

function transitGatewayTarget(
  index: NetworkIndex,
  transitGatewayId: string,
  vpcId: string | undefined,
): TransitGatewayTarget | undefined {
  const tgw = index.transitGatewaysById.get(transitGatewayId);
  const attachment = (
    vpcId != null ? index.transitGatewayAttachmentsByVpc.get(vpcId) ?? [] : []
  ).find((candidate) => candidate.TransitGatewayId === transitGatewayId);
  if (tgw == null && attachment == null) {
    return undefined;
  }
  return {
    transitGatewayId,
    ownerId: tgw?.OwnerId ?? attachment?.TransitGatewayOwnerId,
    state: tgw?.State,
    amazonSideAsn: tgw?.Options?.AmazonSideAsn,
    attachment:
      attachment != null
        ? transitGatewayAttachmentSummary(index, attachment)
        : undefined,
  };
}

function peeringTarget(
  index: NetworkIndex,
  peeringConnectionId: string,
  vpcId: string | undefined,
): PeeringTarget | undefined {
  const pcx = index.peeringConnectionsById.get(peeringConnectionId);
  if (pcx == null) {
    return undefined;
  }
  let localRole: PeeringTarget["localRole"] = "unknown";
  let peerInfo = pcx.AccepterVpcInfo;
  if (pcx.RequesterVpcInfo?.VpcId === vpcId) {
    localRole = "requester";
    peerInfo = pcx.AccepterVpcInfo;
  } else if (pcx.AccepterVpcInfo?.VpcId === vpcId) {
    localRole = "accepter";
    peerInfo = pcx.RequesterVpcInfo;
  }
  return {
    vpcPeeringConnectionId: peeringConnectionId,
    status: pcx.Status?.Code,
    statusMessage: pcx.Status?.Message,
    localRole,
    peer: {
      vpcId: peerInfo?.VpcId,
      ownerId: peerInfo?.OwnerId,
      region: peerInfo?.Region,
      cidrs: sortedUnique([
        peerInfo?.CidrBlock,
        ...(peerInfo?.CidrBlockSet?.map((block) => block.CidrBlock) ?? []),
      ]),
      ipv6Cidrs: sortedUnique(
        peerInfo?.Ipv6CidrBlockSet?.map((block) => block.Ipv6CidrBlock) ?? [],
      ),
    },
  };
}

function vpnGatewayTarget(
  index: NetworkIndex,
  vpnGatewayId: string,
  vpcId: string | undefined,
): VpnGatewayTarget | undefined {
  const vgw = index.vpnGatewaysById.get(vpnGatewayId);
  if (vgw == null) {
    return undefined;
  }
  const attachment = attachmentFor(vgw.VpcAttachments, vpcId);
  return {
    vpnGatewayId,
    state: vgw.State,
    type: vgw.Type,
    amazonSideAsn: vgw.AmazonSideAsn,
    attachmentState: attachment?.State,
    attachedToVpc: attachment != null && attachment.State === "attached",
  };
}

function networkInterfaceTarget(
  index: NetworkIndex,
  eni: S<NetworkInterface>,
): NetworkInterfaceTarget {
  return {
    networkInterfaceId: eni.NetworkInterfaceId!,
    interfaceType: eni.InterfaceType,
    owner: classifyEniOwner(eni),
    instanceId: eni.Attachment?.InstanceId,
    subnetId: eni.SubnetId,
    subnetNodeId: subnetNodeIdFor(index, eni.SubnetId),
    sourceDestCheck: eni.SourceDestCheck,
  };
}

function eniForRoute(
  index: NetworkIndex,
  route: S<Route>,
): S<NetworkInterface> | undefined {
  if (route.NetworkInterfaceId != null) {
    const eni = index.networkInterfacesById.get(route.NetworkInterfaceId);
    if (eni != null) {
      return eni;
    }
  }
  if (route.InstanceId != null) {
    const enis = index.networkInterfacesByInstance.get(route.InstanceId) ?? [];
    return (
      enis.find((eni) => eni.Attachment?.DeviceIndex === 0) ??
      [...enis].sort((a, b) =>
        byString(a.NetworkInterfaceId, b.NetworkInterfaceId),
      )[0]
    );
  }
  return undefined;
}

/**
 * Resolves a route to a typed hop. With `withDetails` the target is described well enough to follow it to the
 * next hop.
 */
export function resolveRoute(
  index: NetworkIndex,
  route: S<Route>,
  vpcId: string | undefined,
  withDetails: boolean,
): ResolvedRoute {
  const { destination, destinationType } = routeDestination(route);
  const { targetType, targetId } = classifyRouteTarget(route);
  let target: RouteTargetDetail | undefined;
  let targetNodeId: string | undefined;

  switch (targetType) {
    case "local":
      target = { vpcId };
      targetNodeId = vpcId;
      break;
    case "igw": {
      const igw = index.internetGatewaysById.get(targetId!);
      if (igw != null) {
        const attachment = attachmentFor(igw.Attachments, vpcId);
        target = {
          internetGatewayId: targetId!,
          attachmentState: attachment?.State,
          attachedToVpc:
            attachment != null &&
            (attachment.State === "available" ||
              attachment.State === "attached"),
        };
      }
      break;
    }
    case "eigw": {
      const eigw = index.egressOnlyInternetGatewaysById.get(targetId!);
      if (eigw != null) {
        const attachment = attachmentFor(eigw.Attachments, vpcId);
        target = {
          egressOnlyInternetGatewayId: targetId!,
          attachmentState: attachment?.State,
          attachedToVpc:
            attachment != null &&
            (attachment.State === "attached" ||
              attachment.State === "available"),
        };
      }
      break;
    }
    case "nat":
      target = natTarget(index, targetId!);
      targetNodeId = target != null ? targetId : undefined;
      break;
    case "tgw":
      target = transitGatewayTarget(index, targetId!, vpcId);
      break;
    case "pcx":
      target = peeringTarget(index, targetId!, vpcId);
      break;
    case "vpce": {
      const endpoint = index.vpcEndpointsById.get(targetId!);
      if (endpoint != null) {
        target = {
          vpcEndpointId: targetId!,
          serviceName: endpoint.ServiceName,
          endpointType: endpoint.VpcEndpointType,
          state: endpoint.State,
          subnetIds: sortedUnique(endpoint.SubnetIds ?? []),
        };
      }
      break;
    }
    case "vgw":
      target = vpnGatewayTarget(index, targetId!, vpcId);
      break;
    case "eni":
    case "instance": {
      const eni = eniForRoute(index, route);
      if (eni != null) {
        target = networkInterfaceTarget(index, eni);
        targetNodeId = eni.NetworkInterfaceId;
      }
      break;
    }
    default:
      break;
  }

  const prefixListName =
    destinationType === "prefix-list"
      ? index.prefixListsById.get(destination)?.PrefixListName
      : undefined;

  return {
    destination,
    destinationType,
    destinationPrefixListName: prefixListName,
    targetType,
    targetId,
    state: route.State,
    origin: route.Origin,
    resolved:
      target != null || targetType === "local" || targetType === "blackhole",
    targetNodeId,
    target: withDetails ? target : undefined,
  };
}

function prefixLength(destination: string): number {
  const [, length] = destination.split("/");
  const parsed = Number.parseInt(length ?? "", 10);
  return Number.isNaN(parsed) ? -1 : parsed;
}

const destinationTypeOrder: Record<RouteDestinationType, number> = {
  ipv4: 0,
  ipv6: 1,
  "prefix-list": 2,
};

/**
 * Orders routes deterministically: IPv4, IPv6 then prefix list destinations, most specific prefix first (the
 * order longest prefix matching evaluates them in).
 */
function compareRoutes(a: ResolvedRoute, b: ResolvedRoute): number {
  return (
    destinationTypeOrder[a.destinationType] -
      destinationTypeOrder[b.destinationType] ||
    prefixLength(b.destination) - prefixLength(a.destination) ||
    byString(a.destination, b.destination) ||
    byString(a.targetId, b.targetId)
  );
}

function resolveRoutes(
  index: NetworkIndex,
  table: S<RouteTable>,
  withDetails: boolean,
): ResolvedRoute[] {
  return (table.Routes ?? [])
    .map((route) => resolveRoute(index, route, table.VpcId, withDetails))
    .sort(compareRoutes);
}

interface EffectiveRouteTable {
  routeTable: S<RouteTable>;
  association: RouteTableAssociationKind;
  associationId?: string;
}

/**
 * The route table that applies to a subnet: its explicit association, or the VPC's main route table
 */
export function effectiveRouteTable(
  index: NetworkIndex,
  subnetId: string,
  vpcId: string | undefined,
): EffectiveRouteTable | undefined {
  const explicit = index.explicitRouteTableBySubnet.get(subnetId);
  if (explicit != null) {
    return {
      routeTable: explicit.routeTable,
      association: "explicit",
      associationId: explicit.associationId,
    };
  }
  const resolvedVpcId = vpcId ?? index.subnetsById.get(subnetId)?.VpcId;
  const main =
    resolvedVpcId != null
      ? index.mainRouteTableByVpc.get(resolvedVpcId)
      : undefined;
  if (main != null) {
    return {
      routeTable: main,
      association: "main",
      associationId: main.Associations?.find((assoc) => assoc.Main)
        ?.RouteTableAssociationId,
    };
  }
  return undefined;
}

function findRoute(
  table: S<RouteTable>,
  destination: string,
): S<Route> | undefined {
  return table.Routes?.find(
    (route) =>
      route.DestinationCidrBlock === destination ||
      route.DestinationIpv6CidrBlock === destination,
  );
}

function summarizeDefaultRoute(
  index: NetworkIndex,
  table: S<RouteTable>,
  destination: string,
): DefaultRouteSummary | null {
  const route = findRoute(table, destination);
  if (route == null) {
    return null;
  }
  const { targetType, targetId } = classifyRouteTarget(route);
  return { destination, targetType, targetId, state: route.State };
}

const privateTierByTarget: Partial<Record<RouteTargetType, SubnetTier>> = {
  nat: "private-nat",
  tgw: "private-tgw",
  vgw: "private-vgw",
  pcx: "private-pcx",
  eni: "private-appliance",
  instance: "private-appliance",
  vpce: "private-gwlb-endpoint",
};

function tierFor(defaultRoute: DefaultRouteSummary | null): SubnetTier {
  if (defaultRoute == null) {
    return "isolated";
  }
  if (defaultRoute.state === "blackhole") {
    return "blackhole";
  }
  if (defaultRoute.targetType === "igw") {
    return "public";
  }
  return privateTierByTarget[defaultRoute.targetType] ?? "private-other";
}

function ipv6TierFor(
  defaultRoute: DefaultRouteSummary | null,
  hasIpv6Cidr: boolean,
): SubnetIpv6Tier {
  if (!hasIpv6Cidr) {
    return "no-ipv6";
  }
  if (
    defaultRoute?.targetType === "eigw" &&
    defaultRoute.state !== "blackhole"
  ) {
    return "egress-only";
  }
  return tierFor(defaultRoute);
}

function subnetIpv6Cidrs(subnet: S<Subnet> | undefined): string[] {
  return sortedUnique(
    subnet?.Ipv6CidrBlockAssociationSet?.filter(
      (assoc) =>
        assoc.Ipv6CidrBlockState?.State == null ||
        assoc.Ipv6CidrBlockState.State === "associated",
    ).map((assoc) => assoc.Ipv6CidrBlock) ?? [],
  );
}

/**
 * Derives the tier of a subnet from the default routes of its effective route table
 */
export function deriveTier(
  index: NetworkIndex,
  subnet: S<Subnet>,
): { tier: SubnetTier; ipv6Tier: SubnetIpv6Tier; basis: TierBasis } {
  const hasIpv6Cidr = subnetIpv6Cidrs(subnet).length > 0;
  const effective = effectiveRouteTable(index, subnet.SubnetId!, subnet.VpcId);
  if (effective == null) {
    return {
      tier: "unknown",
      ipv6Tier: hasIpv6Cidr ? "unknown" : "no-ipv6",
      basis: { ipv4DefaultRoute: null, ipv6DefaultRoute: null, hasIpv6Cidr },
    };
  }
  const ipv4DefaultRoute = summarizeDefaultRoute(
    index,
    effective.routeTable,
    IPV4_DEFAULT,
  );
  const ipv6DefaultRoute = summarizeDefaultRoute(
    index,
    effective.routeTable,
    IPV6_DEFAULT,
  );
  return {
    tier: tierFor(ipv4DefaultRoute),
    ipv6Tier: ipv6TierFor(ipv6DefaultRoute, hasIpv6Cidr),
    basis: {
      routeTableId: effective.routeTable.RouteTableId,
      routeTableAssociation: effective.association,
      ipv4DefaultRoute,
      ipv6DefaultRoute,
      hasIpv6Cidr,
    },
  };
}

/**
 * Follows a subnet's default route hop by hop: through NAT gateways, appliances and gateway load balancer
 * endpoints into the subnet they live in, until it leaves the VPC or can't be followed further.
 */
export function traceDefaultEgress(
  index: NetworkIndex,
  startSubnetId: string,
  family: "ipv4" | "ipv6",
): EgressPath {
  const hops: EgressHop[] = [];
  const issues: string[] = [];
  const visited = new Set<string>();
  let destination = family === "ipv4" ? IPV4_DEFAULT : IPV6_DEFAULT;
  let currentSubnetId = startSubnetId;
  let currentVpcId = index.subnetsById.get(startSubnetId)?.VpcId;

  const finish = (
    status: EgressStatus,
    exit?: EgressPath["exit"],
  ): EgressPath => ({ status, exit, hops, issues });

  for (let hopNumber = 1; hopNumber <= MAX_EGRESS_HOPS; hopNumber += 1) {
    const visitKey = `${currentSubnetId}|${destination}`;
    if (visited.has(visitKey)) {
      issues.push(
        `Routing loop: ${destination} from ${currentSubnetId} was already evaluated`,
      );
      return finish("loop");
    }
    visited.add(visitKey);

    const subnet = index.subnetsById.get(currentSubnetId);
    const vpcId = subnet?.VpcId ?? currentVpcId;
    const effective = effectiveRouteTable(index, currentSubnetId, vpcId);
    if (effective == null) {
      issues.push(`No route table data for subnet ${currentSubnetId}`);
      return finish(hopNumber === 1 ? "unknown" : "unresolved");
    }
    const route = findRoute(effective.routeTable, destination);
    if (route == null) {
      issues.push(
        `Route table ${effective.routeTable.RouteTableId} of subnet ${currentSubnetId} has no ${destination} route`,
      );
      return finish("no-default-route");
    }

    const resolved = resolveRoute(
      index,
      route,
      effective.routeTable.VpcId ?? vpcId,
      true,
    );
    hops.push({
      hop: hopNumber,
      subnetId: currentSubnetId,
      subnetNodeId: subnet?.SubnetArn,
      routeTableId: effective.routeTable.RouteTableId!,
      routeTableAssociation: effective.association,
      destination,
      targetType: resolved.targetType,
      targetId: resolved.targetId,
      state: resolved.state,
      targetNodeId: resolved.targetNodeId,
      resolved: resolved.resolved,
    });
    const exit = {
      targetType: resolved.targetType,
      targetId: resolved.targetId,
    };

    if (route.State === "blackhole" || resolved.targetType === "blackhole") {
      issues.push(
        `${destination} route in ${
          effective.routeTable.RouteTableId
        } is a blackhole (target ${
          resolved.targetId ?? "missing"
        } no longer exists)`,
      );
      return finish("blackhole", exit);
    }
    if (!resolved.resolved) {
      issues.push(
        `Target ${resolved.targetId ?? "unknown"} (${
          resolved.targetType
        }) was not found in the scanned state`,
      );
      return finish("unresolved", exit);
    }

    const { target } = resolved;
    switch (resolved.targetType) {
      case "igw": {
        const igw = target as InternetGatewayTarget;
        if (!igw.attachedToVpc) {
          issues.push(
            `Internet gateway ${igw.internetGatewayId} is not attached to ${vpcId}`,
          );
          return finish("unresolved", exit);
        }
        if (hops.length > 1) {
          const previousHop = hops[hops.length - 2];
          if (previousHop.targetType === "nat") {
            const nat = index.natGatewaysById.get(previousHop.targetId!);
            if (nat?.ConnectivityType === "private") {
              issues.push(
                `NAT gateway ${previousHop.targetId} is private and can't send traffic to an internet gateway`,
              );
              return finish("blackhole", exit);
            }
          }
        }
        return finish("internet", exit);
      }
      case "eigw": {
        const eigw = target as EgressOnlyInternetGatewayTarget;
        if (!eigw.attachedToVpc) {
          issues.push(
            `Egress-only internet gateway ${eigw.egressOnlyInternetGatewayId} is not attached to ${vpcId}`,
          );
          return finish("unresolved", exit);
        }
        return finish("internet-egress-only", exit);
      }
      case "carrier-gateway":
        return finish("internet", exit);
      case "nat": {
        const nat = target as NatGatewayTarget;
        if (nat.state != null && nat.state !== "available") {
          issues.push(`NAT gateway ${nat.natGatewayId} is ${nat.state}`);
        }
        if (nat.subnetId == null) {
          issues.push(`NAT gateway ${nat.natGatewayId} has no subnet`);
          return finish("unresolved", exit);
        }
        // NAT gateways translate IPv6 (NAT64) to IPv4, so the next hop is the NAT subnet's IPv4 default route
        destination = IPV4_DEFAULT;
        currentSubnetId = nat.subnetId;
        currentVpcId = nat.vpcId ?? vpcId;
        break;
      }
      case "eni":
      case "instance": {
        const eni = target as NetworkInterfaceTarget;
        if (eni.sourceDestCheck === true) {
          issues.push(
            `${eni.networkInterfaceId} has source/destination check enabled, forwarded traffic will be dropped`,
          );
        }
        if (eni.subnetId == null) {
          return finish("unresolved", exit);
        }
        issues.push(
          `Traffic is forwarded by appliance ${eni.networkInterfaceId}; the path assumes it forwards to its subnet's default route`,
        );
        currentSubnetId = eni.subnetId;
        break;
      }
      case "vpce": {
        const endpoint = target as VpcEndpointTarget;
        if (
          endpoint.endpointType !== "GatewayLoadBalancer" ||
          endpoint.subnetIds.length === 0
        ) {
          return finish("unresolved", exit);
        }
        issues.push(
          `Traffic is inspected via gateway load balancer endpoint ${endpoint.vpcEndpointId} and returns to its subnet's route table`,
        );
        [currentSubnetId] = endpoint.subnetIds;
        break;
      }
      case "pcx":
        issues.push(
          "VPC peering does not support edge-to-edge routing: the default route only reaches the peer VPC's CIDRs",
        );
        return finish("private-network", exit);
      case "tgw":
        issues.push(
          "Traffic continues in the transit gateway route table, which is not scanned",
        );
        return finish("private-network", exit);
      case "vgw":
      case "local-gateway":
      case "core-network":
      case "odb-network":
        return finish("private-network", exit);
      default:
        return finish("unresolved", exit);
    }
  }
  issues.push(`Path exceeded ${MAX_EGRESS_HOPS} hops`);
  return finish("loop");
}

/**
 * Summarizes a VPC endpoint policy without copying it
 */
export function summarizeEndpointPolicy(
  policyDocument?: string,
): EndpointPolicySummary {
  if (policyDocument == null || policyDocument.length === 0) {
    return { present: false };
  }
  try {
    const parsed = JSON.parse(policyDocument) as {
      Statement?: Record<string, unknown> | Record<string, unknown>[];
    };
    const statements = Array.isArray(parsed.Statement)
      ? parsed.Statement
      : [parsed.Statement ?? {}];
    const isWildcard = (value: unknown) =>
      value === "*" ||
      (Array.isArray(value) && value.length === 1 && value[0] === "*");
    const isAnyPrincipal = (principal: unknown) =>
      isWildcard(principal) ||
      (typeof principal === "object" &&
        principal != null &&
        isWildcard((principal as Record<string, unknown>).AWS));
    const conditionKeys = sortedUnique(
      statements.flatMap((statement) =>
        Object.values(
          (statement.Condition as Record<string, Record<string, unknown>>) ??
            {},
        ).flatMap((operator) => Object.keys(operator ?? {})),
      ),
    );
    const allowStatements = statements.filter(
      (statement) => statement.Effect === "Allow",
    ).length;
    return {
      present: true,
      fullAccess:
        statements.length === 1 &&
        statements[0].Effect === "Allow" &&
        isAnyPrincipal(statements[0].Principal) &&
        isWildcard(statements[0].Action) &&
        isWildcard(statements[0].Resource) &&
        statements[0].Condition == null,
      statementCount: statements.length,
      allowStatements,
      denyStatements: statements.length - allowStatements,
      restrictsPrincipals: statements.some(
        (statement) =>
          statement.Principal != null && !isAnyPrincipal(statement.Principal),
      ),
      conditionKeys,
    };
  } catch {
    return { present: true, parseError: true };
  }
}

function gatewayEndpointPrefixList(
  index: NetworkIndex,
  endpoint: S<VpcEndpoint>,
  table: S<RouteTable>,
): { prefixListId?: string; prefixListName?: string; routePresent: boolean } {
  const route = table.Routes?.find(
    (candidate) =>
      candidate.GatewayId === endpoint.VpcEndpointId &&
      candidate.DestinationPrefixListId != null,
  );
  const prefixListId =
    route?.DestinationPrefixListId ??
    index.inventory.prefixLists.find(
      (list) => list.PrefixListName === endpoint.ServiceName,
    )?.PrefixListId;
  return {
    prefixListId,
    prefixListName:
      prefixListId != null
        ? index.prefixListsById.get(prefixListId)?.PrefixListName
        : undefined,
    routePresent:
      route != null ||
      (endpoint.RouteTableIds ?? []).includes(table.RouteTableId!),
  };
}

function privateServiceAccessFor(
  index: NetworkIndex,
  subnet: S<Subnet>,
  effective: EffectiveRouteTable | undefined,
): PrivateServiceAccess {
  const vpcEndpoints = index.inventory.vpcEndpoints.filter(
    (endpoint) =>
      endpoint.VpcId === subnet.VpcId &&
      endpoint.State?.toLowerCase() !== "deleted",
  );
  const gatewayEndpoints: GatewayEndpointAccess[] = [];
  if (effective != null) {
    const table = effective.routeTable;
    for (const endpoint of vpcEndpoints) {
      if (endpoint.VpcEndpointType === "Gateway") {
        const access = gatewayEndpointPrefixList(index, endpoint, table);
        if (access.routePresent) {
          gatewayEndpoints.push({
            vpcEndpointId: endpoint.VpcEndpointId!,
            serviceName: endpoint.ServiceName,
            state: endpoint.State,
            ...access,
            routeTableId: table.RouteTableId!,
            policy: summarizeEndpointPolicy(endpoint.PolicyDocument),
          });
        }
      }
    }
  }

  const interfaceEndpoints: InterfaceEndpointAccess[] = vpcEndpoints
    .filter((endpoint) => endpoint.VpcEndpointType !== "Gateway")
    .map((endpoint) => {
      const endpointSubnetIds = sortedUnique(endpoint.SubnetIds ?? []);
      const inSubnet = endpointSubnetIds.includes(subnet.SubnetId!);
      return {
        vpcEndpointId: endpoint.VpcEndpointId!,
        serviceName: endpoint.ServiceName,
        endpointType: endpoint.VpcEndpointType,
        state: endpoint.State,
        reachableVia: inSubnet ? "in-subnet" : "vpc-local-route",
        endpointSubnetIds,
        networkInterfaceIds: sortedUnique(
          (endpoint.NetworkInterfaceIds ?? []).filter(
            (eniId) =>
              index.networkInterfacesById.get(eniId)?.SubnetId ===
              subnet.SubnetId,
          ),
        ),
        privateDnsEnabled: endpoint.PrivateDnsEnabled,
        securityGroupIds: sortedUnique(
          endpoint.Groups?.map((group) => group.GroupId) ?? [],
        ),
        policy: summarizeEndpointPolicy(endpoint.PolicyDocument),
      };
    });

  return {
    gatewayEndpoints: gatewayEndpoints.sort((a, b) =>
      byString(a.vpcEndpointId, b.vpcEndpointId),
    ),
    interfaceEndpoints: interfaceEndpoints.sort((a, b) =>
      byString(a.vpcEndpointId, b.vpcEndpointId),
    ),
  };
}

const protocolNames: Record<string, string> = {
  "-1": "all",
  "1": "icmp",
  "6": "tcp",
  "17": "udp",
  "58": "icmpv6",
};

function toNetworkAclRule(entry: S<NetworkAclEntry>): NetworkAclRule {
  const protocol = entry.Protocol ?? "unknown";
  return {
    ruleNumber: entry.RuleNumber,
    action: entry.RuleAction,
    protocol: protocolNames[protocol] ?? protocol,
    cidrBlock: entry.CidrBlock,
    ipv6CidrBlock: entry.Ipv6CidrBlock,
    portRange:
      entry.PortRange != null
        ? { from: entry.PortRange.From, to: entry.PortRange.To }
        : undefined,
    icmp:
      entry.IcmpTypeCode != null
        ? { type: entry.IcmpTypeCode.Type, code: entry.IcmpTypeCode.Code }
        : undefined,
    isDefaultRule: entry.RuleNumber === 32767,
  };
}

function compareAclRules(a: NetworkAclRule, b: NetworkAclRule): number {
  return (
    (a.ruleNumber ?? Number.MAX_SAFE_INTEGER) -
      (b.ruleNumber ?? Number.MAX_SAFE_INTEGER) ||
    byString(a.cidrBlock ?? a.ipv6CidrBlock, b.cidrBlock ?? b.ipv6CidrBlock)
  );
}

function networkAclFor(
  index: NetworkIndex,
  subnet: S<Subnet>,
): NetworkAclContext | undefined {
  const explicit = index.networkAclBySubnet.get(subnet.SubnetId!);
  const acl =
    explicit?.networkAcl ??
    (subnet.VpcId != null
      ? index.defaultNetworkAclByVpc.get(subnet.VpcId)
      : undefined);
  if (acl == null) {
    return undefined;
  }
  const entries = (acl.Entries ?? []).map((entry) => ({
    egress: entry.Egress === true,
    rule: toNetworkAclRule(entry),
  }));
  return {
    networkAclId: acl.NetworkAclId!,
    isDefault: acl.IsDefault,
    association: explicit != null ? "explicit" : "default-inferred",
    associationId: explicit?.associationId,
    inbound: entries
      .filter((entry) => !entry.egress)
      .map((entry) => entry.rule)
      .sort(compareAclRules),
    outbound: entries
      .filter((entry) => entry.egress)
      .map((entry) => entry.rule)
      .sort(compareAclRules),
  };
}

function flowLogScope(resourceId?: string): FlowLogSummary["scope"] {
  if (resourceId?.startsWith("vpc-")) return "vpc";
  if (resourceId?.startsWith("subnet-")) return "subnet";
  if (resourceId?.startsWith("eni-")) return "network-interface";
  return "other";
}

function toFlowLogSummary(flowLog: S<FlowLog>): FlowLogSummary {
  return {
    flowLogId: flowLog.FlowLogId!,
    scope: flowLogScope(flowLog.ResourceId),
    resourceId: flowLog.ResourceId,
    trafficType: flowLog.TrafficType,
    status: flowLog.FlowLogStatus,
    deliverLogsStatus: flowLog.DeliverLogsStatus,
    destinationType: flowLog.LogDestinationType,
    destination: flowLog.LogDestination,
    logGroupName: flowLog.LogGroupName,
    deliverLogsPermissionArn: flowLog.DeliverLogsPermissionArn,
  };
}

function flowLogsFor(
  index: NetworkIndex,
  resourceIds: (string | undefined)[],
): FlowLogSummary[] {
  return sortedUnique(resourceIds)
    .flatMap((resourceId) => index.flowLogsByResource.get(resourceId) ?? [])
    .map(toFlowLogSummary)
    .sort(
      (a, b) =>
        byString(a.resourceId, b.resourceId) ||
        byString(a.flowLogId, b.flowLogId),
    );
}

function prefixListsFor(
  index: NetworkIndex,
  prefixListIds: (string | undefined)[],
): Record<string, PrefixListInfo> {
  const lists: Record<string, PrefixListInfo> = {};
  for (const prefixListId of sortedUnique(prefixListIds)) {
    const list = index.prefixListsById.get(prefixListId);
    const entries = index.prefixListEntriesById.get(prefixListId);
    lists[prefixListId] =
      list != null
        ? {
            resolved: true,
            name: list.PrefixListName,
            ownerId: list.OwnerId,
            addressFamily: list.AddressFamily,
            maxEntries: list.MaxEntries,
            state: list.State,
            entries: entries
              ?.map((entry) => ({
                cidr: entry.Cidr,
                description: entry.Description,
              }))
              .sort((a, b) => byString(a.cidr, b.cidr)),
          }
        : { resolved: false };
  }
  return lists;
}

/**
 * Builds the `networkContext` component for a subnet node
 */
export function buildSubnetNetworkContext(
  inventory: NetworkInventory,
  subnet: S<Subnet>,
): SubnetNetworkContext {
  const index = buildNetworkIndex(inventory);
  const subnetId = subnet.SubnetId!;
  const effective = effectiveRouteTable(index, subnetId, subnet.VpcId);
  const { tier, ipv6Tier, basis } = deriveTier(index, subnet);
  const routes =
    effective != null
      ? resolveRoutes(index, effective.routeTable, true)
      : undefined;

  return {
    scope: "subnet",
    subnetId,
    subnetNodeId: subnet.SubnetArn,
    vpcId: subnet.VpcId,
    availabilityZone: subnet.AvailabilityZone,
    cidrs: {
      ipv4: sortedUnique([subnet.CidrBlock]),
      ipv6: subnetIpv6Cidrs(subnet),
    },
    routeTable:
      effective != null
        ? {
            routeTableId: effective.routeTable.RouteTableId!,
            association: effective.association,
            associationId: effective.associationId,
            propagatingVgwIds: sortedUnique(
              effective.routeTable.PropagatingVgws?.map(
                (vgw) => vgw.GatewayId,
              ) ?? [],
            ),
            routes: routes!,
          }
        : undefined,
    tier,
    ipv6Tier,
    tierBasis: basis,
    defaultEgress: {
      ipv4: traceDefaultEgress(index, subnetId, "ipv4"),
      ipv6:
        ipv6Tier === "no-ipv6"
          ? {
              status: "no-default-route",
              hops: [],
              issues: ["Subnet has no IPv6 CIDR"],
            }
          : traceDefaultEgress(index, subnetId, "ipv6"),
    },
    privateServiceAccess: privateServiceAccessFor(index, subnet, effective),
    networkAcl: networkAclFor(index, subnet),
    flowLogs: flowLogsFor(index, [subnetId, subnet.VpcId]),
    prefixLists: prefixListsFor(
      index,
      routes
        ?.filter((route) => route.destinationType === "prefix-list")
        .map((route) => route.destination) ?? [],
    ),
  };
}

function vpcEndpointSummary(endpoint: S<VpcEndpoint>): VpcEndpointSummary {
  return {
    vpcEndpointId: endpoint.VpcEndpointId!,
    endpointType: endpoint.VpcEndpointType,
    serviceName: endpoint.ServiceName,
    state: endpoint.State,
    routeTableIds: sortedUnique(endpoint.RouteTableIds ?? []),
    subnetIds: sortedUnique(endpoint.SubnetIds ?? []),
    securityGroupIds: sortedUnique(
      endpoint.Groups?.map((group) => group.GroupId) ?? [],
    ),
    networkInterfaceIds: sortedUnique(endpoint.NetworkInterfaceIds ?? []),
    privateDnsEnabled: endpoint.PrivateDnsEnabled,
    dnsNames: sortedUnique(
      endpoint.DnsEntries?.map((entry) => entry.DnsName) ?? [],
    ),
    policy: summarizeEndpointPolicy(endpoint.PolicyDocument),
  };
}

function dhcpValues(
  options: NetworkInventory["dhcpOptions"][number],
  key: string,
): string[] | undefined {
  const config = options.DhcpConfigurations?.find(
    (candidate) => candidate.Key === key,
  );
  if (config == null) {
    return undefined;
  }
  return (config.Values ?? [])
    .map((value) => value.Value)
    .filter((value): value is string => value != null);
}

/**
 * Builds the `networkContext` component for a VPC node
 */
export function buildVpcNetworkContext(
  inventory: NetworkInventory,
  vpc: NetworkInventory["vpcs"][number],
): VpcNetworkContext {
  const index = buildNetworkIndex(inventory);
  const vpcId = vpc.VpcId!;
  const subnets = [...(index.subnetsByVpc.get(vpcId) ?? [])].sort((a, b) =>
    byString(a.SubnetId, b.SubnetId),
  );
  const routeTables = [...(index.routeTablesByVpc.get(vpcId) ?? [])].sort(
    (a, b) => byString(a.RouteTableId, b.RouteTableId),
  );
  const mainRouteTable = index.mainRouteTableByVpc.get(vpcId);
  const vpcEnis = index.inventory.networkInterfaces.filter(
    (eni) => eni.VpcId === vpcId,
  );
  const vpcEniIds = new Set(vpcEnis.map((eni) => eni.NetworkInterfaceId));
  const vpcEndpoints = index.inventory.vpcEndpoints
    .filter((endpoint) => endpoint.VpcId === vpcId)
    .sort((a, b) => byString(a.VpcEndpointId, b.VpcEndpointId));
  const vpcSecurityGroups = index.inventory.securityGroups.filter(
    (group) => group.VpcId === vpcId,
  );

  const resolvedRouteTables: VpcRouteTable[] = routeTables.map((table) => ({
    routeTableId: table.RouteTableId!,
    main: (table.Associations ?? []).some((assoc) => assoc.Main === true),
    associatedSubnetIds: sortedUnique(
      table.Associations?.map((assoc) => assoc.SubnetId) ?? [],
    ),
    gatewayAssociations: (table.Associations ?? [])
      .filter((assoc) => assoc.GatewayId != null)
      .map((assoc) => ({
        gatewayId: assoc.GatewayId,
        associationId: assoc.RouteTableAssociationId,
        state: assoc.AssociationState?.State,
      }))
      .sort((a, b) => byString(a.gatewayId, b.gatewayId)),
    propagatingVgwIds: sortedUnique(
      table.PropagatingVgws?.map((vgw) => vgw.GatewayId) ?? [],
    ),
    routes: resolveRoutes(index, table, false),
  }));

  const dhcpOptionsId = vpc.DhcpOptionsId;
  const dhcpOptions =
    dhcpOptionsId != null && dhcpOptionsId !== "default"
      ? index.dhcpOptionsById.get(dhcpOptionsId)
      : undefined;

  const referencedPrefixLists = [
    ...resolvedRouteTables.flatMap((table) =>
      table.routes
        .filter((route) => route.destinationType === "prefix-list")
        .map((route) => route.destination),
    ),
    ...vpcSecurityGroups.flatMap((group) =>
      [...(group.IpPermissions ?? []), ...(group.IpPermissionsEgress ?? [])]
        .flatMap((permission) => permission.PrefixListIds ?? [])
        .map((prefixList) => prefixList.PrefixListId),
    ),
    ...vpcEndpoints
      .filter((endpoint) => endpoint.VpcEndpointType === "Gateway")
      .map(
        (endpoint) =>
          index.inventory.prefixLists.find(
            (list) => list.PrefixListName === endpoint.ServiceName,
          )?.PrefixListId,
      ),
  ];

  return {
    scope: "vpc",
    vpcId,
    cidrs: {
      ipv4: sortedUnique([
        vpc.CidrBlock,
        ...(vpc.CidrBlockAssociationSet?.map((assoc) => assoc.CidrBlock) ?? []),
      ]),
      ipv6: sortedUnique(
        vpc.Ipv6CidrBlockAssociationSet?.map((assoc) => assoc.Ipv6CidrBlock) ??
          [],
      ),
    },
    dns: index.vpcAttributesByVpc.get(vpcId) ?? {},
    dhcpOptions:
      dhcpOptionsId != null
        ? {
            dhcpOptionsId,
            resolved: dhcpOptions != null,
            domainName:
              dhcpOptions != null
                ? dhcpValues(dhcpOptions, "domain-name")
                : undefined,
            domainNameServers:
              dhcpOptions != null
                ? dhcpValues(dhcpOptions, "domain-name-servers")
                : undefined,
            ntpServers:
              dhcpOptions != null
                ? dhcpValues(dhcpOptions, "ntp-servers")
                : undefined,
            netbiosNameServers:
              dhcpOptions != null
                ? dhcpValues(dhcpOptions, "netbios-name-servers")
                : undefined,
            netbiosNodeType:
              dhcpOptions != null
                ? dhcpValues(dhcpOptions, "netbios-node-type")
                : undefined,
          }
        : undefined,
    mainRouteTableId: mainRouteTable?.RouteTableId,
    subnets: subnets.map((subnet) => {
      const { tier, ipv6Tier, basis } = deriveTier(index, subnet);
      const acl = networkAclFor(index, subnet);
      return {
        subnetId: subnet.SubnetId!,
        subnetNodeId: subnet.SubnetArn,
        availabilityZone: subnet.AvailabilityZone,
        ipv4Cidr: subnet.CidrBlock,
        ipv6Cidrs: subnetIpv6Cidrs(subnet),
        routeTableId: basis.routeTableId,
        routeTableAssociation: basis.routeTableAssociation,
        networkAclId: acl?.networkAclId,
        tier,
        ipv6Tier,
      };
    }),
    routeTables: resolvedRouteTables,
    internetGateways: index.inventory.internetGateways
      .filter((igw) => attachmentFor(igw.Attachments, vpcId) != null)
      .map((igw) => ({
        internetGatewayId: igw.InternetGatewayId!,
        attachmentState: attachmentFor(igw.Attachments, vpcId)?.State,
      }))
      .sort((a, b) => byString(a.internetGatewayId, b.internetGatewayId)),
    egressOnlyInternetGateways: index.inventory.egressOnlyInternetGateways
      .filter((eigw) => attachmentFor(eigw.Attachments, vpcId) != null)
      .map((eigw) => ({
        egressOnlyInternetGatewayId: eigw.EgressOnlyInternetGatewayId!,
        attachmentState: attachmentFor(eigw.Attachments, vpcId)?.State,
      }))
      .sort((a, b) =>
        byString(a.egressOnlyInternetGatewayId, b.egressOnlyInternetGatewayId),
      ),
    natGateways: index.inventory.natGateways
      .filter((nat) => nat.VpcId === vpcId)
      .sort((a, b) => byString(a.NatGatewayId, b.NatGatewayId))
      .map((nat) => ({
        ...natTarget(index, nat.NatGatewayId!)!,
        allocationIds: sortedUnique(
          nat.NatGatewayAddresses?.map((addr) => addr.AllocationId) ?? [],
        ),
      })),
    vpcEndpoints: vpcEndpoints.map(vpcEndpointSummary),
    peeringConnections: index.inventory.peeringConnections
      .filter(
        (pcx) =>
          pcx.RequesterVpcInfo?.VpcId === vpcId ||
          pcx.AccepterVpcInfo?.VpcId === vpcId,
      )
      .map((pcx) => peeringTarget(index, pcx.VpcPeeringConnectionId!, vpcId)!)
      .sort((a, b) =>
        byString(a.vpcPeeringConnectionId, b.vpcPeeringConnectionId),
      ),
    transitGatewayAttachments: (
      index.transitGatewayAttachmentsByVpc.get(vpcId) ?? []
    )
      .map((attachment) => transitGatewayAttachmentSummary(index, attachment))
      .sort((a, b) =>
        byString(a.transitGatewayAttachmentId, b.transitGatewayAttachmentId),
      ),
    vpnGateways: index.inventory.vpnGateways
      .filter((vgw) => attachmentFor(vgw.VpcAttachments, vpcId) != null)
      .map((vgw) => vpnGatewayTarget(index, vgw.VpnGatewayId!, vpcId)!)
      .sort((a, b) => byString(a.vpnGatewayId, b.vpnGatewayId)),
    flowLogs: flowLogsFor(index, [
      vpcId,
      ...subnets.map((subnet) => subnet.SubnetId),
      ...vpcEnis.map((eni) => eni.NetworkInterfaceId),
    ]),
    elasticIps: index.inventory.addresses
      .filter(
        (address) =>
          address.NetworkInterfaceId != null &&
          vpcEniIds.has(address.NetworkInterfaceId),
      )
      .map((address) => {
        const eni = index.networkInterfacesById.get(
          address.NetworkInterfaceId!,
        );
        return {
          allocationId: address.AllocationId,
          publicIp: address.PublicIp,
          associationId: address.AssociationId,
          networkInterfaceId: address.NetworkInterfaceId,
          instanceId: address.InstanceId,
          privateIpAddress: address.PrivateIpAddress,
          ownedBy: eni != null ? classifyEniOwner(eni) : undefined,
        };
      })
      .sort(
        (a, b) =>
          byString(a.allocationId, b.allocationId) ||
          byString(a.publicIp, b.publicIp),
      ),
    prefixLists: prefixListsFor(index, referencedPrefixLists),
  };
}
