import * as IAM from "@aws-sdk/client-iam";
import type { ScannerDefinition } from "@infrascan/shared-types";

export type IamFunctions =
  | "ListRoles"
  | "ListRolePolicies"
  | "GetRolePolicy"
  | "ListAttachedRolePolicies";

const IamScanner: ScannerDefinition<"IAM", typeof IAM, IamFunctions> = {
  provider: "aws",
  service: "iam",
  clientKey: "IAM",
  key: "IAM",
  callPerRegion: false,
  getters: [
    {
      fn: "ListRoles",
      paginationToken: {
        request: "Marker",
        response: "Marker",
      },
    },
    {
      fn: "ListRolePolicies",
      parameters: [
        {
          Key: "RoleName",
          Selector: "IAM|ListRoles|[]._result.Roles[].RoleName",
        },
      ],
      paginationToken: {
        request: "Marker",
        response: "Marker",
      },
    },
    {
      fn: "GetRolePolicy",
      parameters: [
        {
          Key: "RoleName",
          Selector: "IAM|ListRolePolicies|[]._parameters.RoleName",
        },
        {
          Key: "PolicyName",
          Selector: "IAM|ListRolePolicies|[]._result.PolicyNames[]",
        },
      ],
    },
    {
      fn: "ListAttachedRolePolicies",
      parameters: [
        {
          Key: "RoleName",
          Selector: "IAM|ListRoles|[]._result.Roles[].RoleName",
        },
      ],
      paginationToken: {
        request: "Marker",
        response: "Marker",
      },
    },
  ],
};

export default IamScanner;
