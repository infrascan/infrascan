interface Node {
    id: string,
    name: string,
    metadata: object;
    parent?: string | Node,
    children?: Record<string, Node>,
    edges: {
        incoming: Record<string, Edge<Node>>,
        outgoing: Record<string, Edge<Node>>
    }
}

interface Edge<T extends string | Node> {
    id: string,
    metadata: object,
    source: T,
    target: T
}

interface Graph {
    nodes: Node[],
    edges: Edge<Node>[],
    addNode: (node: Node) => void,
    addEdge: (edge: Edge<string>) => void,
    getNode: (id: string) => Node | undefined,
    mapNodesById: (id: string, mapperFn: (node: Node) => Node[]) => void,
    removeEdge: (id: string) => Edge<Node>,
    removeNode: (id: string) => Node,
    serialize: () => string
};

/**
 * In memory graph model used by the Infrascan SDK. 
 * The graph is built using object references to support recursive lookups (e.g. `node.edges.outgoing["edge-1"].target.edges.incoming["edge-1"].source` and so on.)
 * 
 * The main aim behind the design of this graph model, is to be able to easily duplicate nodes and carry across their edges. This is particularly
 * useful for graphs which need to translate a node or set of nodes under a new parent, while maintaining their edges.
 * Specifically for infrascan, this is used to allow the basic system diagram translate nodes that exist under network primitives like VPCs without 
 * removing their existing edges.
 * @returns {Graph}
 */
export function Graph(): Graph {
    const nodes: Record<string, Node> = {};
    const edges: Record<string, Edge<Node>> = {};

    function addNode(node: Node) {
        if (nodes[node.id] != null) {
            throw new Error('Node already exists in graph');
        }
        try {
            nodes[node.id] = node;
            if (node.parent != null) {
                // Parent is of type Node at this point.
                addChild(
                    typeof node.parent === 'string'
                        ? node.parent
                        : node.parent.id,
                    node.id
                );
            }
        } catch (err: unknown) {
            delete nodes[node.id];
            throw err;
        }
    }

    function addChild(parent: string, child: string) {
        const parentNode = nodes[parent];
        const childNode = nodes[child];
        if (parentNode == null) {
            throw new Error('No node found for parent id');
        }
        if (childNode == null) {
            throw new Error('No node found for child id');
        }

        if (parentNode.children == null) {
            parentNode.children = {};
        }
        parentNode.children[childNode.id] = childNode;
        childNode.parent = parentNode;
    }

    function addEdge(edge: Edge<string>) {
        if (edges[edge.id] != null) {
            throw new Error(`${edge.id} already exists in graph`);
        }
        const sourceNode = nodes[edge.source];
        if (sourceNode == null) {
            throw new Error('Source node not found in graph');
        }
        const targetNode = nodes[edge.target];
        if (targetNode == null) {
            throw new Error('Target node not found in graph');
        }

        const preparedEdge = {
            ...edge,
            id: `${sourceNode.id}-${targetNode.id}`,
            source: sourceNode,
            target: targetNode
        };
        edges[preparedEdge.id] = preparedEdge;
        sourceNode.edges.outgoing[preparedEdge.id] = preparedEdge;
        targetNode.edges.incoming[preparedEdge.id] = preparedEdge;
    }

    function removeNode(id: string): Node {
        const node = nodes[id];
        if (node == null) {
            throw new Error(`No node found with ID: ${id}`);
        }
        console.log(node.id, Object.keys(node.edges.incoming));
        Object.keys(node.edges.incoming).forEach(removeEdge);
        Object.keys(node.edges.outgoing).forEach(removeEdge);
        delete nodes[id];
        return node;
    }

    function removeEdge(id: string): Edge<Node> {
        const edge = edges[id];
        if (edge == null) {
            throw new Error(`No edge found with ID: ${id}`);
        }
        delete edges[id];
        delete edge.source.edges.outgoing[id];
        delete edge.target.edges.incoming[id];
        return edge;
    }

    /**
     * Given an ID, remove a node from the graph and map it into some number of new nodes. Insert the new nodes into the graph.
     * @param {string} id The ID of a node to map into many nodes. Useful for duplicating nodes under multiple parents.
     * @param {(node: Node) => Node[]} mapperFn The mapping function which produces some number of new nodes from the existing node.
     */
    function mapNodesById(id: string, mapperFn: (node: Node) => Node[]) {
        const nodeToMap = nodes[id];
        const newNodes = mapperFn(nodeToMap);
        const edgesToAdd = newNodes.flatMap((newNode) => {
            addNode(newNode);
            const incomingNodes = Object.values(nodeToMap.edges.incoming).map((edge) => {
                return {
                    ...edge,
                    id: `${edge.source.id}-${newNode.id}`,
                    source: edge.source.id,
                    target: newNode.id
                };
            });

            const outgoingNodes = Object.values(nodeToMap.edges.outgoing).map((edge) => {
                return {
                    ...edge,
                    id: `${newNode.id}-${edge.target.id}`,
                    source: newNode.id,
                    target: edge.target.id
                };
            });

            return [...incomingNodes, ...outgoingNodes];
        });
        removeNode(id);
        edgesToAdd.forEach(addEdge);
    }

    function serialize(): string {
        const nodeStrings = Object.values(nodes).map((node) => `id: ${node.id}`).join(', ');
        const edgeStrings = Object.values(edges).map((edge) => `${edge.source.id} -> ${edge.target.id}`).join(', ');
        return `Nodes: ${nodeStrings}
Edges: ${edgeStrings}`;
    }

    function getNode(id: string): Node | undefined {
        return nodes[id];
    }

    return {
        get nodes(): Node[] {
            return Object.values(nodes);
        },
        get edges(): Edge<Node>[] {
            return Object.values(edges);
        },
        addNode,
        addEdge,
        getNode,
        mapNodesById,
        removeEdge,
        removeNode,
        serialize
    }
}