import { evaluateSelector, formatNode } from "@infrascan/core";
import debug from "debug";
import type {
  Cluster as AwsCluster,
  Service as AwsService,
  DescribeClustersCommandInput,
  DescribeClustersCommandOutput,
  DescribeServicesCommandInput,
  DescribeServicesCommandOutput,
  DescribeTasksCommandInput,
  DescribeTasksCommandOutput,
  Task,
} from "@aws-sdk/client-ecs";
import {
  type Connector,
  type AwsContext,
  type SelectedNode,
  type BaseState,
  type State,
  type KVPair,
  type Network,
  Unit,
} from "@infrascan/shared-types";

import type { ECS, Cluster, Service, Deployments, ECSTask } from "./types";

const nodesDebug = debug("ecs:nodes");

const SELECTORS = Object.freeze({
  clusters: "ECS|DescribeClusters|[]",
  services: "ECS|DescribeServices|[]",
  serviceTasks: "ECS|DescribeServices|[]",
  standaloneTasks: "ECS|DescribeTasks|[]",
});

export type ECSState<T> = BaseState<T> & { ecs: ECS };

function mapKvPair<T extends { name?: string; value?: string }>(
  kvPair: T,
): KVPair {
  return { key: kvPair.name, value: kvPair.value };
}

function translateClusterDataToSchema(cluster: AwsCluster): Cluster {
  return {
    executeCommandConfiguration:
      cluster.configuration?.executeCommandConfiguration,
    managedStorageConfiguration:
      cluster.configuration?.managedStorageConfiguration,
    registeredContainerInstancesCount:
      cluster.registeredContainerInstancesCount,
    runningTasksCount: cluster.runningTasksCount,
    pendingTasksCount: cluster.pendingTasksCount,
    activeServicesCount: cluster.activeServicesCount,
    statistics: cluster.statistics?.map(mapKvPair),
    settings: cluster.settings?.map(mapKvPair),
    capacityProviders: cluster.capacityProviders,
    defaultCapacityProviderStrategy: cluster.defaultCapacityProviderStrategy,
    attachments: cluster.attachments,
    attachmentStatus: cluster.attachmentsStatus,
    serviceConnectDefaults: cluster.serviceConnectDefaults,
    status: cluster.status,
  };
}

async function getClusterNodes(stateConnector: Connector, context: AwsContext) {
  nodesDebug("Fetching ECS cluster nodes");
  const describeClusterState = await evaluateSelector<
    State<DescribeClustersCommandOutput[], DescribeClustersCommandInput>
  >(context.account, context.region, SELECTORS.clusters, stateConnector);

  const state: ECSState<DescribeClustersCommandInput>[] = [];
  for (const describeClusterCall of describeClusterState) {
    const clusters = describeClusterCall._result.flatMap(
      (result) => result.clusters ?? [],
    );
    for (const cluster of clusters) {
      state.push({
        $metadata: {
          version: "0.1.0",
          timestamp: describeClusterCall._metadata.timestamp,
        },
        $graph: {
          id: cluster.clusterArn!,
          label: cluster.clusterName!,
          nodeType: "ecs-cluster",
        },
        $source: {
          command: "DescribeClusters",
          parameters: describeClusterCall._parameters,
        },
        tenant: {
          tenantId: context.account,
          provider: "aws",
          partition: context.partition,
        },
        location: {
          code: context.region,
        },
        resource: {
          id: cluster.clusterArn!,
          name: cluster.clusterName!,
          category: "ecs",
          subcategory: "cluster",
        },
        ecs: {
          cluster: translateClusterDataToSchema(cluster),
        },
        tags: cluster.tags,
      });
    }
  }
  return state;
}

function toLowerCase<T extends string>(val: T): Lowercase<T> {
  return val.toLowerCase() as Lowercase<T>;
}

function translateServiceDataToSchema(service: AwsService): Service {
  return {
    serviceRegistries: service.serviceRegistries,
    status: service.status,
    launchType: service.launchType,
    capacityProviderStrategy: service.capacityProviderStrategy,
    taskDefinition: service.taskDefinition,
    desiredCount: service.desiredCount,
    runningCount: service.runningCount,
    pendingCount: service.pendingCount,
    placement: {
      constraints: service.placementConstraints,
      strategy: service.placementStrategy,
    },
    schedulingStrategy: service.schedulingStrategy
      ? toLowerCase(service.schedulingStrategy)
      : undefined,
  };
}

function translateServiceDeployments(service: AwsService): Deployments {
  return {
    circuitBreaker: service.deploymentConfiguration?.deploymentCircuitBreaker,
    alarms: service.deploymentConfiguration?.alarms,
    rollout: {
      maximumHealthyPct: service.deploymentConfiguration?.maximumPercent,
      minimumHealthyPct: service.deploymentConfiguration?.minimumHealthyPercent,
    },
    controller: service.deploymentController,
  };
}

