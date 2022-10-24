import { ECS, IAM } from 'aws-sdk';
import { scanIamRole } from './iam';

export async function scanEcsClusters(ecsClient: ECS): Promise<any> {
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

export async function scanEcsTaskDefinitions(ecsClient: ECS, iamClient: IAM) {
  const tasksState: Array<any> = [];

  // Get task def families - this will let us filter the existing tasks more effectively
  const taskDefFamilies = await ecsClient.listTaskDefinitionFamilies().promise();
  console.debug('Found ', taskDefFamilies?.families?.length, 'task families');
  for(let family of taskDefFamilies.families ?? []) {
    console.log('Scanning task definitions in family:', family);
    const taskDefsInFamily = await ecsClient.listTaskDefinitions({ familyPrefix: family, sort: 'DESC' }).promise();
    // pull latest task def from family
    const latestTaskDef = taskDefsInFamily?.taskDefinitionArns?.[0];
    console.log('Latest task definitions in family:', family, latestTaskDef);
    if(latestTaskDef){
      const taskInfo = await ecsClient.describeTaskDefinition({ taskDefinition: latestTaskDef, include: ["TAGS"] }).promise();
      const enrichedTaskInfo: any = { 
        taskDefinition: taskInfo.taskDefinition, 
        tags: taskInfo.tags,
        roles: {} 
      };
      // execution role
      const execRole = taskInfo.taskDefinition?.executionRoleArn;
      if(execRole) {
        try {
          const roleInfo = await scanIamRole(iamClient, execRole);
          enrichedTaskInfo["roles"]["executionRole"] = roleInfo;
        } catch (err) {
          console.error('Failed to scan execution role', {
            err
          });
        }
      }
      
      // task defintion role
      const taskRole = taskInfo.taskDefinition?.taskRoleArn;
      if(taskRole) {
        try {
          const roleInfo = await scanIamRole(iamClient, taskRole);
          enrichedTaskInfo["roles"]["taskRole"] = roleInfo;
        } catch (err) {
          console.error('Failed to scan task role', { 
            err
          });
        }
      }

      tasksState.push({
        familyName: family,
        taskDefinitions: enrichedTaskInfo  
      });
    }

  }

  return tasksState;
}