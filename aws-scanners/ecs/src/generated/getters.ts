import {
  ECSClient,
  ListClustersCommand,
  DescribeClustersCommand,
  ListServicesCommand,
  DescribeServicesCommand,
  ListTasksCommand,
  DescribeTasksCommand,
  DescribeTaskDefinitionCommand,
  ListContainerInstancesCommand,
  DescribeContainerInstancesCommand,
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
  ListTasksCommandInput,
  ListTasksCommandOutput,
  DescribeTasksCommandInput,
  DescribeTasksCommandOutput,
  DescribeTaskDefinitionCommandInput,
  DescribeTaskDefinitionCommandOutput,
  ListContainerInstancesCommandInput,
  ListContainerInstancesCommandOutput,
  DescribeContainerInstancesCommandInput,
  DescribeContainerInstancesCommandOutput,
} from "@aws-sdk/client-ecs";

export async function ListClusters(
  client: ECSClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const state: GenericState[] = [];
  console.log("ecs ListClusters");
  const preparedParams: ListClustersCommandInput = {};
  try {
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
  console.log("ecs DescribeClusters");
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
    try {
      const cmd = new ListServicesCommand(preparedParams);
      const result: ListServicesCommandOutput = await client.send(cmd);
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
  console.log("ecs DescribeServices");
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
  }
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
  const state: GenericState[] = [];
  console.log("ecs ListTasks");
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
  }
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
  const state: GenericState[] = [];
  console.log("ecs DescribeTasks");
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
    try {
      const cmd = new DescribeTaskDefinitionCommand(preparedParams);
      const result: DescribeTaskDefinitionCommandOutput = await client.send(
        cmd,
      );
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
  }
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "ECS",
    "DescribeTaskDefinition",
    state,
  );
}

export async function ListContainerInstances(
  client: ECSClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const state: GenericState[] = [];
  console.log("ecs ListContainerInstances");
  const resolvers = [
    {
      Key: "cluster",
      Selector: "ECS|DescribeClusters|[]._result.clusters[].clusterArn",
    },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as ListContainerInstancesCommandInput[];
  for (const parameters of parameterQueue) {
    let pagingToken: string | undefined = undefined;
    do {
      const preparedParams: ListContainerInstancesCommandInput = parameters;
      preparedParams.nextToken = pagingToken;
      try {
        const cmd = new ListContainerInstancesCommand(preparedParams);
        const result: ListContainerInstancesCommandOutput = await client.send(
          cmd,
        );
        state.push({
          _metadata: { account: context.account, region: context.region },
          _parameters: preparedParams,
          _result: result,
        });
        pagingToken = result.nextToken;
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
        pagingToken = undefined;
      }
    } while (pagingToken != null);
  }
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "ECS",
    "ListContainerInstances",
    state,
  );
}

export async function DescribeContainerInstances(
  client: ECSClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const state: GenericState[] = [];
  console.log("ecs DescribeContainerInstances");
  const resolvers = [
    {
      Key: "cluster",
      Selector: "ECS|ListContainerInstances|[]._parameters.cluster",
    },
    {
      Key: "containerInstances",
      Value: "ECS|ListContainerInstances|[]._result.containerInstanceArns",
    },
    { Key: "include", Value: ["TAGS"] },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as DescribeContainerInstancesCommandInput[];
  for (const parameters of parameterQueue) {
    const preparedParams: DescribeContainerInstancesCommandInput = parameters;
    try {
      const cmd = new DescribeContainerInstancesCommand(preparedParams);
      const result: DescribeContainerInstancesCommandOutput = await client.send(
        cmd,
      );
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
  }
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "ECS",
    "DescribeContainerInstances",
    state,
  );
}

export async function getIamRoles(
  stateConnector: Connector,
): Promise<EntityRoleData[]> {
  let state: EntityRoleData[] = [];
  const DescribeTaskDefinitionRoleState = (await evaluateSelectorGlobally(
    "ECS|DescribeTaskDefinition|[]._result.taskDefinition | [].{roleArn:taskRoleArn,executor:taskDefinitionArn}",
    stateConnector,
  )) as EntityRoleData[];
  state = state.concat(DescribeTaskDefinitionRoleState);
  const DescribeTaskDefinitionRoleState1 = (await evaluateSelectorGlobally(
    "ECS|DescribeTaskDefinition|[]._result.taskDefinition | [].{roleArn:executionRoleArn,executor:taskDefinitionArn}",
    stateConnector,
  )) as EntityRoleData[];
  state = state.concat(DescribeTaskDefinitionRoleState1);
  return state;
}
