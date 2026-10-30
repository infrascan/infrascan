import type {
  Graph,
  Node as GraphNode,
  Readable,
} from "@infrascan/shared-types";
import { NetworkResolver, resolvedNodeIds } from "./network";
import type {
  Edge,
  InformationalGraph,
  NetworkContext,
  Node,
  SerializeGraphOptions,
} from "./types";

export type {
  CidrBlock,
  Edge,
  InformationalGraph,
  NatGatewaySummary,
  NetworkContext,
  Node,
  ResolvedSecurityGroup,
  ResolvedSubnet,
  ResolvedVpc,
  RulePeer,
  SecurityGroupRuleSummary,
  SerializeGraphOptions,
  UnresolvedNetworkReference,
  VpcReference,
} from "./types";

type WithOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

type MaleableNode = WithOptional<
  Readable<GraphNode>,
  "incomingEdges" | "outgoingEdges" | "children" | "parent"
>;

/**
 * Copy a node's own data without its object references. The references are removed before cloning,
 * as cloning them would deep copy every node reachable from this one.
 */
function cloneNodeData(node: Readable<GraphNode>): Node {
  const shallow: MaleableNode = { ...node };
  delete shallow.incomingEdges;
  delete shallow.outgoingEdges;
  delete shallow.children;
  delete shallow.parent;
  return structuredClone(shallow) as Node;
}

/**
 * Serialize the graph into plain nodes and edges for non-visual consumption (LLMs, scripts, other tools).
 *
 * Alongside each node's scanned components, the serializer adds (each controllable via `options`, all enabled by default):
 * - `networkContext`: the VPC, subnets and security groups referenced by the node's `network` component, resolved against the graph
 * - `networkMembers`: on VPC, subnet and security group nodes, the ids of nodes placed in them
 *
 * The input graph is never mutated.
 */
export function serializeGraph(
  graph: Graph,
  options: SerializeGraphOptions = {},
): InformationalGraph {
  const {
    networkContext: includeNetworkContext = true,
    networkMembers: includeNetworkMembers = true,
  } = options;

  const graphNodes = graph.nodes;
  const contexts = new Map<string, NetworkContext>();
  const members = new Map<string, Set<string>>();

  if (includeNetworkContext || includeNetworkMembers) {
    const resolver = new NetworkResolver(graphNodes);
    for (const node of graphNodes) {
      const context = resolver.resolve(node);
      if (context != null) {
        contexts.set(node.$graph.id, context);
        for (const networkNodeId of resolvedNodeIds(context)) {
          const existing = members.get(networkNodeId) ?? new Set<string>();
          existing.add(node.$graph.id);
          members.set(networkNodeId, existing);
        }
      }
    }
  }

  const nodes = graphNodes.map((node): Node => {
    const copy = cloneNodeData(node);
    const context = contexts.get(node.$graph.id);
    if (includeNetworkContext && context != null) {
      copy.networkContext = context;
    }
    const nodeMembers = members.get(node.$graph.id);
    if (includeNetworkMembers && nodeMembers != null) {
      copy.networkMembers = [...nodeMembers].sort();
    }
    return copy;
  });

  const edges = graph.edges.map(
    (edge): Edge => ({
      id: edge.id,
      name: edge.name,
      source: edge.source.resource.id,
      target: edge.target.resource.id,
      metadata: edge.metadata,
    }),
  );

  return {
    nodes,
    edges,
  };
}
