import { evaluateSelector } from "@infrascan/core";
import type { AwsContext, Connector } from "@infrascan/shared-types";

/**
 * Where a node for a resource that several scans can report is placed.
 *
 * - `owner`: this scan is of the account and region that own the resource, so the node sits under that region's node.
 * - `observer`: the owning account and region reported nothing in this state (not scanned, or the call failed), so the
 *   node is emitted as a root node with the owner as its tenant. Every observing scan produces the same placement, so
 *   the node does not depend on which scan is inserted into the graph first.
 *
 * A resource with no entry is skipped by this scan: the owner's scan emits it.
 */
export type Placement = "owner" | "observer";

export type Placements = Record<string, Placement>;

export interface OwnerScope {
  /**
   * The AWS account that owns the resource, taken from the resource's own owner field. Undefined when the owner is not
   * known or is not an account, in which case the node is always placed as an observer.
   */
  account?: string;
  /**
   * The region the owner reports the resource in. Defaults to the scanned region.
   */
  region?: string;
}

export interface PlacementOptions<T> {
  getId: (item: T) => string | undefined;
  getOwner: (item: T) => OwnerScope;
  /**
   * Selects the same kind of item from the owner's state, e.g. `EC2|DescribeTransitGateways|[]._result.TransitGateways[]`
   */
  ownerItemsSelector: string;
}

/**
 * Decide which scan emits each item, so that a resource reported by several scanned accounts or regions (RAM shared,
 * cross-account or cross-region) maps to exactly one node with a deterministic tenant and parent.
 */
export async function resolvePlacements<T>(
  connector: Connector,
  context: AwsContext,
  items: T[],
  { getId, getOwner, ownerItemsSelector }: PlacementOptions<T>,
): Promise<Placements> {
  const ownerStateIds = new Map<string, Promise<Set<string>>>();

  function idsReportedBy(account: string, region: string) {
    const key = `${account}|${region}`;
    let ids = ownerStateIds.get(key);
    if (ids == null) {
      ids = evaluateSelector<T>(account, region, ownerItemsSelector, connector)
        .then(
          (ownerItems) =>
            new Set(
              (ownerItems ?? [])
                .map((ownerItem) => getId(ownerItem))
                .filter((id): id is string => id != null),
            ),
        )
        .catch(() => new Set<string>());
      ownerStateIds.set(key, ids);
    }
    return ids;
  }

  const placements: Placements = {};
  for (const item of items) {
    const id = getId(item);
    if (id != null) {
      const owner = getOwner(item);
      const ownerRegion = owner.region ?? context.region;
      if (owner.account == null) {
        placements[id] = "observer";
      } else if (
        owner.account === context.account &&
        ownerRegion === context.region
      ) {
        placements[id] = "owner";
      } else {
        const reportedByOwner = await idsReportedBy(owner.account, ownerRegion);
        if (!reportedByOwner.has(id)) {
          placements[id] = "observer";
        }
      }
    }
  }
  return placements;
}

/**
 * The parent for a node placed by {@link resolvePlacements}: the scanned region for the owner, none for an observer.
 * Without placements (state not resolved through getState) the scanned region is used, as before.
 */
export function placedParent(
  placement: Placement | undefined,
  metadata: { account: string; region: string },
): string | undefined {
  return placement === "observer"
    ? undefined
    : `${metadata.account}-${metadata.region}`;
}

/**
 * Whether an item survives placement: items without an entry are emitted by their owner's scan instead.
 */
export function isPlaced(
  placements: Placements | undefined,
  id: string | undefined,
): boolean {
  return placements == null || (id != null && placements[id] != null);
}
