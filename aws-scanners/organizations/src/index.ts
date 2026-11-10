import type { OrganizationsClient } from "@aws-sdk/client-organizations";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./client";
import {
  DescribeOrganization,
  DescribePolicy,
  DescribeResourcePolicy,
  ListAccountsForParent,
  ListAWSServiceAccessForOrganization,
  ListDelegatedAdministrators,
  ListDelegatedServicesForAccount,
  ListOrganizationalUnitsForParent,
  ListPolicies,
  ListRoots,
  ListTagsForResource,
  ListTargetsForPolicy,
} from "./getters";
import { getEdges } from "./edges";
import {
  AccountEntity,
  OrganizationalUnitEntity,
  OrganizationEntity,
  PolicyEntity,
  RootEntity,
} from "./graph";

const OrganizationsScanner: ServiceModule<OrganizationsClient, "aws"> = {
  provider: "aws",
  service: "organizations",
  key: "Organizations",
  getClient,
  callPerRegion: false,
  // Order matters: later getters read the ids recorded by earlier ones.
  getters: [
    DescribeOrganization,
    ListRoots,
    ListOrganizationalUnitsForParent,
    ListAccountsForParent,
    ListPolicies,
    DescribePolicy,
    ListTargetsForPolicy,
    ListDelegatedAdministrators,
    ListDelegatedServicesForAccount,
    ListAWSServiceAccessForOrganization,
    DescribeResourcePolicy,
    ListTagsForResource,
  ],
  getEdges,
  entities: [
    OrganizationEntity,
    RootEntity,
    OrganizationalUnitEntity,
    AccountEntity,
    PolicyEntity,
  ],
};

export type {
  GraphState,
  OrganizationState,
  OrganizationDetails,
  RootState,
  RootDetails,
  OrganizationalUnitState,
  OrganizationalUnitDetails,
  AccountState,
  AccountDetails,
  PolicyState,
  PolicyDetails,
} from "./graph";
export type { CallError, CallState } from "./state";
export type { ObservedFrom } from "./reporter";
export default OrganizationsScanner;
