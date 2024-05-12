import { EdgeConflictError } from "@infrascan/core";
import { minimatch } from "minimatch";

import type {
  Graph,
  GraphPlugin,
  Node,
  Readable,
  Writable,
  Edge,
} from "@infrascan/shared-types";

export interface GlobRule {
  id: string;
  glob: string;
  reducedNodeSuffix: string;
  service: string;
}

export interface RegexRule {
  id: string;
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

function applyRule(rule: ReducerRule, node: Readable<Node>): boolean {
  if (isGlobRule(rule)) {
    return minimatch(node.id, rule.glob);
  } else if (isRegexRule(rule)) {
    return rule.regex.test(node.id);
  }
  return false;
}

function addEdgeToGraphIfNotExists(
  graph: Graph,
  edge: Pick<Writable<Edge>, "name" | "metadata" | "source" | "target">,
) {
  try {
    graph.addEdge(edge);
  } catch (err: unknown) {
    if (err instanceof EdgeConflictError) {
      return;
    }
    throw err;
  }
}

/**
 * Collapse nodes matching the given rules.
 * - Create a new Node using naming scheme: `{parent.id}-{rule.id}`
 * - Migrate all matching nodes' edges to the new Node
 * - Delete all original Nodes
 */
function collapseNodes(
  parent: string,
  nodes: Readable<Node>[],
  graph: Graph,
  rule: ReducerRule,
): Writable<Node> {
  const newNode: Writable<Node> = {
    id: `${parent}-${rule.id}`,
    name: `${parent}-${rule.id}`,
    metadata: {},
    incomingEdges: {},
    outgoingEdges: {},
    parent,
    service: rule.service,
  };
  graph.addNode(newNode);

  for (const node of nodes) {
    Object.values(node.outgoingEdges).forEach((outgoing) => {
      const edgeToInsert = {
        name: outgoing.name,
        source: newNode.id,
        target: outgoing.target.id,
        metadata: {},
      };
      addEdgeToGraphIfNotExists(graph, edgeToInsert);
      graph.removeEdge(outgoing.id);
    });
    Object.values(node.incomingEdges).forEach((incoming) => {
      const edgeToInsert = {
        name: incoming.name,
        source: incoming.source.id,
        target: newNode.id,
        metadata: {},
      };
      addEdgeToGraphIfNotExists(graph, edgeToInsert);
      graph.removeEdge(incoming.id);
    });
  }

  return newNode;
}

function reduceGraphWithRules(
  rules: Record<string, ReducerRule[]>,
  graph: Graph,
) {
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

      const nodesByParent = nodesToCollapse.reduce((acc, currentVal) => {
        const nodeParent = currentVal.parent?.id ?? "none";
        if (acc[nodeParent] == null) {
          acc[nodeParent] = [];
        }
        const nodeChildCount = Object.values(currentVal.children ?? {}).length;
        // Unclear how collapsing a node with children would work, ignore all non-leaf nodes.
        if (nodeChildCount > 0) {
          return acc;
        }
        acc[nodeParent].push(currentVal);
        return acc;
      }, {} as Record<string, Readable<Node>[]>);

      for (const [parent, nodes] of Object.entries(nodesByParent)) {
        collapseNodes(parent, nodes, graph, rule);
        nodes.forEach((node) => graph.removeNode(node.id));
      }
    }
  }
}

function newNodeReducer(rules: Record<string, ReducerRule[]>) {
  return (graph: Graph) => reduceGraphWithRules(rules, graph);
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
