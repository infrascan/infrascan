import { BaseState } from "./scan";

/**
 * A node returned from a state selector before its been formatted for a graphing library
 */
export interface SelectedNode {
  id: string;
  name?: string;
  parent?: string;
  type?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// Create Read/Write types inspired by kysely
export type ElementType<ReadType, WriteType> = {
  readonly _read: ReadType;
  readonly _write: WriteType;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ElementRecord<K extends keyof any, R, W> = ElementType<
  Record<K, Readable<R>>,
  Record<K, Writable<W>>
>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ReadType<T> = T extends ElementType<infer R, any> ? Readable<R> : T;
export type Readable<T> = {
  [K in keyof T]: ReadType<T[K]>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WriteType<T> = T extends ElementType<any, infer W>
  ? Writable<W>
  : T;
export type Writable<T> = {
  [K in keyof T]: WriteType<T[K]>;
};

export interface Node extends BaseState<unknown> {
  parent?: ElementType<Node, string>;
  children?: ElementRecord<string, Node, string>;
  incomingEdges: ElementRecord<string, Edge, string>;
  outgoingEdges: ElementRecord<string, Edge, string>;
}

export interface NodeOld {
  id: string;
  name: string;
  metadata: Record<string, unknown>;
  service?: string;
  type?: string;
  parent?: ElementType<Node, string>;
  children?: ElementRecord<string, Node, string>;
  incomingEdges: ElementRecord<string, Edge, string>;
  outgoingEdges: ElementRecord<string, Edge, string>;
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
  addNode: (node: BaseState<unknown>) => void;
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
