import type {
  GraphEdge,
  GraphNode,
  GraphElement,
  GetGlobalStateForServiceFunction,
  ResolveStateForServiceFunction,
} from "@infrascan/shared-types";
import type { ScanMetadata } from "./scan";

/**
 * Parameters required to convert a scan output into an infrastructure graph.
 */
export type GenerateGraphOptions = {
  /**
   * A list of scan outputs. This allows scans over many accounts to be composed into a single graph.
   */
  scanMetadata: ScanMetadata[];
  /**
   * Function used to retrieve the state from the scan.
   * This should be the same as the corresponding callback given to scan.
   */
  resolveStateForServiceCall: ResolveStateForServiceFunction;
  /**
   * Callback to retrieve global state for a service and function. This allows for links to be resolved
   * across account boundaries.
   */
  getGlobalStateForServiceAndFunction: GetGlobalStateForServiceFunction;
};

export { GraphEdge, GraphNode, GraphElement, GetGlobalStateForServiceFunction };

const AWS_ACCOUNT_SERVICE_KEY = "AWS-Account";
export function buildAccountNode(account: string): GraphNode {
  const humanReadableAccountName = `AWS Account ${account}`;
  return {
    group: "nodes",
    id: account,
    data: {
      id: account,
      type: AWS_ACCOUNT_SERVICE_KEY,
      name: humanReadableAccountName,
    },
    metadata: {
      name: humanReadableAccountName,
    },
  };
}

const AWS_REGION_SERVICE_KEY = "AWS-Region";
export function buildRegionNode(account: string, region: string): GraphNode {
  const humanReadableRegionName = `${region} (${account})`;
  return {
    group: "nodes",
    id: region,
    data: {
      id: region,
      type: AWS_REGION_SERVICE_KEY,
      parent: account,
      name: humanReadableRegionName,
    },
    metadata: {
      parent: account,
      name: humanReadableRegionName,
    },
  };
}

export function addGraphElementToMap<T extends GraphElement>(elementMap: Record<string, T>, element: T) {
  if(elementMap[element.data.id] == null) {
    elementMap[element.data.id] = element;
  } else {
    console.warn(`Duplicate element found: ${element.data.id}`);
  }
}