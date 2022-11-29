// const { IAM_STORAGE } = require("./iam");
const { writeFileSync } = require("fs");
const { SERVICES_CONFIG: SERVICES } = require("./services");
const { evaluateSelector } = require("./utils");
const jmespath = require("jmespath");

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

function formatIdAsNode(serviceKey, resourceId) {
  return {
    group: "nodes",
    data: {
      id: resourceId,
      type: serviceKey,
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
    const formattedNodes = selectedNodes.map((resourceId) =>
      formatIdAsNode(serviceKey, resourceId)
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

function generateServiceMap(account, region) {
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

      console.log(
        `Prefilter ${serviceEdges.length} edges generated for ${service.key}`
      );
      const cleanedEdges = serviceEdges.filter(
        ({ data: { source, target } }) => {
          const sourceNode = graphNodes.find(({ data }) => data.id === source);
          const targetNode = graphNodes.find(({ data }) => data.id === target);
          console.log({
            source,
            target,
            sourceNode,
            targetNode,
          });
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

  const graphData = graphNodes.concat(graphEdges);

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
