import type { DetectiveClient } from "@aws-sdk/client-detective";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./client";
import {
  DescribeOrganizationConfiguration,
  ListDatasourcePackages,
  ListGraphs,
  ListInvitations,
  ListMembers,
  ListOrganizationAdminAccounts,
} from "./getters";
import { DetectiveStatusEntity } from "./graph";

const DetectiveScanner: ServiceModule<DetectiveClient, "aws"> = {
  provider: "aws",
  service: "detective",
  key: "Detective",
  getClient,
  callPerRegion: true,
  // Order matters: the per-graph getters read the graph ARNs recorded by ListGraphs.
  getters: [
    ListGraphs,
    ListMembers,
    DescribeOrganizationConfiguration,
    ListDatasourcePackages,
    ListOrganizationAdminAccounts,
    ListInvitations,
  ],
  entities: [DetectiveStatusEntity],
};

export type {
  GraphState,
  DetectiveStatusState,
  DetectiveDetails,
  DetectiveGraph,
  DetectiveMember,
  DetectiveMembership,
  ServiceStatus,
} from "./graph";
export type { CallError, CallState } from "./state";
export default DetectiveScanner;
