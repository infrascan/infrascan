import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";

import type { Service } from "./services";
import type { BaseEdgeResolver } from "./config";
import type { GraphEdge, GraphNode } from "./graph";


/**
 * Callback to store state from a specific function call
 *
 * This is callback is invoked after every full scan of a service endpoint.
 */
export type ServiceScanCompleteCallbackFn = (
  /**
   * The AWS account being scanned
   */
  account: string,
  /**
   * The region being scanned
   */
  region: string,
  /**
   * The service being scanned
   */
  service: Service | "IAM",
  /**
   * The specific function called during scanning
   */
  functionName: string,
  /* eslint-disable @typescript-eslint/no-explicit-any */
  /**
   * The state retrieved from the function call
   */
  functionState: any,
) => Promise<void>;

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Callback to load scan state from a specific service call.
 *
 * This is used by the scan function pull back parameters for future function calls
 * A common pattern is to have resources listed, and then described.
 */
export type ResolveStateForServiceFunction = (
  /**
   * The AWS account that was scanned
   */
  account: string,
  /**
   * The scanned region
   */
  region: string,
  /**
   * The scanned service e.g. Lambda
   */
  service: Service,
  /**
   * The specific function called during the scan e.g. GetFunction
   */
  functionName: string,
) => Promise<any>;

/* eslint-disable @typescript-eslint/no-explicit-any */
export type GetGlobalStateForServiceFunction = (
  service: string,
  functionName: string,
) => any;

export interface Connector {
  onServiceScanCompleteCallback: ServiceScanCompleteCallbackFn;
  resolveStateForServiceFunction: ResolveStateForServiceFunction;
  getGlobalStateForServiceFunction: GetGlobalStateForServiceFunction;
};

type ClientBuilder<T, P extends Provider> = (
  credentials: AwsCredentialIdentityProvider,
  context: ProviderContextMap[P],
) => T;

type GetterFn<T, P extends Provider> = (
  client: T,
  stateConnector: Connector,
  context: ProviderContextMap[P]
) => Promise<void>;

type GetNodeFn<T extends Provider> = (
  stateConnector: Connector,
  context: ProviderContextMap[T]
) => Promise<GraphNode[]>;

type GetEdgeFn<T extends Provider> = (
  stateConnector: Connector,
  context: ProviderContextMap[T]
) => Promise<GraphEdge[]>;

export type Provider = "aws";

export type AwsContext = {
  account: string;
  region: string;
  partition?: string;
};

type ProviderContextMap = {
  aws: AwsContext
}

export type ProviderContext<T extends Provider> = {
  provider: T;
  context: ProviderContextMap[T];
};

type FormatNodeFn<P extends Provider> = (node: GraphNode, context: ProviderContextMap[P]) => GraphNode;
type FormatEdgeFn<P extends Provider> = (
  node: GraphEdge,
  context: ProviderContextMap[P]
) => GraphEdge;

export interface ServiceModule<T, P extends Provider> {
  provider: P;
  service: string;
  key: string;
  getClient: ClientBuilder<T, P>;
  callPerRegion: boolean;
  getters: GetterFn<T, P>[];
  nodes?: string[];
  getNodes?: GetNodeFn<P>;
  formatNode?: FormatNodeFn<P>;
  edges?: BaseEdgeResolver[];
  getEdges?: GetEdgeFn<P>;
  formatEdge?: FormatEdgeFn<P>;
};