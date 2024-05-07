/**
 * A node returned from a state selector before its been formatted for a graphing library
 */
export interface SelectedNode {
  id: string;
  name?: string;
  parent?: string;
  type?: string;
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

export type ElementType<ReadType, WriteType> = {
  readonly __read__: ReadType;
  readonly __write__: WriteType;
};

export type ElementRecord<
  K extends keyof any,
  ReadType,
  WriteType,
> = ElementType<Record<K, ReadType>, Record<K, WriteType>>;

export type ReadType<T> = T extends ElementType<infer R, any> ? R : T;
export type Readable<T> = {
  [K in keyof T]: ReadType<T[K]>;
};

export type WriteType<T> = T extends ElementType<any, infer W> ? W : T;
export type Writable<T> = {
  [K in keyof T]: WriteType<T[K]>;
};

export interface Node {
  id: string;
  name: string;
  metadata: Record<string, unknown>;
  service?: string;
  type?: string;
  parent?: ElementType<Node, string>;
  children?: ElementRecord<string, Node, string>;
  incomingEdges: Record<string, Edge>;
  outgoingEdges: Record<string, Edge>;
}

export interface Edge {
  id: string;
  name?: string;
  metadata: Record<string, unknown>;
  source: ElementType<Node, string>;
  target: ElementType<Node, string>;
}

export interface Graph {
  nodes: Readable<Node>[];
  edges: Readable<Edge>[];
  addNode: (
    node: Pick<
      Writable<Node>,
      "id" | "name" | "metadata" | "parent" | "service" | "type"
    >,
  ) => void;
  addEdge: (
    edge: Pick<Writable<Edge>, "name" | "source" | "target" | "metadata">,
  ) => void;
  addChild: (parent: string, child: string) => void;
  getNode: (id: string) => Readable<Node> | undefined;
  mapNodesById: (
    id: string,
    mapperFn: (node: Readable<Node>) => Writable<Node>[],
  ) => void;
  removeEdge: (id: string) => Readable<Edge>;
  removeNode: (id: string) => Readable<Node>;
  serialize: () => string;
}

export type GraphSerializer<T> = (graph: Graph) => T;
