/**
 * A node returned from a state selector before its been formatted for a graphing library
 */
export interface SelectedNode {
  id: string;
  name?: string;
  parent?: string;
  type?: string;
  rawState?: any;
};

export interface SelectedEdgeTarget {
  name: string,
  target: string
}

export interface SelectedEdge {
  source: string;
  target: string;
  metadata?: Record<string, unknown>
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