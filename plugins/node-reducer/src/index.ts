import type { Graph, GraphPlugin } from "@infrascan/shared-types";
import { ReducerRule, reduceGraphWithRules } from "./reducer";

export type { ReducerRule, RegexRule, GlobRule } from "./reducer";

function newNodeReducer(rules: Record<string, ReducerRule[]>) {
  return (graph: Graph) => reduceGraphWithRules(rules, graph);
}

export default function createPlugin(
  rules: ReducerRule[],
): GraphPlugin<"onGraphComplete"> {
  const preparedRules = rules.reduce((acc, rule) => {
    if (acc[rule.service] == null) {
      acc[rule.service] = [];
    }
    acc[rule.service].push(rule);
    return acc;
  }, {} as Record<string, ReducerRule[]>);
  return {
    id: "@infrascan/node-reducer-plugin",
    event: "onGraphComplete",
    handler: newNodeReducer(preparedRules),
  };
}
