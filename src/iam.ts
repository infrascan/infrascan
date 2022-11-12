import { IAM } from 'aws-sdk';
import { Tag, persistToFileFactory } from './utils';

function parseRoleName(roleArn: string): string | undefined {
  const lastToken = roleArn.split(":").pop();
  return lastToken?.split('/').pop();
}

function decodePolicy(policyDoc: string): any {
  const decodedPolicy = decodeURIComponent(policyDoc);
  return JSON.parse(decodedPolicy);
}

interface IAMStorage {
  data: any,
  setRole: (arn: string, role: IamRole) => void,
  getRole: (arn: string) => IamRole | undefined,
  getAllRoles: () => IamRole[]
}

export const IAM_STORAGE: IAMStorage = {
  data: {},
  setRole: function(arn: string, role: IamRole) {
    this.data[arn] = role;
  },
  getRole: function(arn: string): IamRole | undefined {
    return this.data[arn];
  },
  getAllRoles: function(): IamRole[] {
    return Object.values(this.data);
  }
}


export interface Statement {
  Sid: string,
  Effect: "Allow" | "Deny",
  Action: string | Array<string>,
  Resource: string | Array<string>
}

interface PolicyDocument {
  Version: string,
  Statement: Statement[],
}
export interface Policy {
  PolicyArn?: string,
  VersionId?: string,
  Document?: PolicyDocument,
  PolicyName?: string,
  PolicyId?: string,
  Arn?: string,
  Path?: string,
  DefaultVersionId?: string,
  AttachmentCount?: number,
  PermissionsBoundaryUsageCount?: number,
  IsAttachable?: boolean,
  CreateDate?: string,
  UpdateDate?: string,
  Tags?: Tag[],
}

export interface InlinePolicy {
  RoleName: string,
  PolicyName: string,
  PolicyDocument?: any
}

export interface IamRole {
  roleArn: string,
  roleName?: string,
  role?: IAM.Role,
  inlinePolicies?: InlinePolicy[],
  attachedPolicies?: Policy[]
}

export function hydrateRoleStorage(roles: IamRole[]) {
  for(let role of roles) {
    IAM_STORAGE.setRole(role.roleArn, role);
  }
}

export async function scanIamRole(iamClient: IAM, roleArn: string): Promise<void> {
  const roleName = parseRoleName(roleArn);
  const prescannedRole = IAM_STORAGE.getRole(roleArn);
  if(prescannedRole) {
    return;
  }
  // Init role state
  const iamState: any = {};
  iamState["roleArn"] = roleArn;
  if(roleName) {
    iamState["roleName"] = roleName;

    // Retrieve base info about Role, main insight being the trust relationship
    const baseRoleInfo = await iamClient.getRole({ RoleName: roleName }).promise();
    if(baseRoleInfo?.Role?.AssumeRolePolicyDocument) {
      baseRoleInfo.Role.AssumeRolePolicyDocument = decodePolicy(baseRoleInfo.Role.AssumeRolePolicyDocument);
    }
    iamState["role"] = baseRoleInfo?.Role;

    // Pull info about the role's inline policies
    const rolePolicies = await iamClient.listRolePolicies({ RoleName: roleName }).promise();
    const inlinePolicies = [];
    for(let policy of rolePolicies.PolicyNames) {
      const policyInfo = await iamClient.getRolePolicy({ RoleName: roleName, PolicyName: policy }).promise();
      const formattedPolicyInfo = { 
        RoleName: policyInfo.RoleName,
        PolicyName: policyInfo.PolicyName,
        PolicyDocument: decodePolicy(policyInfo.PolicyDocument)
      };
      inlinePolicies.push(formattedPolicyInfo);
    }
    iamState["inlinePolicies"] = inlinePolicies;

    // Pull info about the role's attached policies
    const attachedPolicies = [];
    const attachedPoliciesForRole = await iamClient.listAttachedRolePolicies({ RoleName: roleName }).promise();
    for(let policy of attachedPoliciesForRole.AttachedPolicies ?? []) {
      if(policy.PolicyArn) {
        const attachedPolicy = await iamClient.getPolicy({ PolicyArn: policy.PolicyArn }).promise();
        
        // Pull the specific policy version to get the embedded document
        if(attachedPolicy.Policy?.DefaultVersionId) {
          const policyVersion = await iamClient.getPolicyVersion({ 
            PolicyArn: policy.PolicyArn, 
            VersionId: attachedPolicy.Policy?.DefaultVersionId 
          }).promise();
          const formattedVersion = { ...attachedPolicy.Policy, ...policyVersion.PolicyVersion };
          if(formattedVersion.Document) {
            formattedVersion.Document = decodePolicy(formattedVersion.Document);
          }
          attachedPolicies.push(formattedVersion);
        } else {
          attachedPolicies.push(attachedPolicy.Policy);
        }
      }
    }
    iamState["attachedPolicies"] = attachedPolicies;
  }
  IAM_STORAGE.setRole(roleArn, iamState);
}

export function saveAllScannedRoles(accountId: string): void {
  persistToFileFactory(accountId, 'iam')(IAM_STORAGE.getAllRoles());
}