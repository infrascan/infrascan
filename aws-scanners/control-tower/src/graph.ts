import type {
  EnabledBaselineSummary,
  EnabledControlSummary,
  GetLandingZoneCommandInput,
  GetLandingZoneCommandOutput,
  LandingZoneDetail,
  ListBaselinesCommandOutput,
  ListEnabledBaselinesCommandOutput,
  ListEnabledControlsCommandOutput,
} from "@aws-sdk/client-controltower";
import { evaluateSelector } from "@infrascan/core";
import type {
  AwsContext,
  BaseState,
  CommandCallMetadata,
  Connector,
  Serialized,
  TranslatedEntity,
} from "@infrascan/shared-types";
import { isOwnedHere } from "./arn";
import { extractManifest, type ManifestFacts } from "./manifest";
import type { CallState } from "./state";

async function getOwnState<O, I = unknown>(
  connector: Connector,
  context: AwsContext,
  functionName: string,
): Promise<Serialized<CallState<O, I>>[]> {
  const state = await evaluateSelector<Serialized<CallState<O, I>>>(
    context.account,
    context.region,
    `ControlTower|${functionName}|[]`,
    connector,
  );
  return state ?? [];
}

interface Item {
  $metadata: CommandCallMetadata;
}

function metadata(version: string) {
  return (val: Item) => ({ version, timestamp: val.$metadata.timestamp });
}

function source(command: string) {
  return () => ({ command });
}

function tenant(val: Item) {
  return {
    provider: "aws",
    partition: val.$metadata.partition,
    tenantId: val.$metadata.account,
  };
}

function location(val: Item) {
  return { code: val.$metadata.region };
}

/**
 * Status and drift summaries are kept as AWS returned them, so new drift types are not lost.
 */
export interface StatusSummary {
  status?: string;
  lastOperationIdentifier?: string;
}

/* -------------------------------------------------------------------------- */
/*                                Landing zone                                */
/* -------------------------------------------------------------------------- */

export interface LandingZoneDetails extends ManifestFacts {
  arn?: string;
  version?: string;
  latestAvailableVersion?: string;
  status?: string;
  /** AWS's drift status string, verbatim */
  driftStatus?: string;
  remediationTypes?: string[];
  /** The landing zone manifest, as returned */
  manifest?: unknown;
}

export type LandingZoneState = BaseState & {
  controltower: { landingZone: LandingZoneDetails };
};

interface LandingZoneItem extends Item {
  arn: string;
  landingZone: Serialized<LandingZoneDetail>;
}

export const LandingZoneEntity: TranslatedEntity<
  LandingZoneState,
  LandingZoneItem,
  LandingZoneItem
> = {
  version: "0.1.0",
  debugLabel: "controltower-landing-zone",
  provider: "aws",
  command: "GetLandingZone",
  category: "controltower",
  subcategory: "landing-zone",
  nodeType: "controltower-landing-zone",
  selector: "ControlTower|GetLandingZone|[]",

  async getState(connector, context) {
    const pages = await getOwnState<
      GetLandingZoneCommandOutput,
      GetLandingZoneCommandInput
    >(connector, context, "GetLandingZone");
    const seen = new Set<string>();
    return pages.flatMap((page) => {
      const landingZone = page._result?.landingZone;
      const arn = landingZone?.arn ?? page._parameters?.landingZoneIdentifier;
      if (
        landingZone == null ||
        arn == null ||
        seen.has(arn) ||
        !isOwnedHere(arn, context)
      ) {
        return [];
      }
      seen.add(arn);
      return [{ $metadata: page._metadata, arn, landingZone }];
    });
  },

  translate(val) {
    return [val];
  },

  components: {
    $metadata: metadata("0.1.0"),
    $source: source("GetLandingZone"),
    $graph(val) {
      return {
        id: val.arn,
        label: `Landing zone ${val.landingZone.version ?? ""}`.trim(),
        nodeClass: "informational",
        nodeType: LandingZoneEntity.nodeType,
        parent: val.$metadata.account,
      };
    },
    tenant,
    location,
    resource(val) {
      return {
        id: val.arn,
        name: `Landing zone ${val.landingZone.version ?? ""}`.trim(),
        category: LandingZoneEntity.category,
        subcategory: LandingZoneEntity.subcategory,
      };
    },
    controltower(val) {
      const { landingZone } = val;
      return {
        landingZone: {
          arn: val.arn,
          version: landingZone.version,
          latestAvailableVersion: landingZone.latestAvailableVersion,
          status: landingZone.status,
          driftStatus: landingZone.driftStatus?.status,
          remediationTypes: landingZone.remediationTypes,
          ...extractManifest(landingZone.manifest),
          manifest: landingZone.manifest,
        },
      };
    },
  },
};

