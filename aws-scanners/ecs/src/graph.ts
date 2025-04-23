import {
  evaluateSelector,
  formatNode,
  toLowerCase,
  Time,
} from "@infrascan/core";
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
  KeyValuePair,
  Task,
} from "@aws-sdk/client-ecs";
import type {
  Connector,
  AwsContext,
  SelectedNode,
  BaseState,
  State,
  KVPair,
  TranslatedEntity,
  WithCallContext,
} from "@infrascan/shared-types";

import type { ECS } from "./types";

const nodesDebug = debug("ecs:nodes");

export type ECSState<T> = BaseState<T> & { ecs: ECS };

function mapKvPair<T extends { name?: string; value?: string }>(
  kvPair: T,
): KVPair {
  return { key: kvPair.name, value: kvPair.value };
}

export const ClusterEntity: TranslatedEntity<
  ECSState<DescribeClustersCommandInput>,
  State<DescribeClustersCommandOutput, DescribeClustersCommandInput>,
  WithCallContext<AwsCluster, DescribeClustersCommandInput>
> = {
  version: "0.1.0",
  debugLabel: "ecs-clusters",
  provider: "aws",
  command: "DescribeClusters",
  category: "ecs",
  subcategory: "clusters",
  nodeType: "ecs-cluster",
  selector: "ECS|DescribeClusters|[]",

  getState(stateConnector, context) {
    return evaluateSelector(
      context.account,
      context.region,
      ClusterEntity.selector,
      stateConnector,
    );
  },
  translate(val) {
    return (val._result.clusters ?? []).map((cluster) =>
      Object.assign(cluster, {
        $parameters: val._parameters,
        $metadata: val._metadata,
      }),
    );
  },
  components: {
    $metadata(val) {
      return {
        version: ClusterEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },
    $graph(val) {
      return {
        id: val.clusterArn!,
        label: val.clusterName!,
        nodeType: ClusterEntity.nodeType,
        parent: `${val.$metadata.account}-${val.$metadata.region}`,
      };
    },
    $source(val) {
      return {
        command: ClusterEntity.command,
        parameters: val.$parameters,
      };
    },
    tenant(val) {
      return {
        tenantId: val.$metadata.account,
        provider: ClusterEntity.provider,
        partition: val.$metadata.partition,
      };
    },
    location(val) {
      return {
        code: val.$metadata.region,
      };
    },
    resource(val) {
      return {
        id: val.clusterArn!,
        name: val.clusterName!,
        category: ClusterEntity.category,
        subcategory: ClusterEntity.subcategory,
      };
    },
    ecs(val) {
      return {
        cluster: {
          executeCommandConfiguration:
            val.configuration?.executeCommandConfiguration,
          managedStorageConfiguration:
            val.configuration?.managedStorageConfiguration,
          registeredContainerInstancesCount:
            val.registeredContainerInstancesCount,
          runningTasksCount: val.runningTasksCount,
          pendingTasksCount: val.pendingTasksCount,
          activeServicesCount: val.activeServicesCount,
          statistics: val.statistics?.map(mapKvPair),
          settings: val.settings?.map(mapKvPair),
          capacityProviders: val.capacityProviders,
          defaultCapacityProviderStrategy: val.defaultCapacityProviderStrategy,
          attachments: val.attachments,
          attachmentStatus: val.attachmentsStatus,
          serviceConnectDefaults: val.serviceConnectDefaults,
          status: val.status,
        },
      };
    },
    tags(val) {
      return val.tags;
    },
  },
};

export const ServiceEntity: TranslatedEntity<
  ECSState<DescribeServicesCommandInput>,
  State<DescribeServicesCommandOutput, DescribeServicesCommandInput>,
  WithCallContext<AwsService, DescribeServicesCommandInput>
> = {
  version: "0.1.0",
  debugLabel: "ecs-services",
  provider: "aws",
  command: "DescribeServices",
  category: "ecs",
  subcategory: "services",
  nodeType: "ecs-service",
  selector: "ECS|DescribeServices|[]",

  async getState(stateConnector: Connector, context: AwsContext) {
    return evaluateSelector(
      context.account,
      context.region,
      ServiceEntity.selector,
      stateConnector,
    );
  },

  translate(val) {
    return (val._result.services ?? []).map((service) =>
      Object.assign(service, {
        $parameters: val._parameters,
        $metadata: val._metadata,
      }),
    );
  },

  components: {
    $graph(val) {
      return {
        id: val.serviceArn!,
        label: val.serviceName!,
        parent: val.clusterArn!,
        nodeType: ServiceEntity.nodeType,
      };
    },
    $metadata(val) {
      return {
        version: ServiceEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },
    $source(val) {
      return {
        command: ServiceEntity.command,
        parameters: val.$parameters,
      };
    },
    tenant(val) {
      return {
        tenantId: val.$metadata.account,
        partition: val.$metadata.partition,
        provider: ServiceEntity.provider,
      };
    },
    location(val) {
      return {
        code: val.$metadata.region,
      };
    },
    resource(val) {
      return {
        id: val.serviceArn!,
        name: val.serviceName!,
        category: ServiceEntity.category,
        subcategory: ServiceEntity.subcategory,
      };
    },
    ecs(val) {
      return {
        platform: {
          version: val.platformVersion,
          family: val.platformFamily,
        },
        service: {
          serviceRegistries: val.serviceRegistries,
          status: val.status,
          launchType: val.launchType,
          capacityProviderStrategy: val.capacityProviderStrategy,
          taskDefinition: val.taskDefinition,
          desiredCount: val.desiredCount,
          runningCount: val.runningCount,
          pendingCount: val.pendingCount,
          placement: {
            constraints: val.placementConstraints,
            strategy: val.placementStrategy,
          },
          schedulingStrategy: val.schedulingStrategy
            ? toLowerCase(val.schedulingStrategy)
            : undefined,
        },
        deployments: {
          circuitBreaker: val.deploymentConfiguration?.deploymentCircuitBreaker,
          alarms: val.deploymentConfiguration?.alarms,
          rollout: {
            minimumHealthyPct:
              val.deploymentConfiguration?.minimumHealthyPercent,
            maximumHealthyPct: val.deploymentConfiguration?.maximumPercent,
          },
          controller: val.deploymentController,
        },
      };
    },
    network(val) {
      const publicIpStatus =
        val.networkConfiguration?.awsvpcConfiguration?.assignPublicIp ===
        "ENABLED"
          ? "enabled"
          : "disabled";
      return {
        publicIp: {
          status: publicIpStatus,
        },
        securityGroups:
          val.networkConfiguration?.awsvpcConfiguration?.securityGroups,
        targetSubnets: val.networkConfiguration?.awsvpcConfiguration?.subnets,
      };
    },
    audit(val) {
      return {
        createdAt: val.createdAt,
        createdBy: val.createdBy,
      };
    },
    iam(val) {
      return {
        roles:
          val.roleArn != null
            ? [{ label: "service-role", arn: val.roleArn }]
            : [],
      };
    },
    loadBalancers(val) {
      return val.loadBalancers;
    },
    tags(val) {
      return val.tags;
    },
    healthcheck(val) {
      if (val.healthCheckGracePeriodSeconds == null) {
        return undefined;
      }

      return {
        gracePeriod: {
          value: val.healthCheckGracePeriodSeconds,
          unit: Time.Seconds,
        },
      };
    },
  },
};

interface EniDetails {
  subnetId?: string;
  networkInterfaceId?: string;
  macAddress?: string;
  privateDnsName?: string;
  privateIPv4Address?: string;
}

export const TaskEntity: TranslatedEntity<
  ECSState<DescribeTasksCommandInput>,
  State<DescribeTasksCommandOutput, DescribeTasksCommandInput>,
  WithCallContext<Task, DescribeTasksCommandInput>
> = {
  version: "0.1.0",
  debugLabel: "ecs-tasks",
  provider: "aws",
  command: "DescribeTasks",
  category: "ecs",
  subcategory: "tasks",
  nodeType: "ecs-task",
  selector: "ECS|DescribeTasks|[]",

  getState(stateConnector, context) {
    return evaluateSelector(
      context.account,
      context.region,
      TaskEntity.selector,
      stateConnector,
    );
  },
  translate(val) {
    return (val._result.tasks ?? []).map((task) =>
      Object.assign(task, {
        $parameters: val._parameters,
        $metadata: val._metadata,
      }),
    );
  },
  components: {
    $metadata(val) {
      return {
        version: TaskEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },
    $graph(val) {
      let parent = val.clusterArn;
      if (val.group?.startsWith("service:") && val.clusterArn != null) {
        // Cluster ARN: arn:aws:ecs:region:account:cluster/cluster-name
        // Service ARN: arn:aws:ecs:region:account:service/cluster-name/service-name
        const clusterName = val.clusterArn.slice(
          val.clusterArn.lastIndexOf("/") + 1,
        );
        const serviceName = val.group.slice(8);
        parent = `arn:aws:ecs:${val.$metadata.region}:${val.$metadata.account}:service/${clusterName}/${serviceName}`;
      }

      const startOfTaskDefName = val.taskDefinitionArn?.lastIndexOf("/");
      const label = startOfTaskDefName
        ? val.taskDefinitionArn?.slice(startOfTaskDefName + 1)
        : val.taskArn;

      return {
        id: val.taskDefinitionArn ?? val.taskArn!,
        label: label!,
        parent,
        nodeType: TaskEntity.nodeType,
      };
    },
    $source(val) {
      return {
        command: TaskEntity.command,
        parameters: val.$parameters,
      };
    },
    tenant(val) {
      return {
        tenantId: val.$metadata.account,
        provider: TaskEntity.provider,
        partition: val.$metadata.partition,
      };
    },
    location(val) {
      return {
        code: val.$metadata.region,
        zone: val.availabilityZone ? [val.availabilityZone] : [],
      };
    },
    resource(val) {
      const startOfTaskDefName = val.taskDefinitionArn?.lastIndexOf("/");
      const label = startOfTaskDefName
        ? val.taskDefinitionArn?.slice(startOfTaskDefName + 1)
        : val.taskArn;

      return {
        id: val.taskDefinitionArn ?? val.taskArn!,
        name: label!,
        category: TaskEntity.category,
        subcategory: TaskEntity.subcategory,
      };
    },
    ecs(val) {
      return {
        platform: {
          version: val.platformVersion,
          family: val.platformFamily,
        },
        task: {
          version: val.version,
          attachments: val.attachments,
          attributes: val.attributes,
          capacityProviderName: val.capacityProviderName,
          connectivity: val.connectivity,
          connectivityAt: val.connectivityAt,
          containerInstanceArn: val.containerInstanceArn,
          containers: val.containers,
          cpu: val.cpu,
          desiredStatus: val.desiredStatus,
          enableExecuteCommand: val.enableExecuteCommand,
          executionStoppedAt: val.executionStoppedAt,
          group: val.group,
          healthStatus: val.healthStatus,
          inferenceAccelerators: val.inferenceAccelerators,
          lastStatus: val.lastStatus,
          launchType: val.launchType,
          memory: val.memory,
          overrides: val.overrides,
          pullStartedAt: val.pullStartedAt,
          pullStoppedAt: val.pullStoppedAt,
          startedAt: val.startedAt,
          startedBy: val.startedBy,
          stopCode: val.stopCode,
          stoppedAt: val.stoppedAt,
          stoppedReason: val.stoppedReason,
          stoppingAt: val.stoppingAt,
          tags: val.tags,
          taskArn: val.taskArn,
          taskDefinitionArn: val.taskDefinitionArn,
          ephemeralStorage: val.ephemeralStorage,
          fargateEphemeralStorage: val.fargateEphemeralStorage,
        },
      };
    },
    audit(val) {
      return {
        createdAt: val.createdAt,
      };
    },
    tags(val) {
      return val.tags;
    },
    healthcheck(val) {
      return {
        status: val.healthStatus,
      };
    },

    network(val) {
      const eniAttachment = val.attachments?.find(
        ({ type }) => type === "ElasticNetworkInterface",
      );

      const eniDetails = Object.fromEntries(
        eniAttachment?.details
          ?.filter(
            (entry): entry is Required<KeyValuePair> =>
              entry.name != null && entry.value != null,
          )
          ?.map(({ name, value }) => [name, value]) ?? [],
      ) as EniDetails;

      return {
        assignedAddresses: {
          ipv4: eniDetails.privateIPv4Address,
        },
        targetSubnets: eniDetails.subnetId ? [eniDetails.subnetId] : [],
        attachedEni: {
          interfaceId: eniDetails.networkInterfaceId,
          macAddress: eniDetails.macAddress,
        },
      };
    },
  },
};

export const entities = [ClusterEntity, ServiceEntity, TaskEntity];
