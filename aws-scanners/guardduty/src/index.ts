import type { GuardDutyClient } from "@aws-sdk/client-guardduty";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./client";
import {
  DescribeOrganizationConfiguration,
  DescribePublishingDestination,
  GetAdministratorAccount,
  GetDetector,
  ListDetectors,
  ListMembers,
  ListOrganizationAdminAccounts,
  ListPublishingDestinations,
} from "./getters";
import { GuardDutyStatusEntity } from "./graph";

const GuardDutyScanner: ServiceModule<GuardDutyClient, "aws"> = {
  provider: "aws",
  service: "guardduty",
  key: "GuardDuty",
  getClient,
  callPerRegion: true,
  // Order matters: later getters read the detector ids and destinations recorded by earlier ones.
  getters: [
    ListDetectors,
    GetDetector,
    GetAdministratorAccount,
    DescribeOrganizationConfiguration,
    ListMembers,
    ListPublishingDestinations,
    DescribePublishingDestination,
    ListOrganizationAdminAccounts,
  ],
  entities: [GuardDutyStatusEntity],
};

export type {
  GraphState,
  GuardDutyStatusState,
  GuardDutyDetails,
  GuardDutyFeature,
  GuardDutyMember,
  GuardDutyOrganizationConfiguration,
  GuardDutyPublishingDestination,
  ServiceStatus,
} from "./graph";
export type { CallError, CallState } from "./state";
export default GuardDutyScanner;
