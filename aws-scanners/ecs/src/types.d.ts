import type {
  PlacementConstraint,
  PlacementStrategy,
  SchedulingStrategy,
  LoadBalancer,
} from "@aws-sdk/client-ecs";
import type { KVPair } from "@infrascan/shared-types";

export interface Platform {
  family?: string;
  version?: string;
}

export interface CapacityProviderStrategy {
  weight?: number;
  base?: number;
  capacityProvider?: string;
}

export interface Attachment {
  id?: string;
  type?: string;
  status?: string;
  details?: KVPair[];
}

export interface LogConfiguration {
  cloudwatchLogGroupName?: string;
  cloudwatchEncryptionEnabled?: boolean;
  s3BucketName?: string;
  s3EncryptionEnabled?: boolean;
  s3KeyPrefix?: string;
}

export interface ExecuteCommandConfiguration {
  kmsKeyId?: string;
  logging?: string;
  logConfiguration?: LogConfiguration;
}

export interface ClusterStorageConfiguration {
  kmsKeyId?: string;
  fargateEphemeralStorageKmsKeyId?: string;
}

export interface Cluster {
  executeCommandConfiguration?: ExecuteCommandConfiguration;
  managedStorageConfiguration?: ClusterStorageConfiguration;
  registeredContainerInstancesCount?: number;
  runningTasksCount?: number;
  pendingTasksCount?: number;
  activeServicesCount?: number;
  statistics?: KVPair[];
  settings?: KVPair[];
  capacityProviders?: string[];
  defaultCapacityProviderStrategy?: CapacityProviderStrategy[];
  attachments?: Attachment[];
  attachmentStatus?: string;
  serviceConnectDefaults?: {
    namespace?: string;
  };
  status?: string;
}

export interface Alarms {
  name?: string[];
  enable?: boolean;
  rollback?: boolean;
}

export interface CircuitBreaker {
  enable?: boolean;
  rollback?: boolean;
}

export interface Rollout {
  maximumHealthyPct?: number;
  minimumHealthyPct?: number;
}

export interface Controller {
  type?: string;
}

export interface Deployments {
  alarms?: Alarms;
  circuitBreaker?: CircuitBreaker;
  rollout?: Rollout;
  controller?: Controller;
}

export interface ServiceRegistry {
  registryArn?: string;
  port?: number;
  containerName?: string;
  containerPort?: number;
}

export interface Service {
  serviceRegistries?: ServiceRegistry[];
  status?: string;
  launchType?: string;
  capacityProviderStrategy?: CapacityProviderStrategy[];
  taskDefinition?: string;
  desiredCount?: number;
  runningCount?: number;
  pendingCount?: number;
  placement?: {
    strategy?: PlacementStrategy[];
    constraints?: PlacementConstraint[];
  };
  schedulingStrategy?: Lowercase<SchedulingStrategy>;
  loadBalancers?: LoadBalancer[];
}

// Network related interfaces
export interface NetworkBinding {
  bindIP?: string;
  containerPort?: number;
  hostPort?: number;
  protocol?: string;
  containerPortRange?: string;
  hostPortRange?: string;
}

export interface NetworkInterface {
  attachmentId?: string;
  privateIpv4Address?: string;
  ipv6Address?: string;
}

// Agent and resource related interfaces
export interface ManagedAgent {
  lastStartedAt?: string | Date;
  name?: string;
  reason?: string;
  lastStatus?: string;
}

export interface ResourceRequirement {
  value?: string;
  type?: string;
}

export interface InferenceAccelerator {
  deviceName?: string;
  deviceType?: string;
}

export interface EphemeralStorage {
  sizeInGiB?: number;
}

export interface FargateEphemeralStorage extends EphemeralStorage {
  kmsKeyId?: string;
}

// Environment configurations
export interface EnvironmentFile {
  value?: string;
  type?: string;
}

export interface Attribute {
  name?: string;
  value?: string;
  targetType?: string;
  targetId?: string;
}

// Container configurations
export interface ContainerOverride {
  name?: string;
  command?: string[];
  environment?: KVPair[];
  environmentFiles?: EnvironmentFile[];
  cpu?: number;
  memory?: number;
  memoryReservation?: number;
  resourceRequirements?: ResourceRequirement[];
}

export interface TaskOverrides {
  containerOverrides?: ContainerOverride[];
  cpu?: string;
  inferenceAcceleratorOverrides?: InferenceAccelerator[];
  executionRoleArn?: string;
  memory?: string;
  taskRoleArn?: string;
  ephemeralStorage?: EphemeralStorage;
}

export interface Container {
  containerArn?: string;
  taskArn?: string;
  name?: string;
  image?: string;
  imageDigest?: string;
  runtimeId?: string;
  lastStatus?: string;
  exitCode?: number;
  reason?: string;
  networkBindings?: NetworkBinding[];
  networkInterfaces?: NetworkInterface[];
  healthStatus?: "HEALTHY" | string;
  managedAgents?: ManagedAgent[];
  cpu?: string;
  memory?: string;
  memoryReservation?: string;
  gpuIds?: string[];
}

// Main Task interface
export interface ECSTask {
  version?: number;
  attachments?: Attachment[];
  attributes?: Attribute[];
  capacityProviderName?: string;
  clusterArn?: string;
  connectivity?: string;
  connectivityAt?: string | Date;
  containerInstanceArn?: string;
  containers?: Container[];
  cpu?: string;
  createdAt?: string;
  desiredStatus?: string;
  enableExecuteCommand?: boolean;
  executionStoppedAt?: string | Date;
  group?: string;
  healthStatus?: "HEALTHY" | string;
  inferenceAccelerators?: InferenceAccelerator[];
  lastStatus?: string;
  launchType?: "EC2" | "FARGATE" | string;
  memory?: string;
  overrides?: TaskOverrides;
  platformVersion?: string;
  platformFamily?: string;
  pullStartedAt?: string | Date;
  pullStoppedAt?: string | Date;
  startedAt?: string | Date;
  startedBy?: string;
  stopCode?: string;
  stoppedAt?: string | Date;
  stoppedReason?: string;
  stoppingAt?: string | Date;
  tags?: KVPair[];
  taskArn?: string;
  taskDefinitionArn?: string;
  ephemeralStorage?: EphemeralStorage;
  fargateEphemeralStorage?: FargateEphemeralStorage;
}

export interface ECS {
  platform?: Platform;
  cluster?: Cluster;
  deployments?: Deployments;
  service?: Service;
  task?: ECSTask;
}
