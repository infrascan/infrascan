import type {
  Edge,
  Graph as _Graph,
  Node,
  Readable,
  Writable,
  BaseState,
} from "@infrascan/shared-types";
import {
  NodeConflictError,
  NodeNotFoundError,
  EdgeConflictError,
  EdgeNotFoundError,
} from "./errors";

/**
 * In memory graph model used by the Infrascan SDK.
 * The graph is built using object references to support recursive lookups (e.g. `node.edges.outgoing["edge-1"].target.edges.incoming["edge-1"].source` and so on.)
 *
 * The main aim behind the design of this graph model, is to be able to easily duplicate nodes and carry across their edges. This is particularly
 * useful for graphs which need to translate a node or set of nodes under a new parent, while maintaining their edges.
 * Specifically for infrascan, this is used to allow the basic system diagram translate nodes that exist under network primitives like VPCs without
 * removing their existing edges.
 * @returns {_Graph}
 */
export function Graph(): _Graph {
  const nodes: Record<string, Readable<Node>> = {};
  const edges: Record<string, Readable<Edge>> = {};

  function addChild(parent: string, child: string) {
    const parentNode = nodes[parent];
    const childNode = nodes[child];
    if (parentNode == null) {
      throw new NodeNotFoundError(parent);
    }
    if (childNode == null) {
      throw new NodeNotFoundError(child);
    }

    if (parentNode.children == null) {
      parentNode.children = {};
    }

    parentNode.children[childNode.$graph.id] = childNode;
    childNode.parent = parentNode;
  }

  function addNode(node: BaseState<unknown>) {
    if (nodes[node.$graph.id] != null) {
      throw new NodeConflictError(node.$graph.id);
    }
    if (node.$graph.parent != null && nodes[node.$graph.parent] == null) {
      throw new NodeNotFoundError(node.$graph.parent);
    }
    try {
      const completedNode: Readable<Node> = {
        ...structuredClone(node),
        incomingEdges: {},
        outgoingEdges: {},
        children: undefined,
        parent: undefined,
      };
      nodes[node.$graph.id] = completedNode;
      if (node.$graph.parent != null) {
        // Parent is of type Node at this point.
        addChild(node.$graph.parent, node.$graph.id);
      }
    } catch (err: unknown) {
      delete nodes[node.$graph.id];
      throw err;
    }
  }

  function addEdge(
    edge: Pick<Writable<Edge>, "name" | "source" | "target" | "metadata">,
  ) {
    const edgeId = `${edge.source}-${edge.target}`;
    if (edges[edgeId] != null) {
      throw new EdgeConflictError(edgeId);
    }
    const sourceNode = nodes[edge.source];
    if (sourceNode == null) {
      throw new NodeNotFoundError(edge.source);
    }
    const targetNode = nodes[edge.target];
    if (targetNode == null) {
      throw new NodeNotFoundError(edge.target);
    }

    const preparedEdge: Readable<Edge> = {
      id: edgeId,
      metadata: edge.metadata,
      name: edge.name,
      source: sourceNode,
      target: targetNode,
    };
    edges[preparedEdge.id] = preparedEdge;
    sourceNode.outgoingEdges[preparedEdge.id] = preparedEdge;
    targetNode.incomingEdges[preparedEdge.id] = preparedEdge;
  }

  function removeEdge(id: string): Readable<Edge> {
    const edge = edges[id];
    if (edge == null) {
      throw new EdgeNotFoundError(id);
    }
    delete edges[id];
    delete edge.source.outgoingEdges[id];
    delete edge.target.incomingEdges[id];
    return edge;
  }

  function removeNode(id: string): Readable<Node> {
    const node = nodes[id];
    if (node == null) {
      throw new NodeNotFoundError(id);
    }
    Object.keys(node.incomingEdges).forEach(removeEdge);
    Object.keys(node.outgoingEdges).forEach(removeEdge);
    delete nodes[id];
    return node;
  }

  /**
   * Given an ID, remove a node from the graph and map it into some number of new nodes. Insert the new nodes into the graph.
   * @param {string} id The ID of a node to map into many nodes. Useful for duplicating nodes under multiple parents.
   * @param {(node: Node) => Node[]} mapperFn The mapping function which produces some number of new nodes from the existing node.
   */
  function mapNodesById(
    id: string,
    mapperFn: (node: Readable<Node>) => Writable<Node>[],
  ) {
    const nodeToMap = nodes[id];
    const newNodes = mapperFn(nodeToMap);
    const incomingEdges = Object.values(nodeToMap.incomingEdges);
    const outgoingEdges = Object.values(nodeToMap.outgoingEdges);
    newNodes.forEach((newNode) => {
      addNode(newNode);
      incomingEdges.forEach((edge) => {
        addEdge({
          ...edge,
          source: edge.source.$graph.id,
          target: newNode.$graph.id,
        });
      });

      outgoingEdges.forEach((edge) => {
        addEdge({
          ...edge,
          source: newNode.$graph.id,
          target: edge.target.$graph.id,
        });
      });
    });
    removeNode(id);
  }

  function serialize(): string {
    const nodeStrings = Object.values(nodes)
      .map((node) => `id: ${node.$graph.id}`)
      .join(", ");
    const edgeStrings = Object.values(edges)
      .map((edge) => `${edge.source.$graph.id} -> ${edge.target.$graph.id}`)
      .join(", ");
    return `Nodes: ${nodeStrings}
Edges: ${edgeStrings}`;
  }

  function getNode(id: string): Readable<Node> | undefined {
    return nodes[id];
  }

  return {
    get nodes(): Readable<Node>[] {
      return Object.values(nodes);
    },
    get edges(): Readable<Edge>[] {
      return Object.values(edges);
    },
    addNode,
    addEdge,
    addChild,
    getNode,
    mapNodesById,
    removeEdge,
    removeNode,
    serialize,
  };
}
