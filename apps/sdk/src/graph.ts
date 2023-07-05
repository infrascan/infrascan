import jmespath from "jmespath";
import {
  GLOBAL_SERVICES,
  REGIONAL_SERVICES,
  EdgeResolver,
} from "@scrapers/services";
import { AWS_DEFAULT_REGION } from "./aws/defaults";
import { generateEdgesForCloudfrontResources } from "./aws/graph/cloudfront";
// import { generateNodesForEc2Networking } from "./graph/ec2";
import { generateEdgesForECSResources } from "./aws/graph/ecs";
import { generateEdgesForRoute53Resources } from "./aws/graph/route53";
import { IAMStorage, StoredRole, hydrateRoleStorage } from "./aws/helpers/iam";
import {
  evaluateSelector,
  evaluateSelectorGlobally,
} from "./aws/helpers/state";
import {
  formatEdge,
  generateEdgesForRole,
  sanitizeId,
} from "./aws/graph/graph-utilities";

import type {
  GraphEdge,
  GraphNode,
  GraphElement,
  GetGlobalStateForServiceAndFunction,
  ResolveStateFromServiceFn,
} from "@infrascan/shared-types";
import type { ScanMetadata } from "./scan";

function formatIdAsNode(
  serviceKey: string,
  resourceId: string,
  metadata = {}
): GraphNode {
  return {
    group: "nodes",
    id: sanitizeId(resourceId),
    data: {
      id: resourceId,
      type: serviceKey,
    },
    metadata,
  };
}

type GenerateNodesForServiceOptions = {
  account: string;
  region: string;
  serviceName: string;
  serviceKey: string;
  nodes: string[];
  isGlobal: boolean;
  resolveStateForServiceCall: ResolveStateFromServiceFn;
};

type SelectedNode = {
  id: string;
  parent?: string;
  [key: string]: any;
};

async function generateNodesForService({
  account,
  region,
  serviceName,
  serviceKey,
  nodes,
  isGlobal,
  resolveStateForServiceCall,
}: GenerateNodesForServiceOptions): Promise<GraphNode[]> {
  let accumulatedNodes: GraphNode[] = [];
  for (const currentSelector of nodes) {
    const selectedNodes = await evaluateSelector(
      account,
      region,
      currentSelector,
      resolveStateForServiceCall
    );
    console.log(account, region, currentSelector);
    const formattedNodes = selectedNodes.flatMap(
      ({ id, parent, ...metadata }: SelectedNode) => {
        const parentId = parent
          ? parent
          : isGlobal
          ? account
          : `${account}-${region}`;
        return formatIdAsNode(serviceKey, id, {
          parent: parentId,
          service: serviceName,
          ...metadata,
        });
      }
    );
    accumulatedNodes = accumulatedNodes.concat(formattedNodes);
  }
  return accumulatedNodes;
}

type GenerateEdgesForServiceGloballyOptions = {
  serviceEdges: EdgeResolver[];
  getGlobalStateForServiceAndFunction: GetGlobalStateForServiceAndFunction;
};

type EdgeTarget = {
  name: string;
  target: string;
};

/**
 * Pull in global state and use it to generate edges
 * @param {Object[]} edges
 * @param {string} edges[].from
 * @param {string} edges[].to
 * @param {string} edges[].name
 * @returns {Object[]} list of edge objects
 */
