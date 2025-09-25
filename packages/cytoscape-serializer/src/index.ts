import type { Graph, Node, Readable } from "@infrascan/shared-types";

interface CytoscapeNodeData
  extends Omit<
    Readable<Node>,
    "parent" | "incomingEdges" | "outgoingEdges" | "children"
  > {
  id: string;
  /**
   * Parent node (account, region etc)
   */
  parent?: string;
  name?: string;
  service?: string;
}

/**
 * A node on the graph in Cytoscape format
 */
export interface CytoscapeNode {
  group: "nodes";
  data: CytoscapeNodeData;
}

interface CytoscapeEdgeData {
  id: string;
  name: string;
  /**
   * Source Node
   */
  source: string;
  /**
   * Target Node
   */
  target: string;
}

/**
 * An edge connecting two nodes within a graph
 */
export type CytoscapeEdge = {
  group: "edges";
  /**
   * Unique ID for the edge
   */
  data: CytoscapeEdgeData;
};

/**
 * Generic type for elements in a graph
 */
export type CytoscapeGraph = CytoscapeNode | CytoscapeEdge;

export type EdgeTarget = {
  name: string;
  target: string;
};

export function serializeGraph(graph: Graph): CytoscapeGraph[] {
  const nodes: CytoscapeNode[] = graph.nodes
    .filter((node) => node.$graph.nodeClass === "visual")
    .map((node) => {
      const {
        parent,
        incomingEdges,
        outgoingEdges,
        children,
        ...structuredNode
      } = node;

      const defaultParent =
        node.location?.code && node.tenant.tenantId
          ? `${node.tenant.tenantId}-${node.location?.code}`
          : node.tenant.tenantId;
      return {
        group: "nodes",
        data: Object.assign(structuredNode, {
          id: node.resource.id,
          parent: node.$graph.parent ?? defaultParent,
          name: node.resource.name,
          type: node.$graph.nodeType,
        }),
      };
    });

  const edges: CytoscapeEdge[] = graph.edges.map((edge) => ({
    group: "edges",
    data: {
      id: edge.id,
      name: edge.name as string,
      source: edge.source.resource.id,
      target: edge.target.resource.id,
      metadata: edge.metadata,
    },
  }));

  return [...nodes, ...edges];
}
