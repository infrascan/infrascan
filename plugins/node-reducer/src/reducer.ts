import { EdgeConflictError } from "@infrascan/core";
import { minimatch } from "minimatch";

import type {
  Graph,
  Node,
  Readable,
  Writable,
  Edge,
  BaseState,
} from "@infrascan/shared-types";

/**
 * Rule based on a glob selector. Globs are evaluated using the `minimatch` library.
 *
 * The id for the rule should be in kebab case, as it used as part of the id for the resulting nodes.
 */
export interface GlobRule {
  id: string;
  glob: string;
  service: string;
}

/**
 * Rule based on a regex.
 *
 * The id for the rule should be in kebab case, as it used as part of the id for the resulting nodes.
 */
export interface RegexRule {
  id: string;
  regex: RegExp;
  service: string;
}

export type ReducerRule = GlobRule | RegexRule;

function isGlobRule(rule: ReducerRule): rule is GlobRule {
  return "glob" in rule;
}

function isRegexRule(rule: ReducerRule): rule is GlobRule {
  return "regex" in rule;
}

export function aggregateByService<T extends BaseState>(
  items: T[],
): Record<string, T[]> {
  const serviceToRules: Record<string, T[]> = {};
  for (const item of items) {
    if (item.resource.category != null) {
      if (serviceToRules[item.resource.category] == null) {
        serviceToRules[item.resource.category] = [];
      }
      serviceToRules[item.resource.category].push(item);
    }
  }
  return serviceToRules;
}

export function applyRule(rule: ReducerRule, node: Readable<Node>): boolean {
  if (isGlobRule(rule)) {
    return minimatch(node.$graph.id, rule.glob);
  }
  if (isRegexRule(rule)) {
    return rule.regex.test(node.$graph.id);
  }
  return false;
}

export function addEdgeToGraphIfNotExists(
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
export function collapseNodes(
  parent: string,
  nodes: Readable<Node>[],
  graph: Graph,
  rule: ReducerRule,
): Writable<Node> {
  const newNode: Writable<Node> = {
    $graph: {
      id: `${parent}-${rule.id}`,
      label: `${parent}-${rule.id}`,
      parent,
      nodeClass: nodes[0]?.$graph.nodeClass ?? "visual",
      nodeType: nodes[0]?.$graph.nodeType,
    },
    tenant: nodes[0].tenant,
    $metadata: nodes[0].$metadata,
    resource: {
      category: rule.service,
      subcategory: rule.id,
      id: `${parent}-${rule.id}`,
      name: `${parent}-${rule.id}`,
    },
    tags: [
      {
        key: `${rule.id}::count`,
        value: `${nodes.length}`,
      },
    ],
    incomingEdges: {},
    outgoingEdges: {},
    parent,
  };
  graph.addNode(newNode);

  for (const node of nodes) {
    Object.values(node.outgoingEdges).forEach((outgoing) => {
      const edgeToInsert = {
        name: outgoing.name,
        source: newNode.$graph.id,
        target: outgoing.target.$graph.id,
        metadata: {},
      };
      addEdgeToGraphIfNotExists(graph, edgeToInsert);
      graph.removeEdge(outgoing.id);
    });
    Object.values(node.incomingEdges).forEach((incoming) => {
      const edgeToInsert = {
        name: incoming.name,
        source: incoming.source.$graph.id,
        target: newNode.$graph.id,
        metadata: {},
      };
      addEdgeToGraphIfNotExists(graph, edgeToInsert);
      graph.removeEdge(incoming.id);
    });
  }

  return newNode;
}

export function reduceGraphWithRules(
  rules: Record<string, ReducerRule[]>,
  graph: Graph,
) {
  const nodesByService = aggregateByService(graph.nodes);
  for (const [service, serviceRules] of Object.entries(rules)) {
    for (const rule of serviceRules) {
      const nodesToCollapse =
        nodesByService[service]?.filter((node) => applyRule(rule, node)) ?? [];

      const nodesByParent = nodesToCollapse.reduce((acc, currentVal) => {
        const nodeParent = currentVal.$graph.parent ?? "none";
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
        nodes.forEach((node) => graph.removeNode(node.$graph.id));
      }
    }
  }
}
