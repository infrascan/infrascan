import type { CloudTrailClient } from "@aws-sdk/client-cloudtrail";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./client";
import {
  DescribeTrails,
  GetEventDataStore,
  GetEventSelectors,
  GetTrailStatus,
  ListEventDataStores,
} from "./getters";
import { EventDataStoreEntity, StatusEntity, TrailEntity } from "./graph";

const CloudTrailScanner: ServiceModule<CloudTrailClient, "aws"> = {
  provider: "aws",
  service: "cloudtrail",
  key: "CloudTrail",
  getClient,
  callPerRegion: true,
  // Order matters: trail status and selectors read the trails from DescribeTrails, and GetEventDataStore reads the
  // stores from ListEventDataStores.
  getters: [
    DescribeTrails,
    GetTrailStatus,
    GetEventSelectors,
    ListEventDataStores,
    GetEventDataStore,
  ],
  entities: [StatusEntity, TrailEntity, EventDataStoreEntity],
};

export type {
  GraphState,
  ServiceStatus,
  StatusState,
  CloudTrailStatusDetails,
  VisibleTrail,
  VisibleEventDataStore,
  TrailState,
  TrailDetails,
  EventSelectorSummary,
  EventDataStoreState,
  EventDataStoreDetails,
} from "./graph";
export type { CallError, CallState } from "./state";
export default CloudTrailScanner;
