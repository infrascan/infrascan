import {
  evaluateSelectorGlobally,
  resolveFunctionCallParameters,
} from "@infrascan/core";
import {
  ECSClient,
  ECSServiceException,
  ListClustersCommand,
  ListClustersCommandInput,
  ListClustersCommandOutput,
  DescribeClustersCommand,
  DescribeClustersCommandInput,
  DescribeClustersCommandOutput,
  ListServicesCommand,
  ListServicesCommandInput,
  ListServicesCommandOutput,
  DescribeServicesCommand,
  DescribeServicesCommandInput,
  DescribeServicesCommandOutput,
  ListTasksCommand,
  ListTasksCommandInput,
  ListTasksCommandOutput,
  DescribeTasksCommand,
  DescribeTasksCommandInput,
  DescribeTasksCommandOutput,
  DescribeTaskDefinitionCommand,
  DescribeTaskDefinitionCommandInput,
  DescribeTaskDefinitionCommandOutput,
} from "@aws-sdk/client-ecs";
import type {
  Connector,
  GenericState,
  AwsContext,
  EntityRoleData,
} from "@infrascan/shared-types";
import debug from "debug";

export async function ListClusters(
  client: ECSClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("ecs:ListClusters");
  const state: GenericState[] = [];
  getterDebug("ListClusters");
  const preparedParams: ListClustersCommandInput = {};
  try {
    const cmd = new ListClustersCommand(preparedParams);
    const result: ListClustersCommandOutput = await client.send(cmd);
    state.push({
      _metadata: {
        account: context.account,
        region: context.region,
        timestamp: new Date().toISOString(),
      },
      _parameters: preparedParams,
      _result: result,
    });
  } catch (err: unknown) {
    if (err instanceof ECSServiceException) {
      if (err?.$retryable) {
        console.log("Encountered retryable error", err);
      } else {
        console.log("Encountered unretryable error", err);
      }
    } else {
      console.log("Encountered unexpected error", err);
    }
  }
  getterDebug("Recording state");
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "ECS",
    "ListClusters",
    state,
  );
}
export async function DescribeClusters(
  client: ECSClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("ecs:DescribeClusters");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [
    {
      Key: "clusters",
      Selector: "ECS|ListClusters|[]._result.clusterArns | [?length(@)>`0`]",
    },
    {
      Key: "include",
      Value: [
        "ATTACHMENTS",
        "SETTINGS",
        "CONFIGURATIONS",
        "STATISTICS",
        "TAGS",
      ],
    },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as DescribeClustersCommandInput[];
  for (const parameters of parameterQueue) {
    const preparedParams: DescribeClustersCommandInput = parameters;
    try {
      const cmd = new DescribeClustersCommand(preparedParams);
      const result: DescribeClustersCommandOutput = await client.send(cmd);
      state.push({
        _metadata: {
          account: context.account,
          region: context.region,
          timestamp: new Date().toISOString(),
        },
        _parameters: preparedParams,
        _result: result,
      });
    } catch (err: unknown) {
      if (err instanceof ECSServiceException) {
        if (err?.$retryable) {
          console.log("Encountered retryable error", err);
        } else {
          console.log("Encountered unretryable error", err);
        }
      } else {
        console.log("Encountered unexpected error", err);
      }
    }
  }
  getterDebug("Recording state");
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "ECS",
    "DescribeClusters",
    state,
  );
}
export async function ListServices(
  client: ECSClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("ecs:ListServices");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [
    { Key: "cluster", Selector: "ECS|ListClusters|[]._result.clusterArns[]" },
    { Key: "maxResults", Value: 100 },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as ListServicesCommandInput[];
  for (const parameters of parameterQueue) {
    const preparedParams: ListServicesCommandInput = parameters;
    try {
      const cmd = new ListServicesCommand(preparedParams);
      const result: ListServicesCommandOutput = await client.send(cmd);
      state.push({
        _metadata: {
          account: context.account,
          region: context.region,
          timestamp: new Date().toISOString(),
        },
        _parameters: preparedParams,
        _result: result,
      });
    } catch (err: unknown) {
      if (err instanceof ECSServiceException) {
        if (err?.$retryable) {
          console.log("Encountered retryable error", err);
        } else {
          console.log("Encountered unretryable error", err);
        }
      } else {
        console.log("Encountered unexpected error", err);
      }
    }
  }
  getterDebug("Recording state");
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "ECS",
    "ListServices",
    state,
  );
}
export async function DescribeServices(
  client: ECSClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("ecs:DescribeServices");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [
    { Key: "cluster", Selector: "ECS|ListServices|[]._parameters.cluster" },
    {
      Key: "services",
      Selector: "ECS|ListServices|[]._result.serviceArns | [?length(@)>`0`]",
    },
    { Key: "include", Value: ["TAGS"] },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as DescribeServicesCommandInput[];
  for (const parameters of parameterQueue) {
    const preparedParams: DescribeServicesCommandInput = parameters;
    try {
      const cmd = new DescribeServicesCommand(preparedParams);
      const result: DescribeServicesCommandOutput = await client.send(cmd);
      state.push({
        _metadata: {
          account: context.account,
          region: context.region,
          timestamp: new Date().toISOString(),
        },
        _parameters: preparedParams,
        _result: result,
      });
    } catch (err: unknown) {
      if (err instanceof ECSServiceException) {
        if (err?.$retryable) {
          console.log("Encountered retryable error", err);
        } else {
          console.log("Encountered unretryable error", err);
        }
      } else {
        console.log("Encountered unexpected error", err);
      }
    }
  }
  getterDebug("Recording state");
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "ECS",
    "DescribeServices",
    state,
  );
}
export async function ListTasks(
  client: ECSClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("ecs:ListTasks");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [
    { Key: "cluster", Selector: "ECS|ListClusters|[]._result.clusterArns[]" },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as ListTasksCommandInput[];
  for (const parameters of parameterQueue) {
    const preparedParams: ListTasksCommandInput = parameters;
    try {
      const cmd = new ListTasksCommand(preparedParams);
      const result: ListTasksCommandOutput = await client.send(cmd);
      state.push({
        _metadata: {
          account: context.account,
          region: context.region,
          timestamp: new Date().toISOString(),
        },
        _parameters: preparedParams,
        _result: result,
      });
    } catch (err: unknown) {
      if (err instanceof ECSServiceException) {
        if (err?.$retryable) {
          console.log("Encountered retryable error", err);
        } else {
          console.log("Encountered unretryable error", err);
        }
      } else {
        console.log("Encountered unexpected error", err);
      }
    }
  }
  getterDebug("Recording state");
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "ECS",
    "ListTasks",
    state,
  );
}
export async function DescribeTasks(
  client: ECSClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("ecs:DescribeTasks");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [
    { Key: "cluster", Selector: "ECS|ListTasks|[]._parameters.cluster" },
    {
      Key: "tasks",
      Selector: "ECS|ListTasks|[]._result.taskArns | [?length(@)>`0`]",
    },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as DescribeTasksCommandInput[];
  for (const parameters of parameterQueue) {
    const preparedParams: DescribeTasksCommandInput = parameters;
    try {
      const cmd = new DescribeTasksCommand(preparedParams);
      const result: DescribeTasksCommandOutput = await client.send(cmd);
      state.push({
        _metadata: {
          account: context.account,
          region: context.region,
          timestamp: new Date().toISOString(),
        },
        _parameters: preparedParams,
        _result: result,
      });
    } catch (err: unknown) {
      if (err instanceof ECSServiceException) {
        if (err?.$retryable) {
          console.log("Encountered retryable error", err);
        } else {
          console.log("Encountered unretryable error", err);
        }
      } else {
        console.log("Encountered unexpected error", err);
      }
    }
  }
  getterDebug("Recording state");
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "ECS",
    "DescribeTasks",
    state,
  );
}
export async function DescribeTaskDefinition(
  client: ECSClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("ecs:DescribeTaskDefinition");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [
    {
      Key: "taskDefinition",
      Selector: "ECS|DescribeTasks|[]._result.tasks[].taskDefinitionArn",
    },
    { Key: "include", Value: ["TAGS"] },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as DescribeTaskDefinitionCommandInput[];
  for (const parameters of parameterQueue) {
    const preparedParams: DescribeTaskDefinitionCommandInput = parameters;
    try {
      const cmd = new DescribeTaskDefinitionCommand(preparedParams);
      const result: DescribeTaskDefinitionCommandOutput = await client.send(
        cmd,
      );
      state.push({
        _metadata: {
          account: context.account,
          region: context.region,
          timestamp: new Date().toISOString(),
        },
        _parameters: preparedParams,
        _result: result,
      });
    } catch (err: unknown) {
      if (err instanceof ECSServiceException) {
        if (err?.$retryable) {
          console.log("Encountered retryable error", err);
        } else {
          console.log("Encountered unretryable error", err);
        }
      } else {
        console.log("Encountered unexpected error", err);
      }
    }
  }
  getterDebug("Recording state");
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "ECS",
    "DescribeTaskDefinition",
    state,
  );
}

export async function getIamRoles(
  stateConnector: Connector,
): Promise<EntityRoleData[]> {
  const iamDebug = debug("ecs:iam");
  iamDebug("Pulling IAM roles from state");
  const state: EntityRoleData[] = [];
  const DescribeTaskDefinitionRoleState = (await evaluateSelectorGlobally(
    "ECS|DescribeTaskDefinition|[]._result.taskDefinition | [].{roleArn:taskRoleArn,executor:taskDefinitionArn}",
    stateConnector,
  )) as EntityRoleData[];
  state.push(...DescribeTaskDefinitionRoleState);
  const DescribeTaskDefinitionRoleState1 = (await evaluateSelectorGlobally(
    "ECS|DescribeTaskDefinition|[]._result.taskDefinition | [].{roleArn:executionRoleArn,executor:taskDefinitionArn}",
    stateConnector,
  )) as EntityRoleData[];
  state.push(...DescribeTaskDefinitionRoleState1);
  return state;
}
