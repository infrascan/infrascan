import type { FMSClient } from "@aws-sdk/client-fms";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./client";
import {
  GetAdminAccount,
  GetAdminScope,
  GetPolicy,
  ListAdminAccountsForOrganization,
  ListAdminsManagingAccount,
  ListPolicies,
} from "./getters";
import { getEdges } from "./edges";
import { PolicyEntity, StatusEntity } from "./graph";

const FirewallManagerScanner: ServiceModule<FMSClient, "aws"> = {
  provider: "aws",
  service: "fms",
  key: "FMS",
  getClient,
  callPerRegion: true,
  // Order matters: `GetAdminScope` and `GetPolicy` read the ids recorded by the listings before them.
  getters: [
    GetAdminAccount,
    ListAdminAccountsForOrganization,
    ListAdminsManagingAccount,
    GetAdminScope,
    ListPolicies,
    GetPolicy,
  ],
  getEdges,
  entities: [StatusEntity, PolicyEntity],
};

export type {
  GraphState,
  ServiceStatus,
  StatusState,
  FmsStatusDetails,
  OrganizationAdminDetails,
  AdminScopeDetails,
  PolicyState,
  PolicyDetails,
  PolicyScopeMap,
} from "./graph";
export type { CallError, CallState } from "./state";
export default FirewallManagerScanner;
