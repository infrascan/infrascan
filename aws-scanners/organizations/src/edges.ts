import type {
  DescribeOrganizationCommandOutput,
  ListDelegatedServicesForAccountCommandInput,
  ListDelegatedServicesForAccountCommandOutput,
  ListPoliciesCommandOutput,
  ListTargetsForPolicyCommandInput,
  ListTargetsForPolicyCommandOutput,
  PolicySummary,
} from "@aws-sdk/client-organizations";
import {
  evaluateSelectorGlobally,
  tryNormalizeDateEpoch,
} from "@infrascan/core";
import type {
  Connector,
  SelectedEdge,
  Serialized,
} from "@infrascan/shared-types";
import type { CallState } from "./state";

async function getGlobalState<O, I = unknown>(
  connector: Connector,
  functionName: string,
): Promise<Serialized<CallState<O, I>>[]> {
  return (
    (await evaluateSelectorGlobally(
      `Organizations|${functionName}|[]`,
      connector,
    )) ?? []
  );
}

/**
 * `attached` edges from each policy to the roots, OUs and accounts it is directly attached to. Inherited attachments
 * are not drawn: they follow from the containment of roots, OUs and accounts.
 */
async function getPolicyAttachmentEdges(
  connector: Connector,
): Promise<SelectedEdge[]> {
  const policies = new Map<string, Serialized<PolicySummary>>();
  for (const page of await getGlobalState<ListPoliciesCommandOutput>(
    connector,
    "ListPolicies",
  )) {
    for (const policy of page._result?.Policies ?? []) {
      if (policy.Id != null) {
        policies.set(`${page._metadata.account}|${policy.Id}`, policy);
      }
    }
  }

  const edges: SelectedEdge[] = [];
  for (const page of await getGlobalState<
    ListTargetsForPolicyCommandOutput,
    ListTargetsForPolicyCommandInput
  >(connector, "ListTargetsForPolicy")) {
    const policy = policies.get(
      `${page._metadata.account}|${page._parameters?.PolicyId}`,
    );
    if (policy?.Arn != null) {
      for (const target of page._result?.Targets ?? []) {
        // Accounts are keyed by account id, roots and OUs by ARN.
        const targetId =
          target.Type === "ACCOUNT" ? target.TargetId : target.Arn;
        if (targetId != null) {
          edges.push({
            source: policy.Arn,
            target: targetId,
            metadata: {
              label: "attached",
              policyType: policy.Type,
              targetType: target.Type,
            },
          });
        }
      }
    }
  }
  return edges;
}

/**
 * One `delegated-administrator` edge from the organization to each delegated administrator account, listing every
 * service delegated to it.
 */
async function getDelegatedAdministratorEdges(
  connector: Connector,
): Promise<SelectedEdge[]> {
  const organizationArns = new Map<string, string>();
  for (const page of await getGlobalState<DescribeOrganizationCommandOutput>(
    connector,
    "DescribeOrganization",
  )) {
    const arn = page._result?.Organization?.Arn;
    if (arn != null) {
      organizationArns.set(page._metadata.account, arn);
    }
  }

  const services = new Map<
    string,
    { source: string; target: string; services: Map<string, number | null> }
  >();
  for (const page of await getGlobalState<
    ListDelegatedServicesForAccountCommandOutput,
    ListDelegatedServicesForAccountCommandInput
  >(connector, "ListDelegatedServicesForAccount")) {
    const source = organizationArns.get(page._metadata.account);
    const target = page._parameters?.AccountId;
    if (source != null && target != null) {
      const key = `${source}|${target}`;
      const entry = services.get(key) ?? {
        source,
        target,
        services: new Map(),
      };
      for (const service of page._result?.DelegatedServices ?? []) {
        if (service.ServicePrincipal != null) {
          entry.services.set(
            service.ServicePrincipal,
            tryNormalizeDateEpoch(service.DelegationEnabledDate),
          );
        }
      }
      services.set(key, entry);
    }
  }

  return [...services.values()].map(
    ({ source, target, services: delegated }) => ({
      source,
      target,
      metadata: {
        label: "delegated-administrator",
        services: [...delegated.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([servicePrincipal, delegationEnabledAt]) => ({
            servicePrincipal,
            delegationEnabledAt,
          })),
      },
    }),
  );
}

export async function getEdges(connector: Connector): Promise<SelectedEdge[]> {
  const edges = [
    ...(await getPolicyAttachmentEdges(connector)),
    ...(await getDelegatedAdministratorEdges(connector)),
  ];
  // Several scans of the same organization report the same edges.
  const unique = new Map<string, SelectedEdge>();
  for (const edge of edges) {
    const id = `${edge.source}-${edge.target}`;
    if (!unique.has(id)) {
      unique.set(id, edge);
    }
  }
  return [...unique.values()];
}
