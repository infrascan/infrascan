import type {
  GetPolicyCommandInput,
  GetPolicyCommandOutput,
} from "@aws-sdk/client-fms";
import { evaluateSelectorGlobally } from "@infrascan/core";
import type {
  Connector,
  SelectedEdge,
  Serialized,
} from "@infrascan/shared-types";
import type { CallState } from "./state";

const ACCOUNT_ID = /^\d{12}$/;

/**
 * `includes` and `excludes` edges from each policy to the accounts named in its `IncludeMap` and `ExcludeMap`. OU ids
 * stay facts on the policy node, as OU nodes are keyed by ARN.
 */
export async function getEdges(connector: Connector): Promise<SelectedEdge[]> {
  const pages: Serialized<
    CallState<GetPolicyCommandOutput, GetPolicyCommandInput>
  >[] = (await evaluateSelectorGlobally("FMS|GetPolicy|[]", connector)) ?? [];
  const edges = new Map<string, SelectedEdge>();
  for (const page of pages) {
    const source = page._result?.PolicyArn;
    const policy = page._result?.Policy;
    if (source != null && policy != null) {
      const targets: [string, string[]][] = [
        ["includes", policy.IncludeMap?.ACCOUNT ?? []],
        ["excludes", policy.ExcludeMap?.ACCOUNT ?? []],
      ];
      for (const [label, accounts] of targets) {
        for (const target of accounts) {
          const key = `${source}-${target}`;
          // One edge per pair: an account named in both maps keeps its `includes` edge; both maps are on the node.
          if (ACCOUNT_ID.test(target) && !edges.has(key)) {
            edges.set(key, { source, target, metadata: { label } });
          }
        }
      }
    }
  }
  return [...edges.values()];
}
