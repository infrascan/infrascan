const { readFileSync, writeFileSync, statSync } = require("fs");
const jmespath = require("jmespath");

const { SERVICES_CONFIG: SERVICES } = require("../services");
const { hydrateRoleStorage, clearRoleStorage } = require("../iam");
const {
  evaluateSelector,
  readStateFromFile,
  METADATA_PATH,
  DEFAULT_REGION,
  evaluateSelectorGlobally,
  splitServicesByGlobalAndRegional,
} = require("../utils");

const { generateEdgesForCloudfrontResources } = require("./cloudfront");
const { generateEdgesForECSResources } = require("./ecs");
const { generateEdgesForRoute53Resources } = require("./route53");
const {
  formatEdge,
  generateEdgesForRole,
  sanitizeId,
} = require("./graphUtilities");

function formatIdAsNode(serviceKey, resourceId, metadata = {}) {
  return {
    group: "nodes",
    id: sanitizeId(resourceId),
    data: {
      id: resourceId,
      type: serviceKey,
      ...metadata,
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
function generateNodesForService(account, region, serviceKey, nodes, isGlobal) {
  return nodes.reduce((accumulatedNodes, currentSelector) => {
    const selectedNodes = evaluateSelector(account, region, currentSelector);
    console.log(account, region, currentSelector, selectedNodes);
    const formattedNodes = selectedNodes.map(({ id, parent }) => {
      const parentId = parent ? parent : isGlobal ? account : region;
      return formatIdAsNode(serviceKey, id, {
        parent: parentId,
      });
    });
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

function generateEdgesForServiceGlobally(serviceEdges) {
  let edges = [];
  for (let edge of serviceEdges) {
    const { state, from, to } = edge;

    const baseState = evaluateSelectorGlobally(state);
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
  const accountNode = formatIdAsNode("AWS-Account", account, {
    name: `AWS Account ${account}`,
  });
  const regionNode = formatIdAsNode("AWS-Region", region, {
    parent: account,
    name: `AWS Region ${region}`,
  });
  const iamState = readStateFromFile(account, region, "IAM", "roles");
  hydrateRoleStorage(iamState);

  let graphNodes = [accountNode, regionNode];
  for (let service of SERVICES) {
    if (service.nodes) {
      console.log(`Generating graph nodes for ${service.key}`);
      const initialLength = graphNodes.length;
      graphNodes = graphNodes.concat(
        generateNodesForService(
          account,
          region,
          service.key,
          service.nodes,
          service.global
        )
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
        roleEdges = roleEdges.concat(computedEdges);
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

  // don't overwrite previous graphs, move to last mod time file name
  const stat = statSync("./static/graph.json");
  const oldGraph = readFileSync("./static/graph.json");
  writeFileSync(
    `./static/graph-old-${Number(stat.mtimeMs)}.json`,
    oldGraph,
    {}
  );

  writeFileSync(
    `./static/graph.json`,
    JSON.stringify(graphData, undefined, 2),
    {}
  );
  return graphData;
}

function generateGraph() {
  const scanMetadataContents = readFileSync(METADATA_PATH).toString();
  const scanMetadata = JSON.parse(scanMetadataContents);
  console.log("Generating graph based on scan metadata", {
    scanMetadata,
  });
  let graphNodes = [];

  const { global, regional } = splitServicesByGlobalAndRegional(SERVICES);
  // Generate root nodes — Accounts and regions
  for (let { account, regions } of scanMetadata) {
    console.log(`Generating Nodes for ${account}`);
    const accountNode = formatIdAsNode("AWS-Account", account, {
      name: `AWS Account ${account}`,
    });
    graphNodes.push(accountNode);
    const regionNodes = regions.map((region) =>
      formatIdAsNode("AWS-Region", region, {
        parent: account,
        name: `${region} (${account})`,
      })
    );
    graphNodes = graphNodes.concat(regionNodes);
    // Only read IAM data from default region (global service)
    const iamState = readStateFromFile(account, DEFAULT_REGION, "IAM", "roles");
    hydrateRoleStorage(iamState);

    // Generate nodes for each global service
    for (let service of global) {
      if (service.nodes) {
        console.log(`Generating graph nodes for ${service.key} in ${account}`);
        const initialLength = graphNodes.length;
        graphNodes = graphNodes.concat(
          generateNodesForService(
            account,
            DEFAULT_REGION,
            service.key,
            service.nodes,
            service.global
          )
        );
        console.log(
          `Generated ${graphNodes.length - initialLength} nodes for ${
            service.key
          }`
        );
      }
    }

    // step through each scaned region
    for (let region of regions) {
      console.log(`Generating Nodes for ${account} in ${region}`);
      // generate nodes for each regional service in this region
      for (let regionalService of regional) {
        if (regionalService.nodes) {
          console.log(`Generating graph nodes for ${regionalService.key}`);
          const initialLength = graphNodes.length;
          graphNodes = graphNodes.concat(
            generateNodesForService(
              account,
              region,
              regionalService.key,
              regionalService.nodes,
              regionalService.global
            )
          );
          console.log(
            `Generated ${graphNodes.length - initialLength} nodes for ${
              regionalService.key
            }`
          );
        }
      }
    }
    // clearRoleStorage();
  }

  let graphEdges = [];
  for (let service of SERVICES) {
    if (service.edges) {
      console.log(`Generating graph edges for ${service.key}`);
      const initialLength = graphEdges.length;
      const serviceEdges = generateEdgesForServiceGlobally(service.edges);
      const cleanedEdges = serviceEdges.filter(
        ({ data: { source, target } }) => {
          const sourceNode = graphNodes.find(({ data }) => data.id === source);
          const targetNode = graphNodes.find(({ data }) => data.id === target);
          return sourceNode != null && targetNode != null;
        }
      );
      console.log(graphEdges.length, cleanedEdges.length);
      console.log(graphEdges);
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
        const roleArns = evaluateSelectorGlobally(roleSelector);
        const computedEdges = roleArns.flatMap(({ arn, executor }) => {
          return generateEdgesForRole(arn, executor);
        });
        roleEdges = roleEdges.concat(computedEdges);
      }
      console.log(
        `Generated ${roleEdges.length - initialCount} edges for ${
          service.key
        }'s IAM roles`
      );
    }
  }

  console.log("Manually generating edges for route 53 resources");
  const route53Edges = generateEdgesForRoute53Resources();
  console.log(`Generated ${route53Edges.length} edges for route 53 resources`);
  console.log("Manually generating edges for cloudfront resources");
  const cloudfrontEdges = generateEdgesForCloudfrontResources();
  console.log(
    `Generated ${cloudfrontEdges.length} edges for cloudfront resources`
  );
  console.log("Manually generating edges for ECS resources");
  const ecsEdges = generateEdgesForECSResources();
  console.log(`Generated ${ecsEdges.length} edges for ECS resources`);

  const graphData = graphNodes
    .concat(graphEdges)
    .concat(roleEdges)
    .concat(route53Edges)
    .concat(cloudfrontEdges)
    .concat(ecsEdges);

  // don't overwrite previous graphs, move to last mod time file name
  const stat = statSync("./static/graph.json");
  const oldGraph = readFileSync("./static/graph.json");
  writeFileSync(
    `./static/graph-old-${Number(stat.mtimeMs)}.json`,
    oldGraph,
    {}
  );

  writeFileSync(
    `./static/graph.json`,
    JSON.stringify(graphData, undefined, 2),
    {}
  );

  // TODO: add sanitized + searchable id to graph entries
  return graphData;
}

module.exports = {
  generateServiceMap,
  generateGraph,
};
