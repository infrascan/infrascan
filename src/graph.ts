/**
 * Approach to take:
 * - Get state per service
 * - Get roles per item
 * - Get statements per role
 * - Take Resources from statements
 * - Extract service from resources
 * - Get all arns in resources
 */

import { AccountState } from "./index";
import { IamRole, Statement, IAM_STORAGE } from "./iam";
import { EcsTask } from "./ecs";
import { writeFileSync } from "fs";
import * as jmespath from "jmespath";
import minimatch from "minimatch";

function getServiceFromArn(arn: string): string | undefined {
  const [_prefix, _aws, service] = arn.split(":");
  return service;
}

interface PolicyStatements {
  inlineStatements: Statement[];
  attachedStatements: Statement[];
}

function getPolicyStatementsForRole(role: IamRole): PolicyStatements {
  const inlineStatements = jmespath.search(
    role,
    "inlinePolicies[].PolicyDocument.Document[].Statement"
  );
  const attachedStatements = jmespath.search(
    role,
    "attachedPolicies[].Document.Statement"
  );
  return {
    inlineStatements,
    attachedStatements: attachedStatements.flatMap((x) => x),
  };
}

function curryMinimatch(pattern: string): (resource: string) => boolean {
  return (resource: string) => minimatch(resource, pattern);
}

function generateEdges(
  originId: string,
  allArns: string[],
  role: IamRole
): Edge[] {
  const { inlineStatements, attachedStatements } =
    getPolicyStatementsForRole(role);
  console.log("role statements", {
    role,
    inlineStatements,
    attachedStatements,
  });

  function resolveResourceGlob(arn: string) {
    if (arn === "*") {
      // TODO: use actions to infer resources this permits
      return;
    } else if (arn.includes("*")) {
      const service = getServiceFromArn(arn);
      if (service) {
        // get resources for service
        return allArns.filter(curryMinimatch(arn));
      } else {
        return;
      }
    } else {
      return arn;
    }
  }

  const effectiveInlineResources: any =
    inlineStatements?.flatMap(({ Resource }) => {
      console.log("inline resources", { Resource });
      if (Array.isArray(Resource)) {
        return Resource.flatMap(resolveResourceGlob);
      } else {
        return resolveResourceGlob(Resource);
      }
    }) ?? [];

  const effectiveAttachedResources: any =
    attachedStatements?.flatMap(({ Resource }) => {
      console.log("attached resources", { Resource });
      if (Array.isArray(Resource)) {
        return Resource.flatMap(resolveResourceGlob);
      } else {
        return resolveResourceGlob(Resource);
      }
    }) ?? [];

  return effectiveInlineResources
    .concat(effectiveAttachedResources)
    .map((arn: string) => ({
      data: {
        id: `${originId}:${arn}`,
        source: originId,
        target: arn,
        type: "edge",
      },
      group: "edges",
    }))
    .filter(({ data }) => {
      const bothExist = Boolean(data?.source) && Boolean(data?.target);
      if (bothExist) {
        return allArns.includes(data?.source) && allArns.includes(data?.target);
      }
      return false;
    });
}

function getEcsRoles(state: EcsTask): string[] {
  return jmespath.search(
    state,
    "TaskDefinition.[executionRoleArn, taskRoleArn]"
  );
}

interface Edge {
  source: string;
  target: string;
  type: "edge";
}

export function generateServiceMap(accountState: AccountState) {
  const allArns: string[] = Object.values(accountState).flatMap(
    (resourceCollection) => {
      return resourceCollection
        .map(({ Arn, TaskDefinition }) => {
          if (Arn) {
            return Arn;
          } else {
            return TaskDefinition?.taskDefinitionArn;
          }
        })
        .filter(Boolean);
    }
  );
  console.log("Begin All Arns");
  console.log({
    allArns,
  });
  console.log("End All Arns");

  const graphData = Object.values(accountState).flatMap(
    (resourceCollection) => {
      return resourceCollection.map((resource: any) => ({
        group: "nodes",
        data: {
          id: resource.Arn || resource?.TaskDefinition?.taskDefinitionArn,
          type: resource.ResourceKey,
          name:
            resource.Name ||
            resource.Arn ||
            resource?.TaskDefinition?.taskDefinitionArn,
          node_data: resource,
        },
      }));
    }
  );

  const edges = accountState.ecs.flatMap((task) => {
    let edgesFromRole: Edge[] = [];
    const [executionRoleArn, taskRoleArn] = getEcsRoles(task);
    console.log("Task roles", { executionRoleArn, taskRoleArn });
    if (executionRoleArn) {
      const role = IAM_STORAGE.getRole(executionRoleArn);
      console.log("evaluating edges for execution role", {
        role,
        taskDefArn: task.TaskDefinition?.taskDefinitionArn,
      });
      if (role && task.TaskDefinition?.taskDefinitionArn) {
        console.log("generating roles for task", { role });
        edgesFromRole = edgesFromRole.concat(
          generateEdges(task.TaskDefinition?.taskDefinitionArn, allArns, role)
        );
      }
    }
    if (taskRoleArn) {
      const role = IAM_STORAGE.getRole(taskRoleArn);
      console.log("evluating edges for task role", {
        role,
        taskDefArn: task.TaskDefinition?.taskDefinitionArn,
      });
      if (role && task.TaskDefinition?.taskDefinitionArn) {
        console.log("generating roles for task", { task });
        edgesFromRole = edgesFromRole.concat(
          generateEdges(task.TaskDefinition?.taskDefinitionArn, allArns, role)
        );
      }
    }
    return edgesFromRole;
  });

  const lambdaEdges = accountState.lambda.flatMap((lambda) => {
    let edgesFromRole: Edge[] = [];
    console.log("Lambda roles", { Role: lambda.Role });
    if (lambda.Role) {
      const role = IAM_STORAGE.getRole(lambda.Role);
      if (role) {
        console.log("generating roles for task", { role });
        edgesFromRole = edgesFromRole.concat(
          generateEdges(lambda.Arn, allArns, role)
        );
      }
    }
    return edgesFromRole;
  });

  console.log(lambdaEdges);

  writeFileSync(
    `./static/graph-${Date.now()}.json`,
    JSON.stringify(graphData.concat(edges.concat(lambdaEdges)), undefined, 2),
    {}
  );
  return graphData;
}
