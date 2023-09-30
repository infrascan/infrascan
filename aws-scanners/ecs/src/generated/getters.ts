import {
  ECSClient,
  ListClustersCommand,
  DescribeClustersCommand,
  ListServicesCommand,
  DescribeServicesCommand,
  DescribeTasksCommand,
  DescribeTaskDefinitionCommand,
  ECSServiceException,
} from "@aws-sdk/client-ecs";
import {
  evaluateSelectorGlobally,
  resolveFunctionCallParameters,
} from "@infrascan/core";
import type {
  Connector,
  GenericState,
  AwsContext,
  EntityRoleData,
} from "@infrascan/shared-types";
import type {
  ListClustersCommandInput,
  ListClustersCommandOutput,
  DescribeClustersCommandInput,
  DescribeClustersCommandOutput,
  ListServicesCommandInput,
  ListServicesCommandOutput,
  DescribeServicesCommandInput,
  DescribeServicesCommandOutput,
  DescribeTasksCommandInput,
  DescribeTasksCommandOutput,
  DescribeTaskDefinitionCommandInput,
  DescribeTaskDefinitionCommandOutput,
} from "@aws-sdk/client-ecs";

export async function ListClusters(
  client: ECSClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const state: GenericState[] = [];
  try {
    console.log("ecs ListClusters");
    const preparedParams: ListClustersCommandInput = {};
    const cmd = new ListClustersCommand(preparedParams);
    const result: ListClustersCommandOutput = await client.send(cmd);
    state.push({
      _metadata: { account: context.account, region: context.region },
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
  const state: GenericState[] = [];
  try {
    console.log("ecs DescribeClusters");
    const resolvers = [
      { Key: "clusters", Selector: "ECS|ListClusters|[]._result.clusterArns" },
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
      const cmd = new DescribeClustersCommand(preparedParams);
      const result: DescribeClustersCommandOutput = await client.send(cmd);
      state.push({
        _metadata: { account: context.account, region: context.region },
        _parameters: preparedParams,
        _result: result,
      });
    }
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
  const state: GenericState[] = [];
  try {
    console.log("ecs ListServices");
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
      const cmd = new ListServicesCommand(preparedParams);
      const result: ListServicesCommandOutput = await client.send(cmd);
      state.push({
        _metadata: { account: context.account, region: context.region },
        _parameters: preparedParams,
        _result: result,
      });
    }
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
  const state: GenericState[] = [];
  try {
    console.log("ecs DescribeServices");
    const resolvers = [
      { Key: "cluster", Selector: "ECS|ListServices|[]._parameters.cluster" },
      { Key: "services", Selector: "ECS|ListServices|[]._result.serviceArns" },
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
      const cmd = new DescribeServicesCommand(preparedParams);
      const result: DescribeServicesCommandOutput = await client.send(cmd);
      state.push({
        _metadata: { account: context.account, region: context.region },
        _parameters: preparedParams,
        _result: result,
      });
    }
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
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "ECS",
    "DescribeServices",
    state,
  );
}

export async function DescribeTasks(
  client: ECSClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const state: GenericState[] = [];
  try {
    console.log("ecs DescribeTasks");
    const resolvers = [
      { Key: "cluster", Selector: "ECS|ListTasks|[]._parameters.cluster" },
      { Key: "tasks", Selector: "ECS|ListTasks|[]._result.taskArns" },
    ];
    const parameterQueue = (await resolveFunctionCallParameters(
      context.account,
      context.region,
      resolvers,
      stateConnector,
    )) as DescribeTasksCommandInput[];
    for (const parameters of parameterQueue) {
      const preparedParams: DescribeTasksCommandInput = parameters;
      const cmd = new DescribeTasksCommand(preparedParams);
      const result: DescribeTasksCommandOutput = await client.send(cmd);
      state.push({
        _metadata: { account: context.account, region: context.region },
        _parameters: preparedParams,
        _result: result,
      });
    }
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
  const state: GenericState[] = [];
  try {
    console.log("ecs DescribeTaskDefinition");
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
      const cmd = new DescribeTaskDefinitionCommand(preparedParams);
      const result: DescribeTaskDefinitionCommandOutput = await client.send(
        cmd,
      );
      state.push({
        _metadata: { account: context.account, region: context.region },
        _parameters: preparedParams,
        _result: result,
      });
    }
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
  let state: EntityRoleData[] = [];
  const DescribeTaskDefinitionRoleState = (await evaluateSelectorGlobally(
    "ECS|DescribeTaskDefinition|[]._result.taskDefinition | [].{arn:taskRoleArn,executor:taskDefinitionArn}",
    stateConnector,
  )) as EntityRoleData[];
  state = state.concat(DescribeTaskDefinitionRoleState);
  const DescribeTaskDefinitionRoleState2 = (await evaluateSelectorGlobally(
    "ECS|DescribeTaskDefinition|[]._result.taskDefinition | [].{arn:executionRoleArn,executor:taskDefinitionArn}",
    stateConnector,
  )) as EntityRoleData[];
  state = state.concat(DescribeTaskDefinitionRoleState2);
  return state;
}
