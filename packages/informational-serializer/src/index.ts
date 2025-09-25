import type {
  Graph,
  Node as GraphNode,
  Edge as GraphEdge,
  Readable,
} from "@infrascan/shared-types";

export type Node = Omit<
  Readable<GraphNode>,
  "incomingEdges" | "outgoingEdges" | "children"
>;

type WithOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

type MaleableNode = WithOptional<
  Readable<GraphNode>,
  "incomingEdges" | "outgoingEdges"
>;

export interface Edge extends Omit<Readable<GraphEdge>, "source" | "target"> {
  source: string;
  target: string;
}

export interface InformationalGraph {
  nodes: Node[];
  edges: Edge[];
}

export function serializeGraph(graph: Graph): InformationalGraph {
  const nodes = graph.nodes.map((node): Node => {
    const copy: MaleableNode = structuredClone(node);
    // remove object references
    delete copy.incomingEdges;
    delete copy.outgoingEdges;
    delete copy.children;
    delete copy.parent;
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
