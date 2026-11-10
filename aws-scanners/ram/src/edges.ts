import type { ListPrincipalsCommandOutput } from "@aws-sdk/client-ram";
import { evaluateSelectorGlobally } from "@infrascan/core";
import type {
  Connector,
  SelectedEdge,
  Serialized,
} from "@infrascan/shared-types";
import type { CallState } from "./state";

const ACCOUNT_ID = /^\d{12}$/;
/**
 * Organization and OU ARNs, e.g. `arn:aws:organizations::111111111111:ou/o-abc/ou-ab12-xyz`, which key the
 * Organizations scanner's nodes.
 */
const ORGANIZATIONS_ARN =
  /^arn:[^:]+:organizations::\d{12}:(organization|ou)\//;

/**
 * One `shared-with` edge from each owned share to each principal that is an account, organization or OU. IAM roles,
 * users and service principals stay facts on the share node.
 */
export async function getEdges(connector: Connector): Promise<SelectedEdge[]> {
  const pages: Serialized<CallState<ListPrincipalsCommandOutput, unknown>>[] =
    (await evaluateSelectorGlobally("RAM|ListPrincipals|[]", connector)) ?? [];
  const edges = new Map<string, SelectedEdge>();
  for (const page of pages) {
    for (const principal of page._result?.principals ?? []) {
      const source = principal.resourceShareArn;
      const target = principal.id;
      if (
        source != null &&
        target != null &&
        (ACCOUNT_ID.test(target) || ORGANIZATIONS_ARN.test(target))
      ) {
        const key = `${source}-${target}`;
        if (!edges.has(key)) {
          edges.set(key, {
            source,
            target,
            metadata: { label: "shared-with", external: principal.external },
          });
        }
      }
    }
  }
  return [...edges.values()];
}