async function generateEdgesForServiceGlobally({
  serviceEdges,
  getGlobalStateForServiceAndFunction,
}: GenerateEdgesForServiceGloballyOptions): Promise<GraphEdge[]> {
  let edges: GraphEdge[] = [];
  for (const edge of serviceEdges) {
    const { state, from, to } = edge;

    const baseState = await evaluateSelectorGlobally(
      state,
      getGlobalStateForServiceAndFunction
    );
    const generatedEdges = baseState.flatMap((state: any) => {
      const sourceNode: string = jmespath.search(state, from);
      const target: EdgeTarget | EdgeTarget[] | null = jmespath.search(
        state,
        to
      );
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

type GenerateGraphOptions = {
  scanMetadata: ScanMetadata[];
  resolveStateForServiceCall: ResolveStateFromServiceFn;
  getGlobalStateForServiceAndFunction: GetGlobalStateForServiceAndFunction;
};

export async function generateGraph({
  scanMetadata,
  resolveStateForServiceCall,
  getGlobalStateForServiceAndFunction,
}: GenerateGraphOptions): Promise<GraphElement[]> {
  const iamStorage = new IAMStorage();
  console.log("Generating graph based on scan metadata", {
    scanMetadata,
  });
  let graphNodes: GraphNode[] = [];
  // Generate root nodes — Accounts and regions
  for (const { account, regions } of scanMetadata) {
    console.log(`Generating Nodes for ${account}`);
    const accountNode = formatIdAsNode("AWS-Account", account, {
      name: `AWS Account ${account}`,
    });
    graphNodes.push(accountNode);
    const regionNodes = regions.map((region) =>
      formatIdAsNode("AWS-Region", `${account}-${region}`, {
        parent: account,
        name: `${region} (${account})`,
      })
    );
    graphNodes = graphNodes.concat(regionNodes);
    // Only read IAM data from default region (global service)
    const iamState: StoredRole[] = await getGlobalStateForServiceAndFunction(
      "IAM",
      "roles"
    );
    hydrateRoleStorage(iamState);

    // Generate nodes for each global service
    for (const service of GLOBAL_SERVICES) {
      if (service.nodes) {
        console.log(`Generating graph nodes for ${service.key} in ${account}`);
        const initialLength = graphNodes.length;
        graphNodes = graphNodes.concat(
          await generateNodesForService({
            account,
            region: AWS_DEFAULT_REGION,
            serviceName: service.service,
            serviceKey: service.key,
            nodes: service.nodes,
            isGlobal: true,
            resolveStateForServiceCall,
          })
        );
        console.log(
          `Generated ${graphNodes.length - initialLength} nodes for ${
            service.key
          }`
        );
      }
    }

    // step through each scaned region
    for (const region of regions) {
      console.log(`Generating Nodes for ${account} in ${region}`);
      // generate nodes for each regional service in this region
      for (const regionalService of REGIONAL_SERVICES) {
        // if (regionalService.key === "EC2-Networking") {
        //   const ec2NetworkingNodes = generateNodesForEc2Networking(
        //     account,
        //     region
        //   );
        //   graphNodes = graphNodes.concat(ec2NetworkingNodes);
        // }
        if (regionalService.nodes) {
          console.log(`Generating graph nodes for ${regionalService.key}`);
          const initialLength = graphNodes.length;
          graphNodes = graphNodes.concat(
            await generateNodesForService({
              account,
              region,
              serviceName: regionalService.service,
              serviceKey: regionalService.key,
              nodes: regionalService.nodes,
              isGlobal: false,
              resolveStateForServiceCall,
            })
          );
          console.log(
            `Generated ${graphNodes.length - initialLength} nodes for ${
              regionalService.key
            }`
          );
        }
      }
    }
  }

  const ALL_SERVICES = [...GLOBAL_SERVICES, ...REGIONAL_SERVICES];
  // Step over each service, generate edges for each one based on global state (all regions, all accounts)
  let graphEdges: GraphEdge[] = [];
  for (const service of ALL_SERVICES) {
    if (service.edges) {
      console.log(`Generating graph edges for ${service.key}`);
      const initialLength = graphEdges.length;
      const serviceEdges = await generateEdgesForServiceGlobally({
        serviceEdges: service.edges,
        getGlobalStateForServiceAndFunction,
      });
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

  // Step over each service, generate edges for the service's roles based on global state (any region, any account)
  let roleEdges: GraphEdge[] = [];
  for (const service of ALL_SERVICES) {
    if (service.iamRoles) {
      const initialCount = roleEdges.length;
      for (const roleSelector of service.iamRoles) {
        const roleArns = await evaluateSelectorGlobally(
          roleSelector,
          getGlobalStateForServiceAndFunction
        );
        for (const { arn, executor } of roleArns) {
          const generatedEdges = await generateEdgesForRole(
            iamStorage,
            arn,
            executor,
            getGlobalStateForServiceAndFunction
          );
          if (generatedEdges) {
            roleEdges = roleEdges.concat(generatedEdges);
          }
        }
      }
      console.log(
        `Generated ${roleEdges.length - initialCount} edges for ${
          service.key
        }'s IAM roles`
      );
    }
  }

  // Generate edges manually for services which are too complex to configure in the json file
  console.log("Manually generating edges for route 53 resources");
  const route53Edges = await generateEdgesForRoute53Resources(
    getGlobalStateForServiceAndFunction
  );
  console.log(`Generated ${route53Edges.length} edges for route 53 resources`);
  console.log("Manually generating edges for cloudfront resources");
  const cloudfrontEdges = await generateEdgesForCloudfrontResources(
    getGlobalStateForServiceAndFunction
  );
  console.log(
    `Generated ${cloudfrontEdges.length} edges for cloudfront resources`
  );
  console.log("Manually generating edges for ECS resources");
  const ecsEdges = await generateEdgesForECSResources(
    iamStorage,
    getGlobalStateForServiceAndFunction
  );
  console.log(`Generated ${ecsEdges.length} edges for ECS resources`);

  // Collapse all graph elems into a single list before returning
  return (graphNodes as GraphElement[])
    .concat(graphEdges)
    .concat(roleEdges)
    .concat(route53Edges)
    .concat(cloudfrontEdges)
    .concat(ecsEdges);
}
