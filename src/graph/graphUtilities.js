const jmespath = require("jmespath");
const { IAM_STORAGE } = require("../iam");
const {
  curryMinimatch,
  getServiceFromArn,
  evaluateSelectorGlobally,
} = require("../utils");
const { SERVICES_CONFIG: SERVICES } = require("../services");

function formatEdge(source, target, name) {
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
  };
}

function getStatementsForRole(role) {
  const inlineStatements =
    jmespath.search(role, "inlinePolicies[].PolicyDocument.Statement[]") ?? [];
  const attachedStatements =
    jmespath.search(role, "attachedPolicies[].Document.Statement") ?? [];
  return {
    inlineStatements,
    attachedStatements: attachedStatements.flatMap((x) => x),
  };
}

/**
 * Given a resource glob in an iam policy, resolves the relevant resources
 * @param {string} resourceArnFromPolicy
 * @returns {string[]} relevant arns
 */
function resolveResourceGlob(resourceArnFromPolicy) {
  if (resourceArnFromPolicy === "*") {
    // TODO: use actions to infer which resources are impacted by a wildcard
    // E.g. Actions: [s3:GetObject], Resources: [*]
    return [];
  } else if (resourceArnFromPolicy.includes("*")) {
    const resourceService = getServiceFromArn(resourceArnFromPolicy);
    if (resourceService) {
      const serviceConfigs = SERVICES.filter(
        ({ service }) => service.toLowerCase() === resourceService.toLowerCase()
      );
      if (serviceConfigs) {
        const serviceArns = serviceConfigs.flatMap(({ nodes }) => {
          if (!nodes || nodes.length === 0) {
            return [];
          }
          const selectedNodes = nodes
            .flatMap((nodeSelector) => evaluateSelectorGlobally(nodeSelector))
            .map(({ id }) => id);
          // S3 Nodes use bucket names as they're globally unique, and the S3 API doesn't return ARNs
          // This means we need to build the ARN on the fly when matching in resource policies to allow partial
          // matches of <bucket-name> to <bucket-arn>/<object-path>
          if (resourceService === "s3") {
            return selectedNodes?.map((node) => `arn:aws:s3:::${node}`);
          }
          return selectedNodes;
        });
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
          });
      }
    }
  } else {
    const resourceService = getServiceFromArn(resourceArnFromPolicy);
    const serviceConfigs = SERVICES.filter(
      ({ service }) => service.toLowerCase() === resourceService.toLowerCase()
    );
    if (serviceConfigs) {
      const serviceArns = serviceConfigs.flatMap(({ nodes }) => {
        if (nodes) {
          return nodes
            .flatMap((nodeSelector) => evaluateSelectorGlobally(nodeSelector))
            .map(({ id }) => id);
        } else {
          return [];
        }
      });
      return serviceArns.filter(
        (knownArn) => knownArn === resourceArnFromPolicy
      );
    }
  }
  return [];
}

/**
 * Takes inline or attached policy statements and returns the edges
 * @param {Object[]} policyStatements
 * @param {string[]} policyStatements.Resource
 * @returns {string[]}
 */
function generateEdgesForPolicyStatements(policyStatements) {
  return policyStatements.flatMap(({ Resource }) => {
    if (Array.isArray(Resource)) {
      return Resource.flatMap((resourceGlobs) =>
        resolveResourceGlob(resourceGlobs)
      );
    } else {
      return resolveResourceGlob(Resource);
    }
  });
}

/**
 *
 * @param {string} arn
 * @param {string} roleExecutor - the arn of the resource using this role
 * @returns {Object[]} list of edge objects
 */
function generateEdgesForRole(arn, executor) {
  const iamRole = IAM_STORAGE.getRole(arn);
  // Get role's policy statements
  const { inlineStatements, attachedStatements } =
    getStatementsForRole(iamRole);

  // Compute edges for inline policy statements
  const effectedResourcesForInlineStatements =
    generateEdgesForPolicyStatements(inlineStatements);

  // Compute edges for attached policy statements
  const effectedResourcesForAttachedStatements =
    generateEdgesForPolicyStatements(attachedStatements);

  // Iterate over the computed edges and format them
  return effectedResourcesForInlineStatements
    .concat(effectedResourcesForAttachedStatements)
    .map((effectedArn) =>
      formatEdge(executor, effectedArn, `${executor}:${effectedArn}`)
    );
}

function sanitizeId(id) {
  return id
    .replaceAll(":", "-")
    .replaceAll("/", "")
    .replaceAll("\\", "")
    .replaceAll(".", "_");
}

module.exports = {
  formatEdge,
  generateEdgesForPolicyStatements,
  getStatementsForRole,
  generateEdgesForRole,
  sanitizeId,
};
