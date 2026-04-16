import { IAMClient } from "@aws-sdk/client-iam";
import type { ServiceModule } from "@infrascan/shared-types";
import {
  ListRoles,
  ListRolePolicies,
  GetRolePolicy,
  ListAttachedRolePolicies,
} from "./generated/getters";
import { getClient } from "./generated/client";
import { IamRoleEntity } from "./graph";

const IamScanner: ServiceModule<IAMClient, "aws"> = {
  provider: "aws",
  service: "iam",
  key: "IAM",
  getClient,
  callPerRegion: false,
  getters: [ListRoles, ListRolePolicies, GetRolePolicy, ListAttachedRolePolicies],
  entities: [IamRoleEntity],
};

export type { GraphState, IamRoleState, InlinePolicy } from "./graph";
export default IamScanner;
