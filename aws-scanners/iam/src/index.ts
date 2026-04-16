import { IAMClient } from "@aws-sdk/client-iam";
import type { ServiceModule } from "@infrascan/shared-types";
import {
  ListRoles,
  ListRolePolicies,
  GetRolePolicy,
  ListAttachedRolePolicies,
  GetPolicy,
} from "./generated/getters";
import { getClient } from "./generated/client";
import { IamPolicyEntity, IamRoleEntity } from "./graph";

const IamScanner: ServiceModule<IAMClient, "aws"> = {
  provider: "aws",
  service: "iam",
  key: "IAM",
  getClient,
  callPerRegion: false,
  getters: [
    ListRoles,
    ListRolePolicies,
    GetRolePolicy,
    ListAttachedRolePolicies,
    GetPolicy,
  ],
  entities: [IamRoleEntity, IamPolicyEntity],
};

export type {
  IamRoleGraphState,
  IamPolicyGraphState,
  IamRoleState,
  IamPolicyState,
  InlinePolicy,
} from "./graph";
export default IamScanner;
