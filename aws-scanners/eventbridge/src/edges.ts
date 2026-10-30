import type {
  DescribeEventBusCommandOutput,
  ListEventBusesCommandOutput,
  ListRulesCommandInput,
  ListRulesCommandOutput,
  ListTargetsByRuleCommandInput,
  ListTargetsByRuleCommandOutput,
} from "@aws-sdk/client-eventbridge";
import { evaluateSelectorGlobally, formatEdge } from "@infrascan/core";
import type { Connector, SelectedEdge, State } from "@infrascan/shared-types";
import debug from "debug";

const edgesDebug = debug("eventbridge:edges");

/**
 * Lambda nodes are keyed by the unqualified function ARN, but rules often
 * target an alias or version (`...:function:name:alias`). Point those edges at
 * the function itself so they land on a node.
 */
export function normalizeTargetArn(arn: string): string {
  const parts = arn.split(":");
  if (parts[2] === "lambda" && parts[5] === "function" && parts.length > 7) {
    return parts.slice(0, 7).join(":");
  }
  return arn;
}

function busKey(account: string, region: string, name: string): string {
  return `${account}|${region}|${name}`;
}

export async function getEdges(
  stateConnector: Connector,
): Promise<SelectedEdge[]> {
  edgesDebug("Fetching edges");
  const edges: SelectedEdge[] = [];

  // Rules reference their bus by name, so resolve names to ARNs per account and region
  const busesState: State<ListEventBusesCommandOutput>[] =
    await evaluateSelectorGlobally(
      "EventBridge|ListEventBuses|[]",
      stateConnector,
    );
  const busArns = new Map<string, string>();
  for (const page of busesState) {
    for (const bus of page._result.EventBuses ?? []) {
      if (bus.Name != null && bus.Arn != null) {
        busArns.set(
          busKey(page._metadata.account, page._metadata.region, bus.Name),
          bus.Arn,
        );
      }
    }
  }

  const rulesState: State<ListRulesCommandOutput, ListRulesCommandInput>[] =
    await evaluateSelectorGlobally("EventBridge|ListRules|[]", stateConnector);
  const ruleArns = new Map<string, string>();
  for (const page of rulesState) {
    const { account, region } = page._metadata;
    for (const rule of page._result.Rules ?? []) {
      const busName = rule.EventBusName ?? page._parameters?.EventBusName;
      if (rule.Arn != null && rule.Name != null && busName != null) {
        ruleArns.set(
          `${busKey(account, region, busName)}|${rule.Name}`,
          rule.Arn,
        );
        const busArn = busName.startsWith("arn:")
          ? busName
          : busArns.get(busKey(account, region, busName));
        if (busArn != null) {
          edges.push(formatEdge(busArn, { target: rule.Arn, name: rule.Name }));
        }
      }
    }
  }
  edgesDebug(`Found ${edges.length} bus to rule edges`);

  const targetsState: State<
    ListTargetsByRuleCommandOutput,
    ListTargetsByRuleCommandInput
  >[] = await evaluateSelectorGlobally(
    "EventBridge|ListTargetsByRule|[]",
    stateConnector,
  );
  for (const page of targetsState) {
    const { account, region } = page._metadata;
    const busName = page._parameters?.EventBusName ?? "default";
    const ruleArn = ruleArns.get(
      `${busKey(account, region, busName)}|${page._parameters?.Rule}`,
    );
    // Targets of a rule that wasn't recorded have no source node to attach to
    if (ruleArn != null) {
      for (const target of page._result.Targets ?? []) {
        if (target.Arn != null) {
          edges.push(
            formatEdge(ruleArn, {
              target: normalizeTargetArn(target.Arn),
              name: target.Id ?? target.Arn,
            }),
          );
        }
        if (target.DeadLetterConfig?.Arn != null) {
          edges.push(
            formatEdge(ruleArn, {
              target: target.DeadLetterConfig.Arn,
              name: `${target.Id ?? "Target"} Deadletter Queue`,
            }),
          );
        }
      }
    }
  }

  const describeBusState: State<DescribeEventBusCommandOutput>[] =
    await evaluateSelectorGlobally(
      "EventBridge|DescribeEventBus|[]",
      stateConnector,
    );
  for (const { _result: bus } of describeBusState) {
    if (bus.Arn != null && bus.DeadLetterConfig?.Arn != null) {
      edges.push(
        formatEdge(bus.Arn, {
          target: bus.DeadLetterConfig.Arn,
          name: `${bus.Name ?? bus.Arn} Deadletter Queue`,
        }),
      );
    }
  }

  edgesDebug(`Found ${edges.length} edges`);
  return edges;
}
