import type { ControlTowerClient } from "@aws-sdk/client-controltower";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./client";
import {
  GetLandingZone,
  ListBaselines,
  ListEnabledBaselines,
  ListEnabledControls,
  ListLandingZones,
} from "./getters";
import { getEdges } from "./edges";
import {
  EnabledBaselineEntity,
  EnabledControlsEntity,
  LandingZoneEntity,
} from "./graph";

const ControlTowerScanner: ServiceModule<ControlTowerClient, "aws"> = {
  provider: "aws",
  service: "controltower",
  key: "ControlTower",
  getClient,
  callPerRegion: true,
  // Order matters: GetLandingZone reads the ARNs listed by ListLandingZones.
  getters: [
    ListLandingZones,
    GetLandingZone,
    ListBaselines,
    ListEnabledBaselines,
    ListEnabledControls,
  ],
  getEdges,
  entities: [LandingZoneEntity, EnabledBaselineEntity, EnabledControlsEntity],
};

export type {
  GraphState,
  StatusSummary,
  LandingZoneState,
  LandingZoneDetails,
  EnabledBaselineState,
  EnabledBaselineDetails,
  EnabledControlsState,
  EnabledControlsDetails,
  EnabledControlDetails,
} from "./graph";
export type { ManifestFacts } from "./manifest";
export type { CallError, CallState } from "./state";
export default ControlTowerScanner;
