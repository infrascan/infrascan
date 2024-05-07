import { minimatch } from "minimatch";

import type { Graph, GraphPlugin, Node } from "@infrascan/shared-types";

export interface GlobRule {
  glob: string;
  reducedNodeSuffix: string;
  service: string;
}

export interface RegexRule {
  regex: RegExp;
  reducedNodeSuffix: string;
  service: string;
}

export type ReducerRule = GlobRule | RegexRule;

function isGlobRule(rule: ReducerRule): rule is GlobRule {
  return "glob" in rule;
}

function isRegexRule(rule: ReducerRule): rule is GlobRule {
  return "regex" in rule;
}

type ServiceLike = { service?: string };

function aggregateByService<T extends ServiceLike>(
  items: T[],
): Record<string, T[]> {
  const serviceToRules: Record<string, T[]> = {};
  for (const item of items) {
    if (item.service != null) {
      if (serviceToRules[item.service] == null) {
        serviceToRules[item.service] = [];
      }
      serviceToRules[item.service].push(item);
    }
  }
  return serviceToRules;
}

function applyRule(rule: ReducerRule, node: Node): boolean {
  if (isGlobRule(rule)) {
    return minimatch(node.id, rule.glob);
  } else if (isRegexRule(rule)) {
    return rule.regex.test(node.id);
  }
  return false;
}

// Create new Node using `parent.id-suffix`
// Migrate all existing Node edges to new Node
// Delete all original Nodes
function collapseNodes() {}

function newNodeReducer(rules: Record<string, ReducerRule[]>) {
  return function reduceGraph(graph: Graph) {
    const nodesByService = aggregateByService(graph.nodes);
    for (const [service, serviceRules] of Object.entries(rules)) {
      if (
        nodesByService[service] == null ||
        nodesByService[service]?.length === 0
      ) {
        continue;
      }

      for (const rule of serviceRules) {
        const nodesToCollapse = nodesByService[service].filter((node) =>
          applyRule(rule, node),
        );

        // TODO: Nodes should be collapsed by parent
        // TODO: Only support child nodes for initial phase
        const nodesByParent = nodesToCollapse.reduce((acc, currentVal) => {
          // TODO: Fix horrific parent typing on Nodes
          const nodeParent = (currentVal.parent as string) ?? "none";
          if (acc[nodeParent] == null) {
            acc[nodeParent] = [];
          }
          acc[nodeParent].push(currentVal);
          return acc;
        }, {} as Record<string, Node[]>);

        nodesByParent;
      }
    }
  };
}

export default function createPlugin(
  rules: ReducerRule[],
): GraphPlugin<"onGraphComplete"> {
  const preparedRules = aggregateByService(rules);
  return {
    id: "@infrascan/node-reducer-plugin",
    event: "onGraphComplete",
    handler: newNodeReducer(preparedRules),
  };
}
