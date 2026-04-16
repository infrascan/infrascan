import type {
  ListRolesCommandInput,
  ListRolesCommandOutput,
  GetRolePolicyCommandInput,
  GetRolePolicyCommandOutput,
  ListAttachedRolePoliciesCommandInput,
  ListAttachedRolePoliciesCommandOutput,
  Role,
  AttachedPolicy,
  GetPolicyCommandOutput,
  GetPolicyCommandInput,
  Policy,
} from "@aws-sdk/client-iam";
import { evaluateSelector } from "@infrascan/core";
import type {
  BaseState,
  State,
  TranslatedEntity,
  WithCallContext,
} from "@infrascan/shared-types";

export interface InlinePolicy {
  name: string;
  // URL-encoded JSON decoded to an object at entity translation time
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  document: any;
}

export interface IamRoleState {
  path: string;
  maxSessionDuration?: number;
  assumeRolePolicy?: unknown;
  inlinePolicies: InlinePolicy[];
  attachedPolicies: AttachedPolicy[];
}

export type IamRole = BaseState<ListRolesCommandInput> & {
  iamRole: IamRoleState;
};

// Enriched raw state — one entry per ListRoles page, augmented with the
// policy state so translate() can join per-role without extra async work.
type EnrichedRolesState = State<
  ListRolesCommandOutput,
  ListRolesCommandInput
> & {
  _inlinePolicies: State<
    GetRolePolicyCommandOutput,
    GetRolePolicyCommandInput
  >[];
  _attachedPolicies: State<
    ListAttachedRolePoliciesCommandOutput,
    ListAttachedRolePoliciesCommandInput
  >[];
};

type EnrichedRole = WithCallContext<Role, ListRolesCommandInput> & {
  _inlinePolicies: InlinePolicy[];
  _attachedPolicies: AttachedPolicy[];
};

function decodePolicy(encoded: string): unknown {
  try {
    return JSON.parse(decodeURIComponent(encoded));
  } catch {
    return encoded;
  }
}

export const IamRoleEntity: TranslatedEntity<
  IamRole,
  EnrichedRolesState,
  EnrichedRole
> = {
  version: "0.1.0",
  debugLabel: "iam-role",
  provider: "aws",
  command: "ListRoles",
  category: "iam",
  subcategory: "role",
  nodeType: "iam-role",
  selector: "IAM|ListRoles|[]",

  async getState(connector, context) {
    const rolesEntries = await evaluateSelector<
      State<ListRolesCommandOutput, ListRolesCommandInput>
    >(context.account, context.region, "IAM|ListRoles|[]", connector);

    const inlinePolicies = await evaluateSelector<
      State<GetRolePolicyCommandOutput, GetRolePolicyCommandInput>
    >(context.account, context.region, "IAM|GetRolePolicy|[]", connector);

    const attachedPolicies = await evaluateSelector<
      State<
        ListAttachedRolePoliciesCommandOutput,
        ListAttachedRolePoliciesCommandInput
      >
    >(context.account, context.region, "IAM|ListAttachedRolePolicies|[]", connector);

    return rolesEntries.map((entry) => ({
      ...entry,
      _inlinePolicies: inlinePolicies,
      _attachedPolicies: attachedPolicies,
    }));
  },

  translate(val) {
    return (
      val._result.Roles?.map((role) => {
        const roleName = role.RoleName!;

        const roleInlinePolicies = val._inlinePolicies
          .filter((p) => p._parameters?.RoleName === roleName)
          .map((p) => ({
            name: p._result.PolicyName!,
            document: p._result.PolicyDocument
              ? decodePolicy(p._result.PolicyDocument)
              : undefined,
          }));

        const roleAttachedPolicies = val._attachedPolicies
          .filter((p) => p._parameters?.RoleName === roleName)
          .flatMap((p) => p._result.AttachedPolicies ?? []);

        return {
          $metadata: val._metadata,
          $parameters: val._parameters,
          _inlinePolicies: roleInlinePolicies,
          _attachedPolicies: roleAttachedPolicies,
          ...role,
        };
      }) ?? []
    );
  },

  components: {
    $metadata(val) {
      return {
        version: IamRoleEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: val.RoleId!,
        label: val.RoleName!,
        nodeClass: "informational",
        nodeType: IamRoleEntity.nodeType,
        parent: val.$metadata.account,
      };
    },

    tenant(val) {
      return {
        provider: IamRoleEntity.provider,
        partition: val.$metadata.partition,
        tenantId: val.$metadata.account,
      };
    },

    resource(val) {
      return {
        id: val.RoleId!,
        name: val.RoleName!,
        category: IamRoleEntity.category,
        subcategory: IamRoleEntity.subcategory,
        description: val.Description,
      };
    },

    tags(val) {
      return (
        val.Tags?.map((tag) => ({
          key: tag.Key!,
          value: tag.Value!,
        })) ?? []
      );
    },

    $source(val) {
      return {
        command: IamRoleEntity.command,
        parameters: val.$parameters,
      };
    },

    location(val) {
      return {
        code: val.$metadata.region,
      };
    },

    audit(val) {
      return {
        createdAt: val.CreateDate,
      };
    },

    iamRole(val): IamRoleState {
      return {
        path: val.Path!,
        maxSessionDuration: val.MaxSessionDuration,
        assumeRolePolicy: val.AssumeRolePolicyDocument
          ? decodePolicy(val.AssumeRolePolicyDocument)
          : undefined,
        inlinePolicies: val._inlinePolicies,
        attachedPolicies: val._attachedPolicies,
      };
    },
  },
};

