import type { SecurityLakeClient } from "@aws-sdk/client-securitylake";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./client";
import {
  GetDataLakeOrganizationConfiguration,
  ListDataLakes,
  ListLogSources,
  ListSubscribers,
} from "./getters";
import { SecurityLakeStatusEntity } from "./graph";

const SecurityLakeScanner: ServiceModule<SecurityLakeClient, "aws"> = {
  provider: "aws",
  service: "securitylake",
  key: "SecurityLake",
  getClient,
  callPerRegion: true,
  // Order matters: the later getters only run where ListDataLakes found a data lake in the region.
  getters: [
    ListDataLakes,
    ListLogSources,
    GetDataLakeOrganizationConfiguration,
    ListSubscribers,
  ],
  entities: [SecurityLakeStatusEntity],
};

export type {
  GraphState,
  SecurityLakeStatusState,
  SecurityLakeDetails,
  SecurityLakeDataLake,
  SecurityLakeSource,
  SecurityLakeSubscriber,
  ServiceStatus,
} from "./graph";
export type { CallError, CallState } from "./state";
export default SecurityLakeScanner;
