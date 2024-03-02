/**
 * A node returned from a state selector before its been formatted for a graphing library
 */
export interface SelectedNode {
  id: string;
  name?: string;
  parent?: string;
  type?: string;
  arn?: string;
  rawState?: any;
}

export interface SelectedEdgeTarget {
  name: string;
  target: string;
}

export interface SelectedEdge {
  source: string;
  target: string;
  metadata?: Record<string, unknown>;
}

export interface Node {
  id: string;
  name: string;
  arn?: string;
  metadata: Record<string, unknown>;
  service?: string;
  type?: string;
  parent?: string;
  children?: Set<string>;
  incomingEdges: Set<string>;
  outgoingEdges: Set<string>;
}

export interface Edge {
  id: string;
  name?: string;
  metadata: Record<string, unknown>;
  source: string;
  target: string;
}

export interface Graph {
  nodes: Node[];
  edges: Edge[];
  addNode: (
    node: Pick<
      Node,
      "id" | "name" | "metadata" | "parent" | "service" | "type"
    >,
  ) => void;
  addEdge: (
    edge: Pick<Edge, "name" | "source" | "target" | "metadata">,
  ) => void;
  addChild: (parent: string, child: string) => void;
  getNode: (id: string) => Node | undefined;
  mapNodesById: (id: string, mapperFn: (node: Node) => Node[]) => void;
  addAttributeForNode: (
    nodeId: string,
    attribute: string,
    attributeValue: string,
  ) => void;
  removeEdge: (id: string) => Edge;
  removeNode: (id: string) => Node;
  serialize: () => string;
}

export type GraphSerializer<T> = (graph: Graph) => T;
