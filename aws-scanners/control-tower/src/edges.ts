import type {
  GetLandingZoneCommandInput,
  GetLandingZoneCommandOutput,
  ListEnabledBaselinesCommandOutput,
  ListEnabledControlsCommandOutput,
} from "@aws-sdk/client-controltower";
import { evaluateSelectorGlobally } from "@infrascan/core";
import type {
  Connector,
  SelectedEdge,
  Serialized,
} from "@infrascan/shared-types";
import { targetNodeId } from "./arn";
import { enabledControlsNodeId } from "./graph";
import { extractManifest } from "./manifest";
import type { CallState } from "./state";

async function getGlobalState<O, I = unknown>(
  connector: Connector,
  functionName: string,
): Promise<Serialized<CallState<O, I>>[]> {
  return (
    (await evaluateSelectorGlobally(
      `ControlTower|${functionName}|[]`,
      connector,
    )) ?? []
  );
}

const ACCOUNT_ID = /^\d{12}$/;

/**
 * `log-archive` and `audit` edges from each landing zone to the accounts its manifest names.
 */
async function getLandingZoneEdges(
  connector: Connector,
): Promise<SelectedEdge[]> {
  const edges: SelectedEdge[] = [];
  for (const page of await getGlobalState<
    GetLandingZoneCommandOutput,
    GetLandingZoneCommandInput
  >(connector, "GetLandingZone")) {
    const landingZone = page._result?.landingZone;
    const source = landingZone?.arn ?? page._parameters?.landingZoneIdentifier;
    if (landingZone != null && source != null) {
      const facts = extractManifest(landingZone.manifest);
      const roles: [string, string | undefined][] = [
        ["log-archive", facts.logArchiveAccountId],
        ["audit", facts.auditAccountId],
      ];
      for (const [label, target] of roles) {
        if (target != null && ACCOUNT_ID.test(target)) {
          edges.push({ source, target, metadata: { label } });
        }
      }
    }
  }
  return edges;
}

/**
 * `enabled-on` edges from each enabled baseline, and from each target's enabled-controls node, to the OU or account
 * targeted.
 */
async function getEnabledOnEdges(
  connector: Connector,
): Promise<SelectedEdge[]> {
  const edges: SelectedEdge[] = [];
  for (const page of await getGlobalState<ListEnabledBaselinesCommandOutput>(
    connector,
    "ListEnabledBaselines",
  )) {
    for (const enabledBaseline of page._result?.enabledBaselines ?? []) {
      const target = targetNodeId(enabledBaseline.targetIdentifier);
      if (enabledBaseline.arn != null && target != null) {
        edges.push({
          source: enabledBaseline.arn,
          target,
          metadata: {
            label: "enabled-on",
            baselineIdentifier: enabledBaseline.baselineIdentifier,
            targetIdentifier: enabledBaseline.targetIdentifier,
          },
        });
      }
    }
  }
  for (const page of await getGlobalState<ListEnabledControlsCommandOutput>(
    connector,
    "ListEnabledControls",
  )) {
    for (const control of page._result?.enabledControls ?? []) {
      const target = targetNodeId(control.targetIdentifier);
      if (control.targetIdentifier != null && target != null) {
        edges.push({
          source: enabledControlsNodeId(control.targetIdentifier),
          target,
          metadata: {
            label: "enabled-on",
            targetIdentifier: control.targetIdentifier,
          },
        });
      }
    }
  }
  return edges;
}

export async function getEdges(connector: Connector): Promise<SelectedEdge[]> {
  const edges = [
    ...(await getLandingZoneEdges(connector)),
    ...(await getEnabledOnEdges(connector)),
  ];
  // The graph allows one edge per pair. A landing zone whose log archive and audit accounts are the same account gets
  // one edge carrying both roles.
  const unique = new Map<string, SelectedEdge>();
  for (const edge of edges) {
    const id = `${edge.source}-${edge.target}`;
    const existing = unique.get(id);
    if (existing == null) {
      unique.set(id, edge);
    } else if (existing.metadata?.label !== edge.metadata?.label) {
      const roles = new Set([
        ...((existing.metadata?.roles as string[] | undefined) ?? [
          existing.metadata?.label as string,
        ]),
        edge.metadata?.label as string,
      ]);
      existing.metadata = { ...existing.metadata, roles: [...roles] };
    }
  }
  return [...unique.values()];
}
