import type { Inspector2Client } from "@aws-sdk/client-inspector2";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./client";
import {
  BatchGetAccountStatus,
  DescribeOrganizationConfiguration,
  GetDelegatedAdminAccount,
  ListDelegatedAdminAccounts,
  ListMembers,
} from "./getters";
import { InspectorStatusEntity } from "./graph";

const InspectorScanner: ServiceModule<Inspector2Client, "aws"> = {
  provider: "aws",
  service: "inspector2",
  key: "Inspector2",
  getClient,
  callPerRegion: true,
  // The status call comes first: the status node is emitted whenever it was recorded.
  getters: [
    BatchGetAccountStatus,
    GetDelegatedAdminAccount,
    ListDelegatedAdminAccounts,
    DescribeOrganizationConfiguration,
    ListMembers,
  ],
  entities: [InspectorStatusEntity],
};

export type {
  GraphState,
  InspectorStatusState,
  InspectorDetails,
  InspectorMember,
  InspectorState,
  ServiceStatus,
} from "./graph";
export type { CallError, CallState } from "./state";
export default InspectorScanner;
