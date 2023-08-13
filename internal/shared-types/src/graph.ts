/**
 * A node on the graph
 */
export type GraphNode = {
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
  };
  /* eslint-disable @typescript-eslint/no-explicit-any */
  metadata?: any;
};

/**
 * An edge connecting two nodes within a graph
 */
export type GraphEdge = {
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
    statement: any;
  };
};

/**
 * Generic type for elements in a graph
 */
export type GraphElement = GraphNode | GraphEdge;

/* eslint-disable @typescript-eslint/no-explicit-any */
export type GetGlobalStateForServiceAndFunction = (
  service: string,
  functionName: string
) => any;
