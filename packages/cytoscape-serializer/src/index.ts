/**
 * A node on the graph in Cytoscape format
 */
export type CytoscapeNode = {
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
export type CytoscapeEdge = {
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
export type CytoscapeGraph = CytoscapeNode | CytoscapeEdge;


export type EdgeTarget = {
    name: string;
    target: string;
};