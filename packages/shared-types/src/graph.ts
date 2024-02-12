/**
 * A node returned from a state selector before its been formatted for a graphing library
 */
export type SelectedNode = {
  id: string;
  name?: string;
  parent?: string;
  type?: string;
  rawState?: any;
};

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
    service?: string;
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
    statement?: any;
  };
};

/**
 * Generic type for elements in a graph
 */
export type GraphElement = GraphNode | GraphEdge;

export type EdgeTarget = {
  name: string;
  target: string;
};

export interface Node {
  id: string,
  name: string,
  metadata: Record<string, unknown>;
  service?: string,
  type?: string,
  parent?: string | Node,
  children?: Record<string, Node>,
  incomingEdges: Record<string, Edge<Node>>,
  outgoingEdges: Record<string, Edge<Node>>,
}

export interface Edge<T extends string | Node> {
  id: string,
  name?: string,
  metadata: Record<string, unknown>,
  source: T,
  target: T
}

export interface Graph {
  nodes: Node[],
  edges: Edge<Node>[],
  addNode: (node: Pick<Node, "id" | "name" | "metadata" | "parent" | "service" | "type">) => void,
  addEdge: (edge: Pick<Edge<string>, "name" | "source" | "target" | "metadata">) => void,
  addChild: (parent: string, child: string) => void,
  getNode: (id: string) => Node | undefined,
  mapNodesById: (id: string, mapperFn: (node: Node) => Node[]) => void,
  removeEdge: (id: string) => Edge<Node>,
  removeNode: (id: string) => Node,
  serialize: () => string
};

export type GraphSerializer<T> = (graph: Graph) => T;