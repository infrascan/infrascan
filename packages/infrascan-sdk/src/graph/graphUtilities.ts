import jmespath from "jmespath";
import { IAMStorage } from "../iam";
import type { StoredRole } from "../iam";
import {
  curryMinimatch,
  getServiceFromArn,
  evaluateSelectorGlobally,
} from "../utils";
import type { GraphNode, GraphEdge } from "../graphTypes";
import {
  REGIONAL_SERVICES,
  GLOBAL_SERVICES,
  ServiceConfig,
} from "../scrapers/services";
const ALL_SERVICES = REGIONAL_SERVICES.concat(GLOBAL_SERVICES);

export function formatEdge(
  source: string,
  target: string,
  name: string,
  statement?: any,
  roleArn?: string
): GraphEdge {
  const edgeId = `${source}:${target}`;
  return {
    group: "edges",
    id: sanitizeId(edgeId),
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
  statements: any[];
};

export function getStatementsForRole(role: StoredRole) {
  const inlineStatements: PolicyStatement[] =
    jmespath.search(
      role,
      "inlinePolicies[].{label:PolicyName,statements:PolicyDocument.Statement[]}"
    ) ?? [];
  const attachedStatements: PolicyStatement[] =
    jmespath.search(
      role,
      "attachedPolicies[].{label:PolicyName,statements:Document.Statement}"
    ) ?? [];
  return {
    inlineStatements: inlineStatements.flatMap((stmt) => stmt),
    attachedStatements: attachedStatements.flatMap((stmt) => stmt),
  };
}
export type GetGlobalStateForServiceAndFunction = (
  service: string,
  functionName: string
) => any;
export type ResolveResourceGlobOptions = {
  resourceArnFromPolicy: string;
  getGlobalStateForServiceAndFunction: GetGlobalStateForServiceAndFunction;
};

/**
 * Given a resource glob in an iam policy, resolves the relevant resources
 * @param {string} resourceArnFromPolicy
 * @returns {string[]} relevant arns
 */
export async function resolveResourceGlob({
  resourceArnFromPolicy,
  getGlobalStateForServiceAndFunction,
}: ResolveResourceGlobOptions): Promise<string[]> {
  if (resourceArnFromPolicy === "*") {
    // TODO: use actions to infer which resources are impacted by a wildcard
    // E.g. Actions: [s3:GetObject], Resources: [*]
    return [];
  } else if (resourceArnFromPolicy.includes("*")) {
    const resourceService = getServiceFromArn(resourceArnFromPolicy);
    if (resourceService == null) {
      console.warn("Failed to parse service from resource arn");
      return [];
    }
    const serviceConfig = ALL_SERVICES.find(
      ({ service, arnLabel }) =>
        (arnLabel ?? service).toLowerCase() === resourceService.toLowerCase()
    );
    if (serviceConfig == null) {
      return [];
    }
    const serviceArns = await findNodesForService(
      serviceConfig,
      getGlobalStateForServiceAndFunction
    );
    return serviceArns
      .filter(curryMinimatch(resourceArnFromPolicy, { partial: true }))
      .map((node) => {
        // Because of S3 bucket names being converted into ARNs above
        // we need to split out the name from the ARN to get the correct edge
        if (resourceService === "s3") {
          return node.split(":").pop();
        } else {
          return node;
        }
      })
      .filter((nodeId) => {
        return nodeId != null;
      }) as string[];
  } else {
    const resourceService = getServiceFromArn(resourceArnFromPolicy);
    if (resourceService == null) {
      console.warn("Failed to parse service from resource arn");
      return [];
    }
    const serviceConfig = ALL_SERVICES.find(
      ({ service }) => service.toLowerCase() === resourceService.toLowerCase()
    );
    if (serviceConfig == null) {
      console.warn("Unsupported service found in role policy");
      return [];
    }
    const { nodes } = serviceConfig;
    if (nodes == null) {
      return [];
    }

    const nodeIds = await findNodesForService(
      serviceConfig,
      getGlobalStateForServiceAndFunction
    );
    return nodeIds.filter((knownArn) => knownArn === resourceArnFromPolicy);
  }
}

async function findNodesForService(
  serviceConfig: ServiceConfig,
  getGlobalStateForServiceAndFunction: GetGlobalStateForServiceAndFunction
) {
  const { nodes, arnLabel, service } = serviceConfig;
  const resourceService = arnLabel ?? service;
  if (!nodes || nodes.length === 0) {
    return [];
  }

  let globalState: string[] = [];
  for (let selector of nodes) {
    const selectedState = (await evaluateSelectorGlobally(
      selector,
      getGlobalStateForServiceAndFunction
    )) as { id: string }[] | { id: string }[][];
    const nodeIds = selectedState.flatMap((resource) => {
      if (Array.isArray(resource)) {
        return resource.map(({ id }) => id);
      } else {
        return resource.id;
      }
    });
    globalState = globalState.concat(nodeIds);
  }
  // S3 Nodes use bucket names as they're globally unique, and the S3 API doesn't return ARNs
  // This means we need to build the ARN on the fly when matching in resource policies to allow partial
  // matches of <bucket-name> to <bucket-arn>/<object-path>
  if (resourceService === "s3") {
    return globalState?.map((node) => `arn:aws:s3:::${node}`);
  } else {
    return globalState;
  }
}

export type EdgeResource = {
  label: string;
  node: string;
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
  getGlobalStateForServiceAndFunction: GetGlobalStateForServiceAndFunction
): Promise<EdgeResource[]> {
  let resources: EdgeResource[] = [];
  for (let { label, statements } of policyStatements) {
    for (let statement of statements) {
      const { Resource } = statement;
      if (Array.isArray(Resource)) {
        for (let resourceGlobs of Resource) {
          const resolvedResources = await resolveResourceGlob({
            resourceArnFromPolicy: resourceGlobs,
            getGlobalStateForServiceAndFunction,
          });
          const formattedResources = resolvedResources.map((node) => ({
            label,
            node,
            statement,
          }));
          resources = resources.concat(formattedResources);
        }
      } else {
        const matchedResources = await resolveResourceGlob({
          resourceArnFromPolicy: Resource,
          getGlobalStateForServiceAndFunction,
        });
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
  getGlobalStateForServiceAndFunction: GetGlobalStateForServiceAndFunction
) {
  const iamRole = iamStorage.getRole(arn);
  if (iamRole == null) {
    console.warn("Unknown role arn given to generate edges");
    return;
  }
  // Get role's policy statements
  const { inlineStatements, attachedStatements } =
    getStatementsForRole(iamRole);

  // Compute edges for inline policy statements
  const effectedResourcesForInlineStatements =
    await generateEdgesForPolicyStatements(
      inlineStatements,
      getGlobalStateForServiceAndFunction
    );

  // Compute edges for attached policy statements
  const effectedResourcesForAttachedStatements =
    await generateEdgesForPolicyStatements(
      attachedStatements,
      getGlobalStateForServiceAndFunction
    );

  // Iterate over the computed edges and format them
  return effectedResourcesForInlineStatements
    .concat(effectedResourcesForAttachedStatements)
    .map(({ label, node, statement }) =>
      formatEdge(executor, node, label, statement, arn)
    );
}

export function sanitizeId(id: string): string {
  return id
    .replace(/:/g, "-")
    .replace(/\//g, "")
    .replace(/\\/g, "")
    .replace(/\./g, "_");
}
