import type { Macie2Client } from "@aws-sdk/client-macie2";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./client";
import {
  DescribeOrganizationConfiguration,
  GetAdministratorAccount,
  GetAutomatedDiscoveryConfiguration,
  GetClassificationExportConfiguration,
  GetMacieSession,
  ListMembers,
  ListOrganizationAdminAccounts,
} from "./getters";
import { MacieStatusEntity } from "./graph";

const MacieScanner: ServiceModule<Macie2Client, "aws"> = {
  provider: "aws",
  service: "macie2",
  key: "Macie2",
  getClient,
  callPerRegion: true,
  // The status call comes first: the status node is emitted whenever it was recorded. The other calls are made even
  // when Macie is not enabled, since the management account can list delegated administrators without enabling it.
  getters: [
    GetMacieSession,
    GetAdministratorAccount,
    ListOrganizationAdminAccounts,
    DescribeOrganizationConfiguration,
    ListMembers,
    GetClassificationExportConfiguration,
    GetAutomatedDiscoveryConfiguration,
  ],
  entities: [MacieStatusEntity],
};

export type {
  GraphState,
  MacieStatusState,
  MacieDetails,
  MacieMember,
  ServiceStatus,
} from "./graph";
export type { CallError, CallState } from "./state";
export default MacieScanner;
