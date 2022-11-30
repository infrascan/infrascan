const { writeFileSync } = require("fs");
const jmespath = require("jmespath");

const { SERVICES_CONFIG: SERVICES } = require("../services");
const { hydrateRoleStorage } = require("../iam");
const { evaluateSelector, readStateFromFile } = require("../utils");

const { generateEdgesForCloudfrontResources } = require("./cloudfront");
const { generateEdgesForECSResources } = require("./ecs");
const { generateEdgesForRoute53Resources } = require("./route53");
const { formatEdge, generateEdgesForRole } = require("./graphUtilities");

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
      for (let roleSelector of service.iamRoles) {
        const roleArns = evaluateSelector(account, region, roleSelector);
        const computedEdges = roleArns.flatMap(({ arn, executor }) => {
          return generateEdgesForRole(account, region, arn, executor);
        });
        roleEdges.concat(computedEdges);
      }
      console.log(
        `Generated ${roleEdges.length - initialCount} edges for ${
          service.key
        }'s IAM roles`
      );
    }
  }

  console.log("Manually generating edges for route 53 resources");
  const route53Edges = generateEdgesForRoute53Resources(account, region);
  console.log(`Generated ${route53Edges.length} edges for route 53 resources`);
  console.log("Manually generating edges for cloudfront resources");
  const cloudfrontEdges = generateEdgesForCloudfrontResources(account, region);
  console.log(
    `Generated ${cloudfrontEdges.length} edges for cloudfront resources`
  );
  console.log("Manually generating edges for ECS resources");
  const ecsEdges = generateEdgesForECSResources(account, region);
  console.log(`Generated ${ecsEdges.length} edges for ECS resources`);

  const graphData = graphNodes
    .concat(graphEdges)
    .concat(roleEdges)
    .concat(route53Edges)
    .concat(cloudfrontEdges)
    .concat(ecsEdges);

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