/* -------------------------------------------------------------------------- */
/*                              Enabled baselines                             */
/* -------------------------------------------------------------------------- */

export interface EnabledBaselineDetails {
  arn?: string;
  baselineIdentifier?: string;
  /** From `ListBaselines`, for labelling */
  baselineName?: string;
  baselineDescription?: string;
  baselineVersion?: string;
  targetIdentifier?: string;
  parentIdentifier?: string;
  statusSummary?: StatusSummary;
  /** As returned, e.g. `{ types: { inheritance: { status: "IN_SYNC" } } }` */
  driftStatusSummary?: unknown;
}

export type EnabledBaselineState = BaseState & {
  controltower: { enabledBaseline: EnabledBaselineDetails };
};

interface EnabledBaselineItem extends Item {
  enabledBaseline: Serialized<EnabledBaselineSummary>;
  baselineName?: string;
  baselineDescription?: string;
}

/**
 * Baseline names and descriptions keyed by baseline ARN.
 */
async function getBaselines(
  connector: Connector,
  context: AwsContext,
): Promise<Map<string, { name?: string; description?: string }>> {
  const baselines = new Map<string, { name?: string; description?: string }>();
  for (const page of await getOwnState<ListBaselinesCommandOutput>(
    connector,
    context,
    "ListBaselines",
  )) {
    for (const baseline of page._result?.baselines ?? []) {
      if (baseline.arn != null) {
        baselines.set(baseline.arn, {
          name: baseline.name,
          description: baseline.description,
        });
      }
    }
  }
  return baselines;
}

export const EnabledBaselineEntity: TranslatedEntity<
  EnabledBaselineState,
  EnabledBaselineItem,
  EnabledBaselineItem
> = {
  version: "0.1.0",
  debugLabel: "controltower-enabled-baseline",
  provider: "aws",
  command: "ListEnabledBaselines",
  category: "controltower",
  subcategory: "enabled-baseline",
  nodeType: "controltower-enabled-baseline",
  selector: "ControlTower|ListEnabledBaselines|[]",

  async getState(connector, context) {
    const baselines = await getBaselines(connector, context);
    const pages = await getOwnState<ListEnabledBaselinesCommandOutput>(
      connector,
      context,
      "ListEnabledBaselines",
    );
    const seen = new Set<string>();
    return pages.flatMap((page) =>
      (page._result?.enabledBaselines ?? [])
        .filter(({ arn }) => {
          if (arn == null || seen.has(arn) || !isOwnedHere(arn, context)) {
            return false;
          }
          seen.add(arn);
          return true;
        })
        .map((enabledBaseline) => {
          const baseline = baselines.get(
            enabledBaseline.baselineIdentifier ?? "",
          );
          return {
            $metadata: page._metadata,
            enabledBaseline,
            baselineName: baseline?.name,
            baselineDescription: baseline?.description,
          };
        }),
    );
  },

  translate(val) {
    return [val];
  },

  components: {
    $metadata: metadata("0.1.0"),
    $source: source("ListEnabledBaselines"),
    $graph(val) {
      return {
        id: val.enabledBaseline.arn!,
        label: val.baselineName ?? val.enabledBaseline.arn!,
        nodeClass: "informational",
        nodeType: EnabledBaselineEntity.nodeType,
        parent: val.$metadata.account,
      };
    },
    tenant,
    location,
    resource(val) {
      return {
        id: val.enabledBaseline.arn!,
        name: val.baselineName ?? val.enabledBaseline.arn!,
        category: EnabledBaselineEntity.category,
        subcategory: EnabledBaselineEntity.subcategory,
        description: val.baselineDescription,
      };
    },
    controltower(val) {
      const { enabledBaseline } = val;
      return {
        enabledBaseline: {
          arn: enabledBaseline.arn,
          baselineIdentifier: enabledBaseline.baselineIdentifier,
          baselineName: val.baselineName,
          baselineDescription: val.baselineDescription,
          baselineVersion: enabledBaseline.baselineVersion,
          targetIdentifier: enabledBaseline.targetIdentifier,
          parentIdentifier: enabledBaseline.parentIdentifier,
          statusSummary: enabledBaseline.statusSummary,
          driftStatusSummary: enabledBaseline.driftStatusSummary,
        },
      };
    },
  },
};

