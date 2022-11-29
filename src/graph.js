const { writeFileSync } = require("fs");
const jmespath = require("jmespath");
const { SERVICES_CONFIG: SERVICES } = require("./services");
const { evaluateSelector, readStateFromFile } = require("./utils");
const { hydrateRoleStorage, IAM_STORAGE } = require("./iam");
const { curryMinimatch, getServiceFromArn } = require("./utils");

// {
//   group: "nodes",
//   data: {
//     id: resource.Arn || resource?.TaskDefinition?.taskDefinitionArn,
//     type: resource.ResourceKey,
//     name:
//       resource.Name ||
//       resource.Arn ||
//       resource?.TaskDefinition?.taskDefinitionArn,
//     node_data: resource,
//   },
// }

function formatIdAsNode(serviceKey, resourceId, parent) {
  return {
    group: "nodes",
    data: {
      id: resourceId,
      type: serviceKey,
      parent,
    },
  };
}

/**
 * Takes the account and region, and returns the list of nodes to be rendered
 * @param {string} account
 * @param {string} region
 * @param {string[]} nodes
 * @returns {any[]}
 */
function generateNodesForService(account, region, serviceKey, nodes) {
  return nodes.reduce((accumulatedNodes, currentSelector) => {
    const selectedNodes = evaluateSelector(account, region, currentSelector);
    console.log(account, region, currentSelector, selectedNodes);
    const formattedNodes = selectedNodes.map(({ id, parent }) =>
      formatIdAsNode(serviceKey, id, parent)
    );
    return accumulatedNodes.concat(formattedNodes);
  }, []);
}

function formatEdge(source, target, name) {
  return {
    group: "edges",
    data: {
      id: `${source}:${target}`,
      name,
      source,
      target,
      type: "edge",
    },
  };
}

/**
 *
 * @param {string} account
 * @param {string} region
 * @param {Object[]} edges
 * @param {string} edges[].from
 * @param {string} edges[].to
 * @param {string} edges[].name
 * @returns {Object[]} list of edge objects
 */
function generateEdgesForService(account, region, serviceEdges) {
  let edges = [];
  for (let edge of serviceEdges) {
    const { state, from, to } = edge;

    const baseState = evaluateSelector(account, region, state);
    const generatedEdges = baseState.flatMap((state) => {
      const sourceNode = jmespath.search(state, from);
      const target = jmespath.search(state, to);
      if (Array.isArray(target)) {
        return target.map((edgeTargetInfo) =>
          formatEdge(sourceNode, edgeTargetInfo.target, edgeTargetInfo.name)
        );
      } else if (target) {
        return formatEdge(sourceNode, target.target, target.name);
      } else {
        return [];
      }
    });

    edges = edges.concat(generatedEdges);
  }
  return edges;
}

function getStatementsForRole(role) {
  const inlineStatements =
    jmespath.search(
      role,
      "inlinePolicies[].PolicyDocument.Document[].Statement"
    ) ?? [];
  const attachedStatements =
    jmespath.search(role, "attachedPolicies[].Document.Statement") ?? [];
  return {
    inlineStatements,
    attachedStatements: attachedStatements.flatMap((x) => x),
  };
}

/**
 * Given a resource glob in an iam policy, resolves the relevant resources
 * @param {string} account
 * @param {string} region
 * @param {string} resourceArnFromPolicy
 * @returns {string[]} relevant arns
 */
function resolveResourceGlob(account, region, resourceArnFromPolicy) {
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
            .flatMap((nodeSelector) =>
              evaluateSelector(account, region, nodeSelector)
            )
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
            .flatMap((nodeSelector) =>
              evaluateSelector(account, region, nodeSelector)
            )
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
function generateEdgesForPolicyStatements(account, region, policyStatements) {
  return policyStatements.flatMap(({ Resource, ...rest }) => {
    if (Array.isArray(Resource)) {
      return Resource.flatMap((resourceGlobs) =>
        resolveResourceGlob(account, region, resourceGlobs)
      );
    } else {
      return resolveResourceGlob(account, region, Resource);
    }
  });
}

/**
 *
 * @param {string} account
 * @param {string} region
 * @param {string} roleExecutor - the arn of the resource using this role
 * @param {string[]} roleSelectors
 * @returns {Object[]} list of edge objects
 */
function generateEdgesForRole(account, region, roleSelectors) {
  let edges = [];
  for (let roleSelector of roleSelectors) {
    // Get roles for service
    const roleArns = evaluateSelector(account, region, roleSelector);
    const roleEdges = roleArns.flatMap(({ arn, executor }) => {
      const iamRole = IAM_STORAGE.getRole(arn);
      // Get role's policy statements
      const { inlineStatements, attachedStatements } =
        getStatementsForRole(iamRole);

      // Compute edges for inline policy statements
      const effectedResourcesForInlineStatements =
        generateEdgesForPolicyStatements(account, region, inlineStatements);

      // Compute edges for attached policy statements
      const effectedResourcesForAttachedStatements =
        generateEdgesForPolicyStatements(account, region, attachedStatements);

      // Iterate over the computed edges and format them
      return effectedResourcesForInlineStatements
        .concat(effectedResourcesForAttachedStatements)
        .map((effectedArn) =>
          formatEdge(executor, effectedArn, `${executor}:${effectedArn}`)
        );
    });
    edges = edges.concat(roleEdges);
  }
  return edges;
}

function generateServiceMap(account, region) {
  const iamState = readStateFromFile(account, region, "IAM", "roles");
  hydrateRoleStorage(iamState);

  let graphNodes = [];
  for (let service of SERVICES) {
    if (service.nodes) {
      console.log(`Generating graph nodes for ${service.key}`);
      const initialLength = graphNodes.length;
      graphNodes = graphNodes.concat(
        generateNodesForService(account, region, service.key, service.nodes)
      );
      console.log(
        `Generated ${graphNodes.length - initialLength} nodes for ${
          service.key
        }`
      );
    }
  }

  let graphEdges = [];
  for (let service of SERVICES) {
    if (service.edges) {
      console.log(`Generating graph edges for ${service.key}`);
      const initialLength = graphEdges.length;
      const serviceEdges = generateEdgesForService(
        account,
        region,
        service.edges
      );
      const cleanedEdges = serviceEdges.filter(
        ({ data: { source, target } }) => {
          const sourceNode = graphNodes.find(({ data }) => data.id === source);
          const targetNode = graphNodes.find(({ data }) => data.id === target);
          return sourceNode != null && targetNode != null;
        }
      );
      graphEdges = graphEdges.concat(cleanedEdges);
      console.log(
        `Generated ${graphEdges.length - initialLength} edges for ${
          service.key
        }`
      );
    }
  }

  let roleEdges = [];
  for (let service of SERVICES) {
    if (service.iamRoles) {
      const initialCount = roleEdges.length;
      roleEdges = roleEdges.concat(
        generateEdgesForRole(account, region, service.iamRoles)
      );
      console.log(
        `Generated ${roleEdges.length - initialCount} edges for ${
          service.key
        }'s IAM roles`
      );
    }
  }

  const graphData = graphNodes.concat(graphEdges).concat(roleEdges);

  writeFileSync(
    `./static/graph-${Date.now()}.json`,
    JSON.stringify(graphData, undefined, 2),
    {}
  );
  return graphData;
}

module.exports = {
  generateServiceMap,
};
