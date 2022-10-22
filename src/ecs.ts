import * as AWS from 'aws-sdk';

function parseRoleName(roleArn: string): string | undefined {
  return roleArn.split(":").pop();
}

async function scanIamRole(iamClient: AWS.IAM, roleArn: string): Promise<object> {
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

export async function scanEcsClusters(ecsClient: AWS.ECS): Promise<any> {
  const ecsState: any = {};

  // Get all clusters in current scope
  
  const { clusterArns } = await ecsClient.listClusters().promise();
  ecsState["clusters"] = clusterArns;
  
  // Get all running tasks in all clusters
  ecsState["tasks"] = [];
  const taskDefs: Set<string> = new Set();
  for(let cluster of (clusterArns as Array<string>)) {
    const tasks = await ecsClient.listTasks({ cluster }).promise();
    const describeTasksParams = {
      cluster,
      tasks: (tasks.taskArns as Array<string>)
    };
    const enrichedTasks = await ecsClient.describeTasks(describeTasksParams).promise();
    ecsState["tasks"].push({ cluster, tasks: enrichedTasks.tasks });
    if(enrichedTasks.tasks != null){
      for(let task of enrichedTasks.tasks) {
        if(task.taskDefinitionArn) {
          taskDefs.add(task.taskDefinitionArn);
        }
      }
    }
  }

  return ecsState;
}

export async function scanEcsTaskDefinitions(ecsClient: AWS.ECS, iamClient: AWS.IAM) {
  const tasksState: Array<any> = [];

  // Get task def families - this will let us filter the existing tasks more effectively
  const taskDefFamilies = await ecsClient.listTaskDefinitionFamilies().promise();
  for(let family of taskDefFamilies.families ?? []) {
    // TODO: only take latest revision, don't step over all versions
    const taskDefsInFamily = await ecsClient.listTaskDefinitions({ familyPrefix: family }).promise();

    const taskDefsState: Array<any> = [];
    for(let taskDef of taskDefsInFamily.taskDefinitionArns ?? []) {
      const taskInfo = await ecsClient.describeTaskDefinition({ taskDefinition: taskDef, include: ["TAGS"] }).promise();
      const enrichedTaskInfo: any = { ...taskInfo, roles: {} };
      // execution role
      const execRole = taskInfo.taskDefinition?.executionRoleArn;
      if(execRole) {
        const roleInfo = await scanIamRole(iamClient, execRole);
        enrichedTaskInfo["roles"]["executionRole"] = roleInfo;
      }
      
      // task defintion role
      const taskRole = taskInfo.taskDefinition?.taskRoleArn;
      if(taskRole) {
        const roleInfo = await scanIamRole(iamClient, taskRole);
        enrichedTaskInfo["roles"]["taskRole"] = roleInfo;
      }

      taskDefsState.push(enrichedTaskInfo);
    }

    tasksState.push({
      familyName: family,
      taskDefinitions: taskDefsState  
    });
  }

  return tasksState;
}