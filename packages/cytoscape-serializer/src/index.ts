import type { Graph } from "@infrascan/shared-types";

/**
 * A node on the graph in Cytoscape format
 */
export type CytoscapeNode = {
  group: "nodes";
  data: {
    id: string;
    /**
     * Parent node (account, region etc)
     */
    parent?: string;
    name?: string;
    service?: string;
  };
};

/**
 * An edge connecting two nodes within a graph
 */
export type CytoscapeEdge = {
  group: "edges";
  /**
   * Unique ID for the edge
   */
  data: {
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
  };
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
  const nodes: CytoscapeNode[] = graph.nodes.map((node) => {
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
        id: node.$graph.id,
        parent: node.$graph.parent ?? defaultParent,
        name: node.$graph.label,
      }),
    };
  });

  const edges: CytoscapeEdge[] = graph.edges.map((edge) => ({
    group: "edges",
    data: {
      id: edge.id,
      name: edge.name as string,
      source: edge.source.$graph.id,
      target: edge.target.$graph.id,
      metadata: edge.metadata,
    },
  }));

  return [...nodes, ...edges];
}
