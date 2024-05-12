import {
  ReducerRule,
  aggregateByService,
  reduceGraphWithRules,
} from "./reducer";
export type { ReducerRule, RegexRule, GlobRule } from "./reducer";

import type { Graph, GraphPlugin } from "@infrascan/shared-types";

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
