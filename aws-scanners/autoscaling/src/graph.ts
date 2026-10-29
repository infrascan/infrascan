import type {
  AutoScalingGroup,
  DescribeAutoScalingGroupsCommandInput,
  DescribeAutoScalingGroupsCommandOutput,
  DescribeLifecycleHooksAnswer,
  LaunchTemplateSpecification,
  LifecycleHook,
  PoliciesType,
  ScalingPolicy,
} from "@aws-sdk/client-auto-scaling";
import { evaluateSelector, Time, tryNormalizeDateEpoch } from "@infrascan/core";
import type {
  AwsContext,
  BaseState,
  Connector,
  QualifiedMeasure,
  Serialized,
  State,
  TimeUnit,
  TranslatedEntity,
  WithCallContext,
} from "@infrascan/shared-types";

export interface AutoScalingLaunchTemplate {
  id?: string;
  name?: string;
  version?: string;
}

export interface AutoScalingCapacity {
  min?: number;
  max?: number;
  desired?: number;
  desiredCapacityType?: string;
  predicted?: number;
}

export interface AutoScalingInstancesDistribution {
  onDemandAllocationStrategy?: string;
  onDemandBaseCapacity?: number;
  onDemandPercentageAboveBaseCapacity?: number;
  spotAllocationStrategy?: string;
  spotInstancePools?: number;
  spotMaxPrice?: string;
}

export interface AutoScalingLaunchTemplateOverride {
  instanceType?: string;
  weightedCapacity?: string;
  launchTemplate?: AutoScalingLaunchTemplate;
}

export interface AutoScalingMixedInstancesPolicy {
  launchTemplate?: AutoScalingLaunchTemplate;
  overrides?: AutoScalingLaunchTemplateOverride[];
  instancesDistribution?: AutoScalingInstancesDistribution;
}

export interface AutoScalingPolicy {
  name?: string;
  arn?: string;
  type?: string;
  adjustmentType?: string;
  scalingAdjustment?: number;
  cooldown?: QualifiedMeasure<TimeUnit>;
  enabled?: boolean;
  alarms?: string[];
}

export interface AutoScalingLifecycleHook {
  name?: string;
  transition?: string;
  notificationTargetArn?: string;
  roleArn?: string;
  heartbeatTimeout?: QualifiedMeasure<TimeUnit>;
  defaultResult?: string;
}

export interface AutoScalingGroupDetails {
  status?: string;
  capacity: AutoScalingCapacity;
  healthCheckType?: string;
  instanceCount: number;
  launchConfigurationName?: string;
  launchTemplate?: AutoScalingLaunchTemplate;
  mixedInstancesPolicy?: AutoScalingMixedInstancesPolicy;
  targetGroupArns?: string[];
  loadBalancerNames?: string[];
  terminationPolicies?: string[];
  defaultCooldown?: QualifiedMeasure<TimeUnit>;
  maxInstanceLifetime?: QualifiedMeasure<TimeUnit>;
  capacityRebalance?: boolean;
  newInstancesProtectedFromScaleIn?: boolean;
  placementGroup?: string;
  suspendedProcesses?: string[];
  enabledMetrics?: string[];
  policies: AutoScalingPolicy[];
  lifecycleHooks: AutoScalingLifecycleHook[];
}

export interface AutoScalingGroupState
  extends BaseState<DescribeAutoScalingGroupsCommandInput> {
  autoScalingGroup: AutoScalingGroupDetails;
}

export type GraphState = AutoScalingGroupState;

/**
 * Raw DescribeAutoScalingGroups state, enriched with the scaling policies and lifecycle hooks
 * scanned for the same account and region so they can be attached to their owning group.
 */
export type AutoScalingGroupsRawState = State<
  DescribeAutoScalingGroupsCommandOutput,
  DescribeAutoScalingGroupsCommandInput
> & {
  $policies?: ScalingPolicy[];
  $lifecycleHooks?: LifecycleHook[];
};

type AutoScalingGroupWithRelations = AutoScalingGroup & {
  $policies: ScalingPolicy[];
  $lifecycleHooks: LifecycleHook[];
};

function toSeconds(value?: number): QualifiedMeasure<TimeUnit> | undefined {
  return value != null ? { value, unit: Time.Seconds } : undefined;
}

