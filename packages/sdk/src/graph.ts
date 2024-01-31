import jmespath from "jmespath";
import minimatch from "minimatch";
import type {
  GraphEdge,
  GraphNode,
  GraphElement,
  GetGlobalStateForServiceFunction,
  ResolveStateForServiceFunction,
} from "@infrascan/shared-types";
import { IAMStorage } from "./aws/helpers/iam";
import type { ScanMetadata } from "./scan";
import type { StoredRole } from "./aws/helpers/iam";
import type { ServiceNodesMap } from "./index";
import type { Graph } from "@infrascan/core";

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
    id: `${account}-${region}`,
    data: {
      id: `${account}-${region}`,
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

/**
 * Add a node into the graph logging any errors that the graph module throws.
 * @param graph The in-memory graph
 * @param node The node to insert into the graph
 */
export function addNodeToGraphUnchecked(
  graph: Graph,
  node: GraphNode,
) {
  try {
    graph.addNode({
      id: node.id,
      name: node.id ?? node.data.name,
      metadata: node.metadata,
      parent: node.data.parent,
    });
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.warn(`An error occurred while inserting node ${node.id} into graph. ${err.message}`);
    } else {
      console.warn(`An unexpected error occurred while inserting node ${node.id} into graph.`);
    }
  }
}

/**
 * Add an edge to the graph logging any errors that the graph module throws.
 * @param graph The in-memory graph
 * @param edge The edge to insert into the graph
 */
export function addEdgeToGraphUnchecked(
  graph: Graph,
  edge: GraphEdge,
) {
  try {
    graph.addEdge({
      source: edge.data.source,
      target: edge.data.target,
      metadata: Object.assign(edge.metadata ?? {}, edge.data),
    });
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.warn(`An error occurred while inserting edge ${edge.data.source}-${edge.data.target} into graph. ${err.message}`);
    } else {
      console.error(`An unexpected error occurred while inserting edge ${edge.data.source}-${edge.data.target} into graph.`);
    }
  }
}

function getServiceFromArn(arn: string): string | undefined {
  const [, , service] = arn.split(":");
  return service;
}

function formatRoleEdge(
  source: string,
  target: string,
  name: string,
  /* eslint-disable @typescript-eslint/no-explicit-any */
  statement?: any,
  roleArn?: string,
): GraphEdge {
  const edgeId = `${source}:${target}`;
  return {
    group: "edges",
    id: edgeId,
    data: {
      id: edgeId,
      name,
      source,
      target,
      type: "edge",
    },
    metadata: {
      roleArn,
      label: name,
      statement,
    },
  };
}

type PolicyStatement = {
  label: string;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  statements: any[];
};

export function getStatementsForRole(role: StoredRole) {
  const inlineStatements: PolicyStatement[] =
    jmespath.search(
      role,
      "inlinePolicies[].{label:PolicyName,statements:PolicyDocument.Statement[]}",
    ) ?? [];
  const attachedStatements: PolicyStatement[] =
    jmespath.search(
      role,
      "attachedPolicies[].{label:PolicyName,statements:Document.Statement}",
    ) ?? [];
  return {
    inlineStatements: inlineStatements.flatMap((stmt) => stmt),
    attachedStatements: attachedStatements.flatMap((stmt) => stmt),
  };
}

/**
 * Given a resource glob in an iam policy, resolves the relevant resources
 * @param {string} resourceArnFromPolicy
 * @returns {string[]} relevant arns
 */
export async function resolveResourceGlob(
  resourceArnFromPolicy: string,
  nodesMap: ServiceNodesMap,
): Promise<string[]> {
  if (resourceArnFromPolicy === "*") {
    // TODO: use actions to infer which resources are impacted by a wildcard
    // E.g. Actions: [s3:GetObject], Resources: [*]
    return [];
  }
  const resourceService = getServiceFromArn(
    resourceArnFromPolicy,
  )?.toLowerCase();
  if (resourceService == null) {
    console.warn("Failed to parse service from resource arn");
    return [];
  }

  if (nodesMap[resourceService] == null) {
    console.warn("Unsupported service found in role policy", resourceService);
    return [];
  }

  if (resourceArnFromPolicy.includes("*")) {
    return nodesMap[resourceService]
      .filter(minimatch.filter(resourceArnFromPolicy, { partial: true }))
      .filter((nodeId) => nodeId != null) as string[];
  }
  return nodesMap[resourceService].filter(
    (knownArn) => knownArn === resourceArnFromPolicy,
  );
}

export type EdgeResource = {
  label: string;
  node: string;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  statement: any;
};

/**
 * Takes inline or attached policy statements and returns the edges
 * @param {PolicyStatement[]} policyStatements
 * @param {string[]} policyStatements.Resource
 * @returns {string[]}
 */
export async function generateEdgesForPolicyStatements(
  policyStatements: PolicyStatement[],
  nodesMap: ServiceNodesMap,
): Promise<EdgeResource[]> {
  let resources: EdgeResource[] = [];
  for (const { label, statements } of policyStatements) {
    const mappedStatements = Array.isArray(statements)
      ? statements
      : [statements];
    for (const statement of mappedStatements) {
      const { Resource } = statement;
      if (Array.isArray(Resource)) {
        for (const resourceGlobs of Resource) {
          const resolvedResources = await resolveResourceGlob(
            resourceGlobs,
            nodesMap,
          );
          const formattedResources = resolvedResources.map((node) => ({
            label,
            node,
            statement,
          }));
          resources = resources.concat(formattedResources);
        }
      } else {
        const matchedResources = await resolveResourceGlob(Resource, nodesMap);
        const formattedResources = matchedResources.map((node) => ({
          label,
          node,
          statement,
        }));
        resources = resources.concat(formattedResources);
      }
    }
  }
  return resources;
}

/**
 * @param {IAMStorage} iamStorage
 * @param {string} arn
 * @param {string} executor - the arn of the resource using this role
 * @param {GetGlobalStateForServiceAndFunction} getGlobalStateForServiceAndFunction
 * @returns {Object[]} list of edge objects
 */
export async function generateEdgesForRole(
  iamStorage: IAMStorage,
  arn: string,
  executor: string,
  nodesMap: ServiceNodesMap,
): Promise<GraphEdge[]> {
  const iamRole = iamStorage.getRole(arn);
  if (iamRole == null) {
    console.warn("Unknown role arn given to generate edges");
    return [];
  }
  // Get role's policy statements
  const { inlineStatements, attachedStatements } =
    getStatementsForRole(iamRole);

  // Compute edges for inline policy statements
  const effectedResourcesForInlineStatements =
    await generateEdgesForPolicyStatements(inlineStatements, nodesMap);

  // Compute edges for attached policy statements
  const effectedResourcesForAttachedStatements =
    await generateEdgesForPolicyStatements(attachedStatements, nodesMap);

  // Iterate over the computed edges and format them
  return effectedResourcesForInlineStatements
    .concat(effectedResourcesForAttachedStatements)
    .map(({ label, node, statement }) =>
      formatRoleEdge(executor, node, label, statement, arn),
    );
}
