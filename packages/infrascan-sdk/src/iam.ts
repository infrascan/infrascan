import { IAM, Policy, PolicyVersion } from "@aws-sdk/client-iam";

export function parseRoleName(roleArn: string): string | undefined {
  const lastToken = roleArn.split(":").pop();
  return lastToken?.split("/").pop();
}

export function decodePolicy(policyDoc: string): any {
  const decodedPolicy = decodeURIComponent(policyDoc);
  return JSON.parse(decodedPolicy);
}

export type StoredRole = {
  roleArn: string;
  roleName: string;
  role?: any;
  inlinePolicies?: InlinePolicy[];
  attachedPolicies?: any;
};

export type InlinePolicy = {
  RoleName: string | undefined;
  PolicyName: string | undefined;
  PolicyDocument: any;
};

export type VersionedPolicy = Policy & PolicyVersion;
export type AttachedPolicy = Policy | VersionedPolicy;

export class IAMStorage {
  private data: Record<string, StoredRole>;
  constructor() {
    this.data = {};
  }

  setRole(arn: string, role: StoredRole) {
    this.data[arn] = role;
  }

  getRole(arn: string): StoredRole | undefined {
    return this.data[arn];
  }

  getAllRoles(): StoredRole[] {
    return Object.values(this.data);
  }

  clearAllRoles() {
    this.data = {};
  }
}

export function hydrateRoleStorage(roles: StoredRole[]): IAMStorage {
  const storage = new IAMStorage();
  for (const role of roles) {
    storage.setRole(role.roleArn, role);
  }
  return storage;
}

export async function scanIamRole(
  iamStorage: IAMStorage,
  iamClient: IAM,
  roleArn: string
) {
  const prescannedRole = iamStorage.getRole(roleArn);
  if (prescannedRole != null) {
    return;
  }
  const roleName = parseRoleName(roleArn);
  if (roleName == null) {
    throw new Error("Failed to parse IAM Role");
  }

  // Retrieve base info about Role, main insight being the trust relationship
  const baseRoleInfo = await iamClient.getRole({ RoleName: roleName });
  if (baseRoleInfo?.Role?.AssumeRolePolicyDocument) {
    baseRoleInfo.Role.AssumeRolePolicyDocument = decodePolicy(
      baseRoleInfo.Role.AssumeRolePolicyDocument
    );
  }
  // Init role state
  const iamState: StoredRole = {
    roleArn,
    roleName,
    role: baseRoleInfo?.Role,
  };

  const inlinePolicies = await scanInlinePoliciesForRole(iamClient, roleName);
  iamState.inlinePolicies = inlinePolicies;

  const attachedPolicies = await scanAttachedPoliciesForRole(
    iamClient,
    roleName
  );
  iamState.attachedPolicies = attachedPolicies;
  iamStorage.setRole(roleArn, iamState);
}

async function scanInlinePoliciesForRole(
  iamClient: IAM,
  roleName: string
): Promise<InlinePolicy[]> {
  // Pull info about the role's inline policies
  const rolePolicies = await iamClient.listRolePolicies({
    RoleName: roleName,
  });
  const inlinePolicies = [];
  for (const policy of rolePolicies?.PolicyNames ?? []) {
    const policyInfo = await iamClient.getRolePolicy({
      RoleName: roleName,
      PolicyName: policy,
    });
    const policyDocument = policyInfo.PolicyDocument
      ? decodePolicy(policyInfo.PolicyDocument)
      : undefined;
    const formattedPolicyInfo = {
      RoleName: policyInfo.RoleName,
      PolicyName: policyInfo.PolicyName,
      PolicyDocument: policyDocument,
    };
    inlinePolicies.push(formattedPolicyInfo);
  }
  return inlinePolicies;
}

async function scanAttachedPoliciesForRole(
  iamClient: IAM,
  roleName: string
): Promise<AttachedPolicy[]> {
  // Pull info about the role's attached policies
  const attachedPolicies = [];
  const attachedPoliciesForRole = await iamClient.listAttachedRolePolicies({
    RoleName: roleName,
  });
  for (const policy of attachedPoliciesForRole.AttachedPolicies ?? []) {
    if (policy.PolicyArn) {
      const attachedPolicy = await iamClient.getPolicy({
        PolicyArn: policy.PolicyArn,
      });

      // Pull the specific policy version to get the embedded document
      if (attachedPolicy.Policy?.DefaultVersionId) {
        const policyVersion = await iamClient.getPolicyVersion({
          PolicyArn: policy.PolicyArn,
          VersionId: attachedPolicy.Policy?.DefaultVersionId,
        });
        const formattedVersion = {
          ...attachedPolicy.Policy,
          ...policyVersion.PolicyVersion,
        };
        if (formattedVersion.Document) {
          formattedVersion.Document = decodePolicy(formattedVersion.Document);
        }
        attachedPolicies.push(formattedVersion);
      } else if (attachedPolicy.Policy) {
        attachedPolicies.push(attachedPolicy.Policy);
      }
    }
  }
  return attachedPolicies;
}