/* -------------------------------------------------------------------------- */
/*                              Enabled controls                              */
/* -------------------------------------------------------------------------- */

export interface EnabledControlDetails {
  arn?: string;
  controlIdentifier?: string;
  parentIdentifier?: string;
  statusSummary?: StatusSummary;
  /** As returned, e.g. `{ driftStatus: "IN_SYNC", types: { ... } }` */
  driftStatusSummary?: unknown;
}

export interface EnabledControlsDetails {
  targetIdentifier: string;
  controls: EnabledControlDetails[];
}

export type EnabledControlsState = BaseState & {
  controltower: { enabledControls: EnabledControlsDetails };
};

interface EnabledControlsItem extends Item {
  targetIdentifier: string;
  controls: Serialized<EnabledControlSummary>[];
}

export function enabledControlsNodeId(targetIdentifier: string): string {
  return `${targetIdentifier}#controltower-enabled-controls`;
}

/**
 * Enabled controls can number in the thousands, so they are grouped into one node per target.
 */
export const EnabledControlsEntity: TranslatedEntity<
  EnabledControlsState,
  EnabledControlsItem,
  EnabledControlsItem
> = {
  version: "0.1.0",
  debugLabel: "controltower-enabled-controls",
  provider: "aws",
  command: "ListEnabledControls",
  category: "controltower",
  subcategory: "enabled-controls",
  nodeType: "controltower-enabled-controls",
  selector: "ControlTower|ListEnabledControls|[]",

  async getState(connector, context) {
    const pages = await getOwnState<ListEnabledControlsCommandOutput>(
      connector,
      context,
      "ListEnabledControls",
    );
    const byTarget = new Map<string, EnabledControlsItem>();
    const seen = new Set<string>();
    for (const page of pages) {
      for (const control of page._result?.enabledControls ?? []) {
        const target = control.targetIdentifier;
        const key = control.arn ?? `${target}|${control.controlIdentifier}`;
        if (
          target != null &&
          !seen.has(key) &&
          isOwnedHere(control.arn, context)
        ) {
          seen.add(key);
          const item = byTarget.get(target) ?? {
            $metadata: page._metadata,
            targetIdentifier: target,
            controls: [],
          };
          item.controls.push(control);
          byTarget.set(target, item);
        }
      }
    }
    return [...byTarget.values()];
  },

  translate(val) {
    return [val];
  },

  components: {
    $metadata: metadata("0.1.0"),
    $source: source("ListEnabledControls"),
    $graph(val) {
      return {
        id: enabledControlsNodeId(val.targetIdentifier),
        label: `Enabled controls on ${val.targetIdentifier.split("/").pop()}`,
        nodeClass: "informational",
        nodeType: EnabledControlsEntity.nodeType,
        parent: val.$metadata.account,
      };
    },
    tenant,
    location,
    resource(val) {
      return {
        id: enabledControlsNodeId(val.targetIdentifier),
        name: `Enabled controls on ${val.targetIdentifier.split("/").pop()}`,
        category: EnabledControlsEntity.category,
        subcategory: EnabledControlsEntity.subcategory,
      };
    },
    controltower(val) {
      return {
        enabledControls: {
          targetIdentifier: val.targetIdentifier,
          controls: val.controls.map((control) => ({
            arn: control.arn,
            controlIdentifier: control.controlIdentifier,
            parentIdentifier: control.parentIdentifier,
            statusSummary: control.statusSummary,
            driftStatusSummary: control.driftStatusSummary,
          })),
        },
      };
    },
  },
};

export type GraphState =
  | LandingZoneState
  | EnabledBaselineState
  | EnabledControlsState;