function translateServiceNetworkConfig(service: AwsService): Network {
  const publicIpStatus =
    service.networkConfiguration?.awsvpcConfiguration?.assignPublicIp ===
    "ENABLED"
      ? "enabled"
      : "disabled";
  return {
    publicIp: {
      status: publicIpStatus,
    },
    securityGroups:
      service.networkConfiguration?.awsvpcConfiguration?.securityGroups,
    targetSubnets: service.networkConfiguration?.awsvpcConfiguration?.subnets,
  };
}

async function getServiceNodes(stateConnector: Connector, context: AwsContext) {
  nodesDebug("Fetching ECS service nodes");
  const describeServicesCalls = await evaluateSelector<
    State<DescribeServicesCommandOutput[], DescribeServicesCommandInput>
  >(context.account, context.region, SELECTORS.services, stateConnector);

  const state: ECSState<DescribeServicesCommandInput>[] = [];
  for (const describeServicesCall of describeServicesCalls) {
    const services = describeServicesCall._result.flatMap(
      (result) => result.services ?? [],
    );
    for (const service of services) {
      state.push({
        $metadata: {
          version: "0.1.0",
          timestamp: describeServicesCall._metadata.timestamp,
        },
        $graph: {
          id: service.serviceArn!,
          label: service.serviceName!,
          parent: service.clusterArn,
          nodeType: "ecs-service",
        },
        $source: {
          command: "DescribeServices",
          parameters: describeServicesCall._parameters,
        },
        tenant: {
          tenantId: context.account,
          provider: "aws",
          partition: context.partition,
        },
        location: {
          code: context.region,
        },
        resource: {
          id: service.serviceArn!,
          name: service.serviceName!,
          category: "ecs",
          subcategory: "service",
        },
        ecs: {
          platform: {
            version: service.platformVersion,
            family: service.platformFamily,
          },
          service: translateServiceDataToSchema(service),
          deployments: translateServiceDeployments(service),
        },
        network: translateServiceNetworkConfig(service),
        audit: {
          createdAt: service.createdAt,
          createdBy: service.createdBy,
        },
        iam: {
          roles:
            service.roleArn != null
              ? [
                  {
                    label: "service-role",
                    arn: service.roleArn,
                  },
                ]
              : [],
        },
        loadBalancers: service.loadBalancers,
        tags: service.tags,
        healthcheck: {
          gracePeriod: {
            value: service.healthCheckGracePeriodSeconds,
            unit: Unit.Second,
          },
        },
      });
    }
  }
  return state;
}

function translateTaskDataToSchema(task: Task): ECSTask {
  return {
    version: task.version,
    attachments: task.attachments,
    attributes: task.attributes,
    capacityProviderName: task.capacityProviderName,
    connectivity: task.connectivity,
    connectivityAt: task.connectivityAt,
    containerInstanceArn: task.containerInstanceArn,
    containers: task.containers,
    cpu: task.cpu,
    desiredStatus: task.desiredStatus,
    enableExecuteCommand: task.enableExecuteCommand,
    executionStoppedAt: task.executionStoppedAt,
    group: task.group,
    healthStatus: task.healthStatus,
    inferenceAccelerators: task.inferenceAccelerators,
    lastStatus: task.lastStatus,
    launchType: task.launchType,
    memory: task.memory,
    overrides: task.overrides,
    pullStartedAt: task.pullStartedAt,
    pullStoppedAt: task.pullStoppedAt,
    startedAt: task.startedAt,
    startedBy: task.startedBy,
    stopCode: task.stopCode,
    stoppedAt: task.stoppedAt,
    stoppedReason: task.stoppedReason,
    stoppingAt: task.stoppingAt,
    tags: task.tags,
    taskArn: task.taskArn,
    taskDefinitionArn: task.taskDefinitionArn,
    ephemeralStorage: task.ephemeralStorage,
    fargateEphemeralStorage: task.fargateEphemeralStorage,
  };
}

