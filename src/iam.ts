import * as AWS from 'aws-sdk';

function parseRoleName(roleArn: string): string | undefined {
  return roleArn.split(":").pop();
}

export async function scanIamRole(iamClient: AWS.IAM, roleArn: string): Promise<object> {
  const roleName = parseRoleName(roleArn);
  // Init role state
  const iamState: any = {};
  iamState["roleArn"] = roleArn;
  if(roleName) {
    iamState["roleName"] = roleName;

    // Retrieve base info about Role, main insight being the trust relationship

    const baseRoleInfo = await iamClient.getRole({ RoleName: roleName }).promise();
    iamState["role"] = baseRoleInfo;

    // Pull info about the role's inline policies

    const rolePolicies = await iamClient.listRolePolicies({ RoleName: roleName }).promise();
    const inlinePolicies = [];
    for(let policy of rolePolicies.PolicyNames) {
      const policyInfo = await iamClient.getRolePolicy({ RoleName: roleName, PolicyName: policy }).promise();
      inlinePolicies.push(policyInfo);
    }
    iamState["inlinePolicies"] = inlinePolicies;

    // Pull info about the role's attached policies

    const attachedPolicies = [];
    const attachedPoliciesForRole = await iamClient.listAttachedRolePolicies({ RoleName: roleName }).promise();
    for(let policy of attachedPoliciesForRole.AttachedPolicies ?? []) {
      if(policy.PolicyArn) {
        const attachedPolicy = await iamClient.getPolicy({ PolicyArn: policy.PolicyArn }).promise();
        attachedPolicies.push(attachedPolicy);
      }
    }
    iamState["attachedPolicies"] = attachedPolicies;
  }

  return iamState;
}