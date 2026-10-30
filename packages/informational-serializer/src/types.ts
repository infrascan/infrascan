import type {
  AddressFamily,
  Edge as GraphEdge,
  Node as GraphNode,
  Readable,
} from "@infrascan/shared-types";

/**
 * Options controlling which derived fields `serializeGraph` attaches to each node.
 * Every flag defaults to `true`.
 */
export interface SerializeGraphOptions {
  /**
   * Attach `networkContext` to nodes whose `network` component references a VPC, subnets or security groups,
   * resolving those ids against the VPC, subnet, security group and NAT gateway nodes in the graph.
   */
  networkContext?: boolean;
  /**
   * Attach the node's `parent` id and its `ancestry` (root first, e.g. account → region → VPC).
   */
  hierarchy?: boolean;
  /**
   * Attach `networkMembers` to VPC, subnet and security group nodes: the sorted ids of the nodes
   * whose `networkContext` resolves to them.
   */
  networkMembers?: boolean;
}

/**
 * A network id referenced by a node which does not exist as a node in the graph (e.g. a subnet in an unscanned region).
 * The id is preserved so no information is lost.
 */
export interface UnresolvedNetworkReference {
  id: string;
  resolved: false;
}

export interface CidrBlock {
  family: AddressFamily;
  cidrBlock: string;
}

interface ResolvedReference {
  /**
   * The AWS id of the resource (vpc-..., subnet-..., sg-...).
   */
  id: string;
  /**
   * The id of the node in the informational graph (differs from `id` for subnets, which are keyed by ARN).
   */
  nodeId: string;
  resolved: true;
  /**
   * The `Name` tag if present, otherwise the resource name.
   */
  name: string;
  tags?: Record<string, string>;
}

export interface ResolvedVpc extends ResolvedReference {
  cidrBlocks: CidrBlock[];
  isDefault?: boolean;
  state?: string;
}

export interface NatGatewaySummary {
  id: string;
  name: string;
  /**
   * Comma separated list of public IPs, as recorded on the NAT gateway node.
   */
  publicIp?: string;
  /**
   * Comma separated list of private IPs, as recorded on the NAT gateway node.
   */
  privateIp?: string;
}

export interface ResolvedSubnet extends ResolvedReference {
  cidrBlocks: CidrBlock[];
  availabilityZone?: string;
  /**
   * The VPC recorded on the subnet node's `network.vpc.id`.
   */
  vpcId?: string;
  mapPublicIpOnLaunch?: boolean;
  defaultForAz?: boolean;
  availableIpAddressCount?: number;
  state?: string;
  /**
   * NAT gateways deployed into this subnet.
   */
  natGateways: NatGatewaySummary[];
}

export type RulePeer =
  | { type: "cidr"; value: string; description?: string }
  | {
      type: "security-group";
      value: string;
      name?: string;
      accountId?: string;
      description?: string;
    }
  | { type: "prefix-list"; value: string; description?: string };

export interface SecurityGroupRuleSummary {
  /**
   * IP protocol (e.g. tcp, udp, icmp) or `ALL`.
   */
  protocol: string;
  fromPort?: number;
  toPort?: number;
  /**
   * Human readable port range: a single port (`443`), a range (`1024-65535`) or `all`.
   */
  ports: string;
  /**
   * The sources permitted by the rule.
   */
  peers: RulePeer[];
}

export interface ResolvedSecurityGroup extends ResolvedReference {
  description?: string;
  /**
   * The VPC recorded on the security group node's `network.vpc.id`.
   */
  vpcId?: string;
  /**
   * Inbound (ingress) rules. Egress rules are not currently recorded by the EC2 scanner.
   */
  inboundRules: SecurityGroupRuleSummary[];
}

export type VpcReference = (ResolvedVpc | UnresolvedNetworkReference) & {
  /**
   * Set when the node does not reference a VPC directly, and the VPC was taken from its subnets or security groups.
   * Omitted when they record different VPCs.
   */
  inferred?: true;
};

/**
 * The resolved network placement of a node.
 */
export interface NetworkContext {
  vpc?: VpcReference;
  subnets: (ResolvedSubnet | UnresolvedNetworkReference)[];
  securityGroups: (ResolvedSecurityGroup | UnresolvedNetworkReference)[];
}

export type Node = Omit<
  Readable<GraphNode>,
  "incomingEdges" | "outgoingEdges" | "children" | "parent"
> & {
  /**
   * The id of the node's parent in the graph.
   */
  parent?: string;
  /**
   * The ids of the node's ancestors, root first (e.g. `[account, account-region, vpc]`). Excludes the node itself.
   */
  ancestry?: string[];
  networkContext?: NetworkContext;
  /**
   * For VPC, subnet and security group nodes: the sorted ids of nodes whose `networkContext` resolves to this node.
   */
  networkMembers?: string[];
};

export interface Edge extends Omit<Readable<GraphEdge>, "source" | "target"> {
  source: string;
  target: string;
}

export interface InformationalGraph {
  nodes: Node[];
  edges: Edge[];
}
