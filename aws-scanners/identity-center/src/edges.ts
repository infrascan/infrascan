import type {
  ListAccountsForProvisionedPermissionSetCommandInput,
  ListAccountsForProvisionedPermissionSetCommandOutput,
} from "@aws-sdk/client-sso-admin";
import { evaluateSelectorGlobally } from "@infrascan/core";
import type {
  Connector,
  SelectedEdge,
  Serialized,
} from "@infrascan/shared-types";
import type { CallState } from "./state";

const ACCOUNT_ID = /^\d{12}$/;

/**
 * One `provisioned-to` edge from each permission set to each account it is provisioned to.
 */
export async function getEdges(connector: Connector): Promise<SelectedEdge[]> {
  const pages: Serialized<
    CallState<
      ListAccountsForProvisionedPermissionSetCommandOutput,
      ListAccountsForProvisionedPermissionSetCommandInput
    >
  >[] =
    (await evaluateSelectorGlobally(
      "SSOAdmin|ListAccountsForProvisionedPermissionSet|[]",
      connector,
    )) ?? [];
  const edges = new Map<string, SelectedEdge>();
  for (const page of pages) {
    const source = page._parameters?.PermissionSetArn;
    for (const target of page._result?.AccountIds ?? []) {
      const key = `${source}-${target}`;
      if (source != null && ACCOUNT_ID.test(target) && !edges.has(key)) {
        edges.set(key, {
          source,
          target,
          metadata: { label: "provisioned-to" },
        });
      }
    }
  }
  return [...edges.values()];
}