async function getTaskNodes(stateConnector: Connector, context: AwsContext) {
  nodesDebug("Fetching ECS task nodes");
  const describeTasksCalls = await evaluateSelector<
    State<DescribeTasksCommandOutput[], DescribeTasksCommandInput>
  >(context.account, context.region, SELECTORS.standaloneTasks, stateConnector);

  const state: ECSState<DescribeTasksCommandInput>[] = [];
  for (const describeTasksCall of describeTasksCalls) {
    const tasks = describeTasksCall._result.flatMap(
      (result) => result.tasks ?? [],
    );
    for (const task of tasks) {
      state.push({
        $metadata: {
          version: "0.1.0",
          timestamp: describeTasksCall._metadata.timestamp,
        },
        $graph: {
          id: task.taskArn!,
          label: task.taskArn!,
          parent: task.clusterArn,
          nodeType: "ecs-task",
        },
        $source: {
          command: "DescribeTasks",
          parameters: describeTasksCall._parameters,
        },
        tenant: {
          tenantId: context.account,
          provider: "aws",
          partition: context.partition,
        },
        location: {
          code: context.region,
          zone: task.availabilityZone,
        },
        resource: {
          id: task.taskArn!,
          name: task.taskArn!,
          category: "ecs",
          subcategory: "task",
        },
        ecs: {
          platform: {
            version: task.platformVersion,
            family: task.platformFamily,
          },
          task: translateTaskDataToSchema(task),
        },
        network: {
          ...translateServiceNetworkConfig(task),
        },
        audit: {
          createdAt: task.createdAt,
        },
        tags: task.tags,
        healthcheck: {
          status: task.healthStatus,
        },
      });
    }
  }
  return state;
}

export async function _getNodes(
  stateConnector: Connector,
  context: AwsContext,
) {
  const clusters = await getClusterNodes(stateConnector, context);
  const services = await getServiceNodes(stateConnector, context);
  const tasks = await getTaskNodes(stateConnector, context);
  return [...clusters, ...services, ...tasks];
}

export async function getNodes(
  stateConnector: Connector,
  context: AwsContext,
): Promise<SelectedNode[]> {
  nodesDebug("Fetching nodes");
  const state: SelectedNode[] = [];
  nodesDebug(
    "Evaluating ECS|DescribeClusters|[]._result.clusters | [].{id:clusterArn,name:clusterName,type:`ECS-Cluster`,rawState:@}",
  );
  const DescribeClustersNodes = await evaluateSelector<any>(
    context.account,
    context.region,
    "ECS|DescribeClusters|[]._result.clusters | [].{id:clusterArn,name:clusterName,type:`ECS-Cluster`,rawState:@}",
    stateConnector,
  );
  nodesDebug(
    `Evaluated ECS|DescribeClusters|[]._result.clusters | [].{id:clusterArn,name:clusterName,type:\`ECS-Cluster\`,rawState:@}: ${DescribeClustersNodes.length} Nodes found`,
  );
  state.push(...DescribeClustersNodes);
  nodesDebug(
    "Evaluating ECS|DescribeServices|[]._result.services | [].{id:serviceArn,parent:clusterArn,name:serviceName,type:`ECS-Service`,rawState:@}",
  );
  const DescribeServicesNodes = await evaluateSelector<any>(
    context.account,
    context.region,
    "ECS|DescribeServices|[]._result.services | [].{id:serviceArn,parent:clusterArn,name:serviceName,type:`ECS-Service`,rawState:@}",
    stateConnector,
  );
  nodesDebug(
    `Evaluated ECS|DescribeServices|[]._result.services | [].{id:serviceArn,parent:clusterArn,name:serviceName,type:\`ECS-Service\`,rawState:@}: ${DescribeServicesNodes.length} Nodes found`,
  );
  state.push(...DescribeServicesNodes);
  nodesDebug(
    "Evaluating ECS|DescribeServices|[]._result.services | [].{id:taskDefinition,parent:serviceArn,type:`ECS-Task`,rawState:@}",
  );
  const DescribeServicesNodes2 = await evaluateSelector<any>(
    context.account,
    context.region,
    "ECS|DescribeServices|[]._result.services | [].{id:taskDefinition,parent:serviceArn,type:`ECS-Task`,rawState:@}",
    stateConnector,
  );
  nodesDebug(
    `Evaluated ECS|DescribeServices|[]._result.services | [].{id:taskDefinition,parent:serviceArn,type:\`ECS-Task\`,rawState:@}: ${DescribeServicesNodes2.length} Nodes found`,
  );
  state.push(...DescribeServicesNodes2);
  nodesDebug(
    "Evaluating ECS|DescribeTasks|[]._result.tasks | [].{id:taskDefinitionArn,parent:clusterArn,type:`ECS-Task`,rawState:@}",
  );
  const DescribeTasksNodes = await evaluateSelector<any>(
    context.account,
    context.region,
    "ECS|DescribeTasks|[]._result.tasks | [].{id:taskDefinitionArn,parent:clusterArn,type:`ECS-Task`,rawState:@}",
    stateConnector,
  );
  nodesDebug(
    `Evaluated ECS|DescribeTasks|[]._result.tasks | [].{id:taskDefinitionArn,parent:clusterArn,type:\`ECS-Task\`,rawState:@}: ${DescribeTasksNodes.length} Nodes found`,
  );
  state.push(...DescribeTasksNodes);

  return state.map((node) => formatNode(node, "ECS", context, true));
}
