import type { Edge, Graph as _Graph, Node } from "@infrascan/shared-types";
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
  const nodes: Map<string, Node> = new Map();
  const edges: Map<string, Edge> = new Map();

  function addChild(parent: string, child: string) {
    const parentNode = nodes.get(parent);
    const childNode = nodes.get(child);
    if (parentNode == null) {
      throw new NodeNotFoundError(parent);
    }
    if (childNode == null) {
      throw new NodeNotFoundError(child);
    }

    if (parentNode.children == null) {
      parentNode.children = new Set();
    }
    parentNode.children.add(childNode.id);
    childNode.parent = parentNode.id;
  }

  function addNode(
    node: Pick<Node, "id" | "name" | "arn" | "metadata" | "parent" | "service">,
  ) {
    if (nodes.has(node.id)) {
      throw new NodeConflictError(node.id);
    }
    try {
      const completedNode: Node = Object.assign(node, {
        incomingEdges: new Set<string>(),
        outgoingEdges: new Set<string>(),
      });
      nodes.set(completedNode.id, completedNode);
      if (completedNode.parent != null) {
        // Parent is of type Node at this point.
        addChild(completedNode.parent, node.id);
      }
    } catch (err: unknown) {
      nodes.delete(node.id);
      throw err;
    }
  }

  function addEdge(
    edge: Pick<Edge, "name" | "source" | "target" | "metadata">,
  ) {
    const edgeId = `${edge.source}-${edge.target}`;
    if (edges.has(edgeId) != null) {
      throw new EdgeConflictError(edgeId);
    }
    const sourceNode = nodes.get(edge.source);
    if (sourceNode == null) {
      throw new NodeNotFoundError(edge.source);
    }
    const targetNode = nodes.get(edge.target);
    if (targetNode == null) {
      throw new NodeNotFoundError(edge.target);
    }

    const preparedEdge: Edge = Object.assign(edge, {
      id: edgeId,
      source: sourceNode,
      target: targetNode,
    });
    edges.set(preparedEdge.id, preparedEdge);
    sourceNode.outgoingEdges.add(preparedEdge.id);
    targetNode.incomingEdges.add(preparedEdge.id);
  }

  function removeEdge(id: string): Edge {
    const edge = edges.get(id);
    if (edge == null) {
      throw new EdgeNotFoundError(id);
    }
    const sourceNode = nodes.get(edge.source);
    if (sourceNode != null) {
      sourceNode.outgoingEdges.delete(edge.id);
    }
    const targetNode = nodes.get(edge.target);
    if (targetNode != null) {
      targetNode.incomingEdges.delete(edge.id);
    }
    edges.delete(edge.id);
    return edge;
  }

  function removeNode(id: string): Node {
    const node = nodes.get(id);
    if (node == null) {
      throw new NodeNotFoundError(id);
    }
    const incomingEdges = Array.from(node.incomingEdges.values());
    incomingEdges.forEach(removeEdge);
    const outgoingEdges = Array.from(node.outgoingEdges.values());
    outgoingEdges.forEach(removeEdge);
    nodes.delete(id);
    return node;
  }

  /**
   * Given an ID, remove a node from the graph and map it into some number of new nodes. Insert the new nodes into the graph.
   * @param {string} id The ID of a node to map into many nodes. Useful for duplicating nodes under multiple parents.
   * @param {(node: Node) => Node[]} mapperFn The mapping function which produces some number of new nodes from the existing node.
   */
  function mapNodesById(id: string, mapperFn: (node: Node) => Node[]) {
    const nodeToMap = nodes.get(id);
    if (nodeToMap == null) {
      throw new NodeNotFoundError(id);
    }
    const newNodes = mapperFn(nodeToMap);
    const incomingEdges = nodeToMap.incomingEdges.values();
    const outgoingEdges = nodeToMap.outgoingEdges.values();
    newNodes.forEach((newNode) => {
      addNode(newNode);
      for (const edge of incomingEdges) {
        const resolvedEdge = edges.get(edge);
        if (resolvedEdge != null) {
          addEdge({
            ...resolvedEdge,
            source: resolvedEdge.source,
            target: newNode.id,
          });
        }
      }

      for (const edge of outgoingEdges) {
        const resolvedEdge = edges.get(edge);
        if (resolvedEdge != null) {
          addEdge({
            ...resolvedEdge,
            source: newNode.id,
            target: resolvedEdge.target,
          });
        }
      }
    });
    removeNode(id);
  }

  function serialize(): string {
    const nodeStrings = Object.values(nodes)
      .map((node) => `id: ${node.id}`)
      .join(", ");
    const edgeStrings = Object.values(edges)
      .map((edge) => `${edge.source.id} -> ${edge.target.id}`)
      .join(", ");
    return `Nodes: ${nodeStrings}
Edges: ${edgeStrings}`;
  }

  function getNode(id: string): Node | undefined {
    return nodes.get(id);
  }

  function addAttributeForNode(
    nodeId: string,
    attribute: string,
    attributeValue: string,
  ) {
    const targetNode = nodes.get(nodeId);
    if (targetNode == null) {
      throw new NodeNotFoundError(nodeId);
    }

    // If this attribute has been associated with another node, just add the edge.
    const leafAttributeNodeId = `${attribute}:${attributeValue}`;
    if (nodes.has(leafAttributeNodeId)) {
      addEdge({
        name: `${nodeId}:${leafAttributeNodeId}`,
        source: leafAttributeNodeId,
        target: nodeId,
        metadata: {},
      });
      return;
    }

    // otherwise build out the attribute structure
    let attributeNode = nodes.get(attribute);
    if (attributeNode == null) {
      attributeNode = {
        id: attribute,
        name: attribute,
        type: "attribute",
        metadata: {},
        incomingEdges: new Set(),
        outgoingEdges: new Set(),
      };
      nodes.set(attribute, attributeNode);
    }

    const leafNode = {
      id: leafAttributeNodeId,
      name: attributeValue,
      type: "attribute",
      metadata: {},
      parent: attribute,
    };
    addNode(leafNode);
  }

  return {
    get nodes(): Node[] {
      return Array.from(nodes.values());
    },
    get edges(): Edge[] {
      return Array.from(edges.values());
    },
    addNode,
    addEdge,
    addChild,
    addAttributeForNode,
    getNode,
    mapNodesById,
    removeEdge,
    removeNode,
    serialize,
  };
}