export interface IamPolicyState {
  path: string;
  defaultVersionId?: string;
  attachmentCount?: number;
  id: string;
  permissionsBoundaryUsageCount?: number;
}

export type IamPolicy = BaseState<GetPolicyCommandInput> & {
  iamPolicy: IamPolicyState;
};

type RestrictedGetPolicyCommandOutput = GetPolicyCommandOutput & {
  Policy: Policy;
};

export const IamPolicyEntity: TranslatedEntity<
  IamPolicy,
  State<RestrictedGetPolicyCommandOutput, GetPolicyCommandInput>,
  WithCallContext<Policy, GetPolicyCommandInput>
> = {
  version: "0.1.0",
  debugLabel: "iam-policy",
  provider: "aws",
  command: "GetPolicy",
  category: "iam",
  subcategory: "policy",
  nodeType: "iam-policy",
  selector: "IAM|GetPolicy|[]",

  async getState(connector, context) {
    const state = await evaluateSelector<
      State<GetPolicyCommandOutput, GetPolicyCommandInput>
    >(context.account, context.region, "IAM|GetPolicy|[]", connector);

    return state.filter(
      (
        entry,
      ): entry is State<
        RestrictedGetPolicyCommandOutput,
        GetPolicyCommandInput
      > => entry._result.Policy != null,
    );
  },

  translate(val) {
    const enrichedPolicy = Object.assign(val._result.Policy, {
      $metadata: val._metadata,
      $parameters: val._parameters,
    });
    return [enrichedPolicy];
  },

  components: {
    $metadata(val) {
      return {
        version: IamRoleEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: val.Arn!,
        label: val.PolicyName!,
        nodeClass: "informational",
        nodeType: IamPolicyEntity.nodeType,
        parent: val.$metadata.account,
      };
    },

    tenant(val) {
      return {
        provider: IamPolicyEntity.provider,
        partition: val.$metadata.partition,
        tenantId: val.$metadata.account,
      };
    },

    resource(val) {
      return {
        id: val.Arn!,
        name: val.PolicyName!,
        category: IamPolicyEntity.category,
        subcategory: IamPolicyEntity.subcategory,
        description: val.Description,
      };
    },

    tags(val) {
      return (
        val.Tags?.map((tag) => ({
          key: tag.Key!,
          value: tag.Value!,
        })) ?? []
      );
    },

    $source(val) {
      return {
        command: IamPolicyEntity.command,
        parameters: val.$parameters,
      };
    },

    location(val) {
      return {
        code: val.$metadata.region,
      };
    },

    audit(val) {
      return {
        createdAt: val.CreateDate,
      };
    },

    iamPolicy(val): IamPolicyState {
      return {
        id: val.PolicyId!,
        path: val.Path!,
        permissionsBoundaryUsageCount: val.PermissionsBoundaryUsageCount,
        defaultVersionId: val.DefaultVersionId,
        attachmentCount: val.AttachmentCount,
      };
    },
  },
};

export type IamRoleGraphState = IamRole;
export type IamPolicyGraphState = IamPolicy;
