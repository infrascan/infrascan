import type { SSOAdminClient } from "@aws-sdk/client-sso-admin";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./client";
import {
  DescribePermissionSet,
  ListAccountsForProvisionedPermissionSet,
  ListCustomerManagedPolicyReferencesInPermissionSet,
  ListInstances,
  ListManagedPoliciesInPermissionSet,
  ListPermissionSets,
} from "./getters";
import { getEdges } from "./edges";
import { InstanceEntity, PermissionSetEntity, StatusEntity } from "./graph";

const IdentityCenterScanner: ServiceModule<SSOAdminClient, "aws"> = {
  provider: "aws",
  service: "identitycenter",
  key: "SSOAdmin",
  getClient,
  callPerRegion: true,
  // Order matters: permission sets are listed per instance, then read per permission set.
  getters: [
    ListInstances,
    ListPermissionSets,
    DescribePermissionSet,
    ListManagedPoliciesInPermissionSet,
    ListCustomerManagedPolicyReferencesInPermissionSet,
    ListAccountsForProvisionedPermissionSet,
  ],
  getEdges,
  entities: [StatusEntity, InstanceEntity, PermissionSetEntity],
};

export type {
  GraphState,
  ServiceStatus,
  StatusState,
  IdentityCenterStatusDetails,
  InstanceSummary,
  InstanceState,
  InstanceDetails,
  PermissionSetState,
  PermissionSetDetails,
} from "./graph";
export type { CallError, CallState } from "./state";
export default IdentityCenterScanner;
