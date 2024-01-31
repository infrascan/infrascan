import { Graph } from "./graph";
import { AwsContext } from "./api";

// All supported events to trigger a plugin
export type GraphPluginEvents = "onServiceComplete" | "onRegionComplete" | "onAccountComplete" | "onGraphComplete";

/**
 * A plugin which is called everytime a service's nodes have been added to the graph.
 * Receives the current graph state, the service ID, and the current AWS Context.
 */
export type onServiceCompletePlugin = (graph: Graph, service: string, context: AwsContext) => void | Promise<void>;

/**
 * A plugin which is called everytime a region's nodes have been added to the graph.
 * Receives the current graph state, and the current AWS Context.
 */
export type onRegionCompletePlugin = (graph: Graph, context: AwsContext) => void | Promise<void>;

/**
 * A plugin which is called everytime an account's nodes have been added to the graph.
 * Receives the current graph state, and the current AWS Context.
 */
export type onAccountCompletePlugin = (graph: Graph, context: AwsContext) => void | Promise<void>;

/**
 * A plugin which is called when the entire graph has been generated.
 * Receives the entire graph state.
 */
export type onGraphCompletePlugin = (graph: Graph) => void | Promise<void>;

export type PluginEventHandlerTypes = {
    "onServiceComplete": onServiceCompletePlugin,
    "onRegionComplete": onRegionCompletePlugin,
    "onAccountComplete": onAccountCompletePlugin,
    "onGraphComplete": onGraphCompletePlugin,
};

export interface GraphPlugin<E extends GraphPluginEvents> {
    id: string,
    event: E,
    handler: PluginEventHandlerTypes[E]
}