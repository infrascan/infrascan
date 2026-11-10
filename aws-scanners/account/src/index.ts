import type { AccountClient } from "@aws-sdk/client-account";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./client";
import { GetAlternateContact, ListRegions } from "./getters";
import { AccountStatusEntity } from "./graph";

const AccountScanner: ServiceModule<AccountClient, "aws"> = {
  provider: "aws",
  service: "account",
  key: "Account",
  getClient,
  callPerRegion: false,
  getters: [ListRegions, GetAlternateContact],
  entities: [AccountStatusEntity],
};

export type {
  GraphState,
  AccountStatusState,
  AccountManagementDetails,
  AlternateContactState,
  ServiceStatus,
} from "./graph";
export type { RecordedAlternateContact } from "./getters";
export type { CallError, CallState } from "./state";
export default AccountScanner;
