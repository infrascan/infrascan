/**
 * Handles the custom logic for generating edges between ECS nodes and the services they touch
 * as this logic is too messy to define in the config as normal
 * For now, only services will be rendered as nodes, within their clusters
 * but the edges will be generated using the roles from their tasks
 */

const { generateEdgesForRole } = require("./graphUtilities");
const { readStateFromFile } = require("../utils");

function generateEdgesForECSResources(account, region) {
  const ecsServiceRecords = readStateFromFile(
    account,
    region,
    "ECS",
    "describeServices"
  ).flatMap(({ _result }) => _result.services);

  const ecsTaskDefinitionRecords = readStateFromFile(
    account,
    region,
    "ECS",
    "describeTaskDefinition"
  ).flatMap(({ _result }) => _result.taskDefinition);

  const taskRoleEdges = ecsServiceRecords.flatMap(
    ({ serviceArn, taskDefinition }) => {
      const matchedTaskDef = ecsTaskDefinitionRecords.find(
        ({ taskDefinitionArn }) => taskDefinitionArn === taskDefinition
      );

      let taskEdges = [];
      if (matchedTaskDef.taskRoleArn) {
        // ServiceArn as the executor is technically inaccurate, but will create the desired edge
        taskEdges = taskEdges.concat(
          generateEdgesForRole(
            account,
            region,
            matchedTaskDef.taskRoleArn,
            serviceArn
          )
        );
      }
      if (matchedTaskDef.executionRoleArn) {
        taskEdges = taskEdges.concat(
          generateEdgesForRole(
            account,
            region,
            matchedTaskDef.executionRoleArn,
            serviceArn
          )
        );
      }

      return taskEdges;
    }
  );

  const loadBalancedECSServices = ecsServiceRecords.filter(
    ({ loadBalancers }) => {
      return loadBalancers.length > 0;
    }
  );

  // Generate edges from target group arn to task
  // Revert change which made services the ECS Nodes.

  return taskRoleEdges;
}

module.exports = {
  generateEdgesForECSResources,
};