function toLaunchTemplate(
  spec?: Serialized<LaunchTemplateSpecification>,
): AutoScalingLaunchTemplate | undefined {
  if (spec == null) {
    return undefined;
  }
  return {
    id: spec.LaunchTemplateId,
    name: spec.LaunchTemplateName,
    version: spec.Version,
  };
}

/**
 * Splits the comma separated `VPCZoneIdentifier` into its subnet IDs
 */
export function parseVpcZoneIdentifier(identifier?: string): string[] {
  return (identifier ?? "")
    .split(",")
    .map((subnetId) => subnetId.trim())
    .filter((subnetId) => subnetId.length > 0);
}

export const AutoScalingGroupEntity: TranslatedEntity<
  AutoScalingGroupState,
  AutoScalingGroupsRawState,
  WithCallContext<
    AutoScalingGroupWithRelations,
    DescribeAutoScalingGroupsCommandInput
  >
> = {
  version: "0.1.0",
  debugLabel: "auto-scaling-group",
  provider: "aws",
  command: "DescribeAutoScalingGroups",
  category: "auto-scaling",
  subcategory: "auto-scaling-group",
  nodeType: "auto-scaling-group",
  selector: "AutoScaling|DescribeAutoScalingGroups|[]",

  async getState(state: Connector, context: AwsContext) {
    const [groupsState, policiesState, lifecycleHooksState] = await Promise.all(
      [
        evaluateSelector<Serialized<AutoScalingGroupsRawState>>(
          context.account,
          context.region,
          AutoScalingGroupEntity.selector,
          state,
        ),
        evaluateSelector<Serialized<State<PoliciesType>>>(
          context.account,
          context.region,
          "AutoScaling|DescribePolicies|[]",
          state,
        ),
        evaluateSelector<Serialized<State<DescribeLifecycleHooksAnswer>>>(
          context.account,
          context.region,
          "AutoScaling|DescribeLifecycleHooks|[]",
          state,
        ),
      ],
    );

    const policies = (policiesState ?? []).reduce<Serialized<ScalingPolicy>[]>(
      (acc, { _result }) => acc.concat(_result?.ScalingPolicies ?? []),
      [],
    );
    const lifecycleHooks = (lifecycleHooksState ?? []).reduce<
      Serialized<LifecycleHook>[]
    >((acc, { _result }) => acc.concat(_result?.LifecycleHooks ?? []), []);

    return (groupsState ?? []).map((groupState) => ({
      ...groupState,
      $policies: policies,
      $lifecycleHooks: lifecycleHooks,
    }));
  },

  translate(val) {
    return (
      val._result.AutoScalingGroups?.map((group) => ({
        ...group,
        $metadata: val._metadata,
        $parameters: val._parameters,
        $policies: (val.$policies ?? []).filter(
          (policy) =>
            policy.AutoScalingGroupName === group.AutoScalingGroupName,
        ),
        $lifecycleHooks: (val.$lifecycleHooks ?? []).filter(
          (hook) => hook.AutoScalingGroupName === group.AutoScalingGroupName,
        ),
      })) ?? []
    );
  },

  components: {
    $metadata(val) {
      return {
        version: AutoScalingGroupEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: val.AutoScalingGroupARN!,
        label: val.AutoScalingGroupName!,
        nodeClass: "visual",
        nodeType: AutoScalingGroupEntity.nodeType,
        parent: `${val.$metadata.account}-${val.$metadata.region}`,
      };
    },

    $source(val) {
      return {
        command: AutoScalingGroupEntity.command,
        parameters: val.$parameters,
      };
    },

    tenant(val) {
      return {
        tenantId: val.$metadata.account,
        provider: AutoScalingGroupEntity.provider,
        partition: val.$metadata.partition,
      };
    },

    location(val) {
      return {
        code: val.$metadata.region,
        zone: val.AvailabilityZones?.length ? val.AvailabilityZones : undefined,
      };
    },

    resource(val) {
      return {
        id: val.AutoScalingGroupARN!,
        name: val.AutoScalingGroupName!,
        category: AutoScalingGroupEntity.category,
        subcategory: AutoScalingGroupEntity.subcategory,
      };
    },

    audit(val) {
      return {
        createdAt: tryNormalizeDateEpoch(val.CreatedTime),
      };
    },

    tags(val) {
      return (
        val.Tags?.map((tag) => ({
          key: tag.Key,
          value: tag.Value,
        })) ?? []
      );
    },

    iam(val) {
      return {
        roles:
          val.ServiceLinkedRoleARN != null
            ? [{ label: "service-linked", arn: val.ServiceLinkedRoleARN }]
            : [],
      };
    },

    healthcheck(val) {
      return {
        gracePeriod: toSeconds(val.HealthCheckGracePeriod),
      };
    },

    loadBalancers(val) {
      const targetGroups =
        val.TargetGroupARNs?.map((targetGroupArn) => ({ targetGroupArn })) ??
        [];
      const classicLoadBalancers =
        val.LoadBalancerNames?.map((name) => ({ name })) ?? [];
      return [...targetGroups, ...classicLoadBalancers];
    },

    network(val) {
      const subnets = parseVpcZoneIdentifier(val.VPCZoneIdentifier);
      return {
        targetSubnets: subnets.length > 0 ? subnets : undefined,
      };
    },

    autoScalingGroup(val) {
      const mixedInstancesPolicy = val.MixedInstancesPolicy;
      const distribution = mixedInstancesPolicy?.InstancesDistribution;
      return {
        status: val.Status,
        capacity: {
          min: val.MinSize,
          max: val.MaxSize,
          desired: val.DesiredCapacity,
          desiredCapacityType: val.DesiredCapacityType,
          predicted: val.PredictedCapacity,
        },
        healthCheckType: val.HealthCheckType,
        instanceCount: val.Instances?.length ?? 0,
        launchConfigurationName: val.LaunchConfigurationName,
        launchTemplate: toLaunchTemplate(val.LaunchTemplate),
        mixedInstancesPolicy:
          mixedInstancesPolicy != null
            ? {
                launchTemplate: toLaunchTemplate(
                  mixedInstancesPolicy.LaunchTemplate
                    ?.LaunchTemplateSpecification,
                ),
                overrides: mixedInstancesPolicy.LaunchTemplate?.Overrides?.map(
                  (override) => ({
                    instanceType: override.InstanceType,
                    weightedCapacity: override.WeightedCapacity,
                    launchTemplate: toLaunchTemplate(
                      override.LaunchTemplateSpecification,
                    ),
                  }),
                ),
                instancesDistribution:
                  distribution != null
                    ? {
                        onDemandAllocationStrategy:
                          distribution.OnDemandAllocationStrategy,
                        onDemandBaseCapacity: distribution.OnDemandBaseCapacity,
                        onDemandPercentageAboveBaseCapacity:
                          distribution.OnDemandPercentageAboveBaseCapacity,
                        spotAllocationStrategy:
                          distribution.SpotAllocationStrategy,
                        spotInstancePools: distribution.SpotInstancePools,
                        spotMaxPrice: distribution.SpotMaxPrice,
                      }
                    : undefined,
              }
            : undefined,
        targetGroupArns: val.TargetGroupARNs,
        loadBalancerNames: val.LoadBalancerNames,
        terminationPolicies: val.TerminationPolicies,
        defaultCooldown: toSeconds(val.DefaultCooldown),
        maxInstanceLifetime: toSeconds(val.MaxInstanceLifetime),
        capacityRebalance: val.CapacityRebalance,
        newInstancesProtectedFromScaleIn: val.NewInstancesProtectedFromScaleIn,
        placementGroup: val.PlacementGroup,
        suspendedProcesses: val.SuspendedProcesses?.map(
          ({ ProcessName }) => ProcessName,
        ).filter((name): name is string => name != null),
        enabledMetrics: val.EnabledMetrics?.map(({ Metric }) => Metric).filter(
          (metric): metric is string => metric != null,
        ),
        policies: val.$policies.map((policy) => ({
          name: policy.PolicyName,
          arn: policy.PolicyARN,
          type: policy.PolicyType,
          adjustmentType: policy.AdjustmentType,
          scalingAdjustment: policy.ScalingAdjustment,
          cooldown: toSeconds(policy.Cooldown),
          enabled: policy.Enabled,
          alarms: policy.Alarms?.map(({ AlarmARN }) => AlarmARN).filter(
            (arn): arn is string => arn != null,
          ),
        })),
        lifecycleHooks: val.$lifecycleHooks.map((hook) => ({
          name: hook.LifecycleHookName,
          transition: hook.LifecycleTransition,
          notificationTargetArn: hook.NotificationTargetARN,
          roleArn: hook.RoleARN,
          heartbeatTimeout: toSeconds(hook.HeartbeatTimeout),
          defaultResult: hook.DefaultResult,
        })),
      };
    },
  },
};
