import type {
  DescribeOrganizationCommandOutput,
  ListRootsCommandOutput,
} from "@aws-sdk/client-organizations";
import { evaluateSelectorGlobally } from "@infrascan/core";
import type { AwsContext, Connector } from "@infrascan/shared-types";
import type { CallState } from "./state";

/**
 * How the scanned account relates to the organization it reported.
 */
export type ObservedFrom = "management" | "delegated-administrator" | "member";

interface OrganizationMembership {
  organizationId: string;
  managementAccountId?: string;
}

async function getMemberships(
  connector: Connector,
): Promise<Map<string, OrganizationMembership>> {
  const states: CallState<DescribeOrganizationCommandOutput, unknown>[] =
    (await evaluateSelectorGlobally(
      "Organizations|DescribeOrganization|[]",
      connector,
    )) ?? [];
  const memberships = new Map<string, OrganizationMembership>();
  for (const state of states) {
    const organization = state._result?.Organization;
    if (organization?.Id != null) {
      memberships.set(state._metadata.account, {
        organizationId: organization.Id,
        managementAccountId: organization.MasterAccountId,
      });
    }
  }
  return memberships;
}

async function getListingAccounts(connector: Connector): Promise<Set<string>> {
  const states: CallState<ListRootsCommandOutput, unknown>[] =
    (await evaluateSelectorGlobally("Organizations|ListRoots|[]", connector)) ??
    [];
  return new Set(
    states
      .filter((state) => state._result?.Roots != null)
      .map((state) => state._metadata.account),
  );
}

/**
 * Several scans can report the same organization: every member can describe it, and the management account and a
 * delegated administrator can list it. Exactly one scan emits each node so the graph does not depend on the order
 * scans are inserted in. Preference: the management account, then an account that can list the organization, then the
 * lowest account id.
 *
 * @param requireListing Only accounts that could list the organization (`ListRoots` succeeded) are candidates.
 */
export async function isReporter(
  connector: Connector,
  context: AwsContext,
  requireListing: boolean,
): Promise<boolean> {
  const memberships = await getMemberships(connector);
  const listingAccounts = await getListingAccounts(connector);
  if (requireListing && !listingAccounts.has(context.account)) {
    return false;
  }
  const own = memberships.get(context.account);
  if (own == null) {
    return true;
  }
  const candidates = [...memberships.entries()]
    .filter(
      ([account, membership]) =>
        membership.organizationId === own.organizationId &&
        (!requireListing || listingAccounts.has(account)),
    )
    .map(([account]) => account);
  const rank = (account: string) => {
    if (account === own.managementAccountId) {
      return 0;
    }
    return listingAccounts.has(account) ? 1 : 2;
  };
  candidates.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  return candidates[0] === context.account;
}

export async function getObservedFrom(
  connector: Connector,
  context: AwsContext,
): Promise<ObservedFrom> {
  const memberships = await getMemberships(connector);
  if (
    memberships.get(context.account)?.managementAccountId === context.account
  ) {
    return "management";
  }
  const listingAccounts = await getListingAccounts(connector);
  return listingAccounts.has(context.account)
    ? "delegated-administrator"
    : "member";
}

export interface ParsedArn {
  partition: string;
  account: string;
  organizationId?: string;
}

/**
 * Parses an Organizations ARN, e.g. `arn:aws:organizations::111111111111:ou/o-abc/ou-ab12-xyz`. AWS managed policies
 * use `aws` as the account and carry no organization id.
 */
export function parseArn(arn: string): ParsedArn {
  const [, partition, , , account, ...rest] = arn.split(":");
  const segments = rest.join(":").split("/");
  const organizationId = segments.find((segment) => segment.startsWith("o-"));
  return { partition, account, organizationId };
}

export function organizationArn(arn: string): string | undefined {
  const { partition, account, organizationId } = parseArn(arn);
  if (organizationId == null || account === "aws") {
    return undefined;
  }
  return `arn:${partition}:organizations::${account}:organization/${organizationId}`;
}
