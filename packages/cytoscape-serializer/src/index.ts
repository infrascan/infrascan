import type { Graph } from "@infrascan/shared-types";

/**
 * A node on the graph in Cytoscape format
 */
export type CytoscapeNode = {
  group: "nodes";
  id: string;
  data: {
    id: string;
    type: string;
    /**
     * Parent node (account, region etc)
     */
    parent?: string;
    name?: string;
    service?: string;
  };
  /* eslint-disable @typescript-eslint/no-explicit-any */
  metadata?: any;
};

/**
 * An edge connecting two nodes within a graph
 */
export type CytoscapeEdge = {
  group: "edges";
  /**
   * Unique ID for the edge
   */
  id?: string;
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
    type: string;
  };
  metadata?: {
    label: string;
    roleArn?: string;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    statement?: any;
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
  const nodes: CytoscapeNode[] = graph.nodes.map((node) => ({
    group: "nodes",
    id: node.id,
    data: {
      id: node.id,
      arn: node.arn,
      parent: node.parent,
      name: node.name,
      service: node.service as string,
      type: node.type ?? node.service ?? "node",
    },
    metadata: node.metadata,
  }));

  const edges: CytoscapeEdge[] = graph.edges.map((edge) => ({
    group: "edges",
    id: edge.id,
    data: {
      id: edge.id,
      name: edge.name as string,
      source: edge.source,
      target: edge.target,
      type: "edge",
    },
    metadata: {
      label: edge.name ?? edge.id,
      ...edge.metadata,
    },
  }));

  return [...nodes, ...edges];
}
