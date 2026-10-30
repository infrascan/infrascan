import type {
  Node as GraphNode,
  NetworkRule,
  Readable,
} from "@infrascan/shared-types";
import type {
  CidrBlock,
  NatGatewaySummary,
  NetworkContext,
  ResolvedSecurityGroup,
  ResolvedSubnet,
  ResolvedVpc,
  RulePeer,
  SecurityGroupRuleSummary,
  UnresolvedNetworkReference,
  VpcReference,
} from "./types";

type GraphNodeView = Readable<GraphNode>;
type UnknownRecord = Record<string, unknown>;

export const VPC_NODE_TYPE = "ec2-vpc";
export const SUBNET_NODE_TYPE = "ec2-subnet";
export const SECURITY_GROUP_NODE_TYPE = "ec2-security-group";
export const NAT_GATEWAY_NODE_TYPE = "ec2-nat-gateway";

/**
 * Drop keys whose value is undefined so the output only carries data which is present in the graph.
 */
function compact<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as T;
}

function asRecord(value: unknown): UnknownRecord | undefined {
  return value != null && typeof value === "object"
    ? (value as UnknownRecord)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function component(node: GraphNodeView, key: string): UnknownRecord {
  return asRecord((node as unknown as UnknownRecord)[key]) ?? {};
}

function pushUnique(target: string[], value: unknown) {
  const id = asString(value);
  if (id != null && !target.includes(id)) {
    target.push(id);
  }
}

/**
 * Tags are recorded as `{ key, value }`, though some scanners use `{ key, val }`.
 * Returns a key-sorted record, or undefined when there are no tags.
 */
function tagsOf(node: GraphNodeView): Record<string, string> | undefined {
  const entries: [string, string][] = [];
  for (const tag of node.tags ?? []) {
    const record = asRecord(tag) ?? {};
    const key = asString(record.key);
    const value = record.value ?? record.val;
    if (key != null && typeof value === "string") {
      entries.push([key, value]);
    }
  }
  if (entries.length === 0) return undefined;
  entries.sort(([a], [b]) => (a < b ? -1 : Number(a > b)));
  return Object.fromEntries(entries);
}

function nameOf(node: GraphNodeView, tags?: Record<string, string>): string {
  return tags?.Name ?? node.resource?.name ?? node.$graph.label;
}

function cidrBlocksOf(node: GraphNodeView): CidrBlock[] {
  const blocks: CidrBlock[] = [];
  const seen = new Set<string>();
  for (const reserved of node.network?.reservedAddresses ?? []) {
    const key = `${reserved.family}|${reserved.cidrBlock}`;
    if (reserved.cidrBlock != null && !seen.has(key)) {
      seen.add(key);
      blocks.push({ family: reserved.family, cidrBlock: reserved.cidrBlock });
    }
  }
  return blocks;
}

/**
 * Subnet nodes are keyed by ARN in the graph, but every other node references them by subnet id.
 */
function subnetIdOf(node: GraphNodeView): string {
  const name = node.resource?.name;
  if (name != null && name.startsWith("subnet-")) return name;
  const arnSuffix = node.$graph.id.split("subnet/")[1];
  return arnSuffix ?? node.$graph.id;
}

interface NetworkReferences {
  vpcId?: string;
  subnets: string[];
  securityGroups: string[];
}

/**
 * Collect the raw network ids a node references, de-duplicated and in source order.
 */
function referencesOf(node: GraphNodeView): NetworkReferences {
  const network = node.network as UnknownRecord | undefined;
  const subnets: string[] = [];
  const securityGroups: string[] = [];
  if (network == null) return { subnets, securityGroups };

  const { targetSubnets, securityGroups: groups, interfaces } = network;
  if (Array.isArray(targetSubnets)) {
    targetSubnets.forEach((id) => pushUnique(subnets, id));
  }
  if (Array.isArray(groups)) {
    groups.forEach((id) => pushUnique(securityGroups, id));
  }
  // Launch templates record their interfaces under `network.interfaces`
  if (Array.isArray(interfaces)) {
    interfaces.forEach((iface) => {
      const record = asRecord(iface) ?? {};
      pushUnique(subnets, record.subnetId);
      if (Array.isArray(record.groups)) {
        record.groups.forEach((id) => pushUnique(securityGroups, id));
      }
    });
  }

  return {
    vpcId: asString(asRecord(network.vpc)?.id),
    subnets,
    securityGroups,
  };
}

function hasReferences(refs: NetworkReferences): boolean {
  return (
    refs.vpcId != null ||
    refs.subnets.length > 0 ||
    refs.securityGroups.length > 0
  );
}

function singleValue(values: Set<string> | undefined): string | undefined {
  return values != null && values.size === 1
    ? values.values().next().value
    : undefined;
}

function addToSetMap(map: Map<string, Set<string>>, key: string, val: string) {
  const existing = map.get(key);
  if (existing != null) {
    existing.add(val);
  } else {
    map.set(key, new Set([val]));
  }
}

function formatPorts(rule: NetworkRule): string {
  const { fromPort, toPort, protocol } = rule;
  if (
    protocol === "ALL" ||
    fromPort == null ||
    fromPort === -1 ||
    (fromPort === 0 && toPort === 65535)
  ) {
    return "all";
  }
  if (toPort == null || toPort === fromPort) return `${fromPort}`;
  return `${fromPort}-${toPort}`;
}

function summariseRule(rule: NetworkRule): SecurityGroupRuleSummary {
  const peers: RulePeer[] = [];
  for (const range of rule.permittedIpRanges ?? []) {
    if (range.cidrBlock != null) {
      peers.push(
        compact({
          type: "cidr",
          value: range.cidrBlock,
          description: range.description,
        }),
      );
    }
  }
  for (const group of rule.awsConfig?.referencedSecurityGroups ?? []) {
    if (group.securityGroupId != null) {
      peers.push(
        compact({
          type: "security-group",
          value: group.securityGroupId,
          name: group.securityGroupName,
          accountId: group.referencedAccountId,
          description: group.description,
        }),
      );
    }
  }
  for (const prefixList of rule.awsConfig?.prefixLists ?? []) {
    if (prefixList.prefixListId != null) {
      peers.push(
        compact({
          type: "prefix-list",
          value: prefixList.prefixListId,
          description: prefixList.description,
        }),
      );
    }
  }
  return compact({
    protocol: rule.protocol ?? "ALL",
    fromPort: rule.fromPort,
    toPort: rule.toPort,
    ports: formatPorts(rule),
    peers,
  });
}

function summariseNatGateway(node: GraphNodeView): NatGatewaySummary {
  return compact({
    id: node.$graph.id,
    name: nameOf(node, tagsOf(node)),
    publicIp: asString(node.network?.publicIp?.address),
    privateIp: asString(node.network?.assignedAddresses?.ipv4),
  });
}

function unresolved(id: string): UnresolvedNetworkReference {
  return { id, resolved: false };
}

/**
 * Indexes the networking nodes of a graph once, then resolves the network references of any node in O(refs).
 */
export class NetworkResolver {
  private readonly vpcs = new Map<string, GraphNodeView>();

  private readonly subnets = new Map<string, GraphNodeView>();

  private readonly securityGroups = new Map<string, GraphNodeView>();

  private readonly natGatewaysBySubnet = new Map<string, GraphNodeView[]>();

  private readonly subnetVpcs = new Map<string, Set<string>>();

  private readonly securityGroupVpcs = new Map<string, Set<string>>();

  private readonly references = new Map<string, NetworkReferences>();

  constructor(nodes: GraphNodeView[]) {
    for (const node of nodes) {
      const { nodeType } = node.$graph;
      if (nodeType === VPC_NODE_TYPE) {
        this.vpcs.set(node.$graph.id, node);
      } else if (nodeType === SUBNET_NODE_TYPE) {
        this.subnets.set(subnetIdOf(node), node);
      } else if (nodeType === SECURITY_GROUP_NODE_TYPE) {
        this.securityGroups.set(node.$graph.id, node);
      }

      const refs = referencesOf(node);
      if (hasReferences(refs)) {
        this.references.set(node.$graph.id, refs);
      }
      if (nodeType === NAT_GATEWAY_NODE_TYPE) {
        refs.subnets.forEach((subnetId) => {
          const nats = this.natGatewaysBySubnet.get(subnetId) ?? [];
          nats.push(node);
          this.natGatewaysBySubnet.set(subnetId, nats);
        });
      }
      // Subnets and security groups don't record their VPC, infer it from nodes which reference both.
      if (refs.vpcId != null) {
        const { vpcId } = refs;
        refs.subnets.forEach((id) => addToSetMap(this.subnetVpcs, id, vpcId));
        refs.securityGroups.forEach((id) =>
          addToSetMap(this.securityGroupVpcs, id, vpcId),
        );
      }
    }
  }

  private resolveVpc(id: string): ResolvedVpc | UnresolvedNetworkReference {
    const node = this.vpcs.get(id);
    if (node == null) return unresolved(id);
    const tags = tagsOf(node);
    const vpcComponent = component(node, "vpc");
    return compact({
      id,
      nodeId: node.$graph.id,
      resolved: true,
      name: nameOf(node, tags),
      cidrBlocks: cidrBlocksOf(node),
      isDefault:
        asBoolean(vpcComponent.isDefault) ?? node.network?.vpc?.default,
      state: asString(vpcComponent.state) ?? node.network?.vpc?.state,
      tags,
    });
  }

  private resolveSubnet(
    id: string,
  ): ResolvedSubnet | UnresolvedNetworkReference {
    const node = this.subnets.get(id);
    if (node == null) return unresolved(id);
    const tags = tagsOf(node);
    const subnetComponent = component(node, "subnet");
    const onLaunch = asRecord(subnetComponent.onLaunch) ?? {};
    const natGateways = (this.natGatewaysBySubnet.get(id) ?? [])
      .map(summariseNatGateway)
      .sort((a, b) => (a.id < b.id ? -1 : Number(a.id > b.id)));
    return compact({
      id,
      nodeId: node.$graph.id,
      resolved: true,
      name: nameOf(node, tags),
      cidrBlocks: cidrBlocksOf(node),
      availabilityZone: node.location?.zone?.[0],
      vpcId: singleValue(this.subnetVpcs.get(id)),
      mapPublicIpOnLaunch: asBoolean(onLaunch.publicIp),
      defaultForAz: asBoolean(subnetComponent.isDefault),
      availableIpAddressCount: asNumber(
        node.network?.subnet?.availableAddressCount,
      ),
      state:
        asString(subnetComponent.state) ??
        asString(node.network?.subnet?.state),
      natGateways,
      tags,
    });
  }

  private resolveSecurityGroup(
    id: string,
  ): ResolvedSecurityGroup | UnresolvedNetworkReference {
    const node = this.securityGroups.get(id);
    if (node == null) return unresolved(id);
    return compact({
      id,
      nodeId: node.$graph.id,
      resolved: true,
      // Security groups are referred to by group name rather than Name tag.
      name: node.resource?.name ?? node.$graph.label,
      description: node.resource?.description,
      vpcId: singleValue(this.securityGroupVpcs.get(id)),
      inboundRules: (node.network?.rules ?? []).map(summariseRule),
      tags: tagsOf(node),
    });
  }

  /**
   * Infer a VPC for nodes which only reference subnets/security groups (e.g. ECS services, Auto Scaling groups).
   */
  private inferVpc(refs: NetworkReferences): string | undefined {
    const candidates = new Set<string>();
    refs.subnets.forEach((id) =>
      this.subnetVpcs.get(id)?.forEach((vpc) => candidates.add(vpc)),
    );
    refs.securityGroups.forEach((id) =>
      this.securityGroupVpcs.get(id)?.forEach((vpc) => candidates.add(vpc)),
    );
    return singleValue(candidates);
  }

  /**
   * Resolve the network context for a node, or undefined if it references no VPC, subnet or security group.
   */
  resolve(node: GraphNodeView): NetworkContext | undefined {
    const refs = this.references.get(node.$graph.id);
    if (refs == null) return undefined;

    let vpc: VpcReference | undefined;
    if (refs.vpcId != null) {
      vpc = this.resolveVpc(refs.vpcId);
    } else {
      const inferredVpc = this.inferVpc(refs);
      if (inferredVpc != null) {
        vpc = { ...this.resolveVpc(inferredVpc), inferred: true };
      }
    }

    return compact({
      vpc,
      subnets: refs.subnets.map((id) => this.resolveSubnet(id)),
      securityGroups: refs.securityGroups.map((id) =>
        this.resolveSecurityGroup(id),
      ),
    });
  }
}

/**
 * The node ids that a network context resolves to, used to build the reverse `networkMembers` view.
 */
export function resolvedNodeIds(context: NetworkContext): string[] {
  const ids: string[] = [];
  if (context.vpc?.resolved) ids.push(context.vpc.nodeId);
  context.subnets.forEach((subnet) => {
    if (subnet.resolved) ids.push(subnet.nodeId);
  });
  context.securityGroups.forEach((group) => {
    if (group.resolved) ids.push(group.nodeId);
  });
  return ids;
}
