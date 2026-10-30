import type {
  AutoScalingGroup,
  DescribeAutoScalingGroupsCommandOutput,
  DescribeLifecycleHooksAnswer,
  DescribeLifecycleHooksCommandInput,
  LaunchTemplateSpecification,
} from "@aws-sdk/client-auto-scaling";
import type { DescribeLaunchTemplatesCommandOutput } from "@aws-sdk/client-ec2";
import type { DescribeTargetGroupsCommandOutput } from "@aws-sdk/client-elastic-load-balancing-v2";
import { formatEdge } from "@infrascan/core";
import type {
  CommandCallMetadata,
  Connector,
  SelectedEdge,
  State,
} from "@infrascan/shared-types";

type ScopedGroup = AutoScalingGroup & { $metadata: CommandCallMetadata };

function scopeKey(metadata: CommandCallMetadata, name: string): string {
  return `${metadata.account}|${metadata.region}|${name}`;
}

/**
 * Lifecycle hook notification targets that are rendered as nodes by other scanners (SNS topics and SQS queues).
 */
const SUPPORTED_NOTIFICATION_TARGET = /^arn:[^:]+:(sns|sqs):/;

function dedupeEdges(edges: SelectedEdge[]): SelectedEdge[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = `${edge.source}->${edge.target}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function getAutoScalingGroups(
  connector: Connector,
): Promise<ScopedGroup[]> {
  const groupsState: State<DescribeAutoScalingGroupsCommandOutput>[] =
    await connector.getGlobalStateForServiceFunction(
      "AutoScaling",
      "DescribeAutoScalingGroups",
    );
  return (groupsState ?? []).reduce<ScopedGroup[]>(
    (acc, { _metadata, _result }) =>
      acc.concat(
        (_result?.AutoScalingGroups ?? []).map((group) => ({
          ...group,
          $metadata: _metadata,
        })),
      ),
    [],
  );
}

/**
 * Builds a lookup from (account, region, launch template name) to launch template ID, used to resolve
 * launch templates which are referenced by name rather than ID.
 */
async function getLaunchTemplateIdsByName(
  connector: Connector,
): Promise<Map<string, string>> {
  const launchTemplatesState: State<DescribeLaunchTemplatesCommandOutput>[] =
    await connector.getGlobalStateForServiceFunction(
      "EC2",
      "DescribeLaunchTemplates",
    );
  const lookup = new Map<string, string>();
  (launchTemplatesState ?? []).forEach(({ _metadata, _result }) => {
    _result?.LaunchTemplates?.forEach(
      ({ LaunchTemplateId, LaunchTemplateName }) => {
        if (LaunchTemplateId != null && LaunchTemplateName != null) {
          lookup.set(scopeKey(_metadata, LaunchTemplateName), LaunchTemplateId);
        }
      },
    );
  });
  return lookup;
}

function getLaunchTemplateSpecs(
  group: AutoScalingGroup,
): LaunchTemplateSpecification[] {
  const specs: (LaunchTemplateSpecification | undefined)[] = [
    group.LaunchTemplate,
    group.MixedInstancesPolicy?.LaunchTemplate?.LaunchTemplateSpecification,
    ...(group.MixedInstancesPolicy?.LaunchTemplate?.Overrides?.map(
      (override) => override.LaunchTemplateSpecification,
    ) ?? []),
  ];
  return specs.filter(
    (spec): spec is LaunchTemplateSpecification => spec != null,
  );
}

/**
 * Auto Scaling group -> EC2 launch template. Launch template nodes are keyed by their launch template ID,
 * so templates referenced by name are resolved against the scanned EC2 launch templates in the same account
 * and region. Unresolvable references are skipped.
 */
export function getLaunchTemplateEdges(
  groups: ScopedGroup[],
  launchTemplateIdsByName: Map<string, string>,
): SelectedEdge[] {
  return groups.reduce<SelectedEdge[]>((acc, group) => {
    const source = group.AutoScalingGroupARN;
    if (source == null) {
      return acc;
    }
    const edges = getLaunchTemplateSpecs(group)
      .map(({ LaunchTemplateId, LaunchTemplateName }) => {
        if (LaunchTemplateId != null) {
          return LaunchTemplateId;
        }
        if (LaunchTemplateName != null) {
          return launchTemplateIdsByName.get(
            scopeKey(group.$metadata, LaunchTemplateName),
          );
        }
        return undefined;
      })
      .filter((target): target is string => target != null)
      .map((target) =>
        formatEdge(source, {
          name: `${group.AutoScalingGroupName} Launch Template`,
          target,
        }),
      );
    return acc.concat(edges);
  }, []);
}

/**
 * Load balancer -> Auto Scaling group. Target groups are not rendered as nodes, so (consistent with the ELB
 * to ECS edges) the edge is drawn from each load balancer which forwards to the group's target groups.
 */
export function getLoadBalancerEdges(
  groups: ScopedGroup[],
  targetGroupsState: State<DescribeTargetGroupsCommandOutput>[],
): SelectedEdge[] {
  const targetGroups = new Map(
    (targetGroupsState ?? []).reduce<
      [string, { name?: string; loadBalancerArns: string[] }][]
    >(
      (acc, { _result }) =>
        acc.concat(
          (_result?.TargetGroups ?? [])
            .filter(({ TargetGroupArn }) => TargetGroupArn != null)
            .map(({ TargetGroupArn, TargetGroupName, LoadBalancerArns }) => [
              TargetGroupArn as string,
              {
                name: TargetGroupName,
                loadBalancerArns: LoadBalancerArns ?? [],
              },
            ]),
        ),
      [],
    ),
  );

  return groups.reduce<SelectedEdge[]>((acc, group) => {
    const target = group.AutoScalingGroupARN;
    if (target == null) {
      return acc;
    }
    const edges = (group.TargetGroupARNs ?? []).reduce<SelectedEdge[]>(
      (groupEdges, targetGroupArn) => {
        const targetGroup = targetGroups.get(targetGroupArn);
        if (targetGroup == null) {
          return groupEdges;
        }
        return groupEdges.concat(
          targetGroup.loadBalancerArns.map((loadBalancerArn) =>
            formatEdge(loadBalancerArn, {
              name: `${targetGroup.name ?? targetGroupArn}-LoadBalancing`,
              target,
            }),
          ),
        );
      },
      [],
    );
    return acc.concat(edges);
  }, []);
}

/**
 * Auto Scaling group -> lifecycle hook notification target (SNS topic or SQS queue).
 */
export function getLifecycleHookEdges(
  groups: ScopedGroup[],
  lifecycleHooksState: State<
    DescribeLifecycleHooksAnswer,
    DescribeLifecycleHooksCommandInput
  >[],
): SelectedEdge[] {
  const groupArnsByName = new Map<string, string>();
  groups.forEach((group) => {
    if (
      group.AutoScalingGroupName != null &&
      group.AutoScalingGroupARN != null
    ) {
      groupArnsByName.set(
        scopeKey(group.$metadata, group.AutoScalingGroupName),
        group.AutoScalingGroupARN,
      );
    }
  });

  return (lifecycleHooksState ?? []).reduce<SelectedEdge[]>(
    (acc, { _metadata, _parameters, _result }) => {
      const edges = (_result?.LifecycleHooks ?? [])
        .map((hook) => {
          const groupName =
            hook.AutoScalingGroupName ?? _parameters?.AutoScalingGroupName;
          const target = hook.NotificationTargetARN;
          if (
            groupName == null ||
            target == null ||
            !SUPPORTED_NOTIFICATION_TARGET.test(target)
          ) {
            return undefined;
          }
          const source = groupArnsByName.get(scopeKey(_metadata, groupName));
          if (source == null) {
            return undefined;
          }
          return formatEdge(source, {
            name: hook.LifecycleHookName ?? `${groupName} Lifecycle Hook`,
            target,
          });
        })
        .filter((edge): edge is SelectedEdge => edge != null);
      return acc.concat(edges);
    },
    [],
  );
}

export async function getEdges(connector: Connector): Promise<SelectedEdge[]> {
  const groups = await getAutoScalingGroups(connector);
  if (groups.length === 0) {
    return [];
  }

  const [launchTemplateIdsByName, targetGroupsState, lifecycleHooksState] =
    await Promise.all([
      getLaunchTemplateIdsByName(connector),
      connector.getGlobalStateForServiceFunction(
        "ElasticLoadBalancingV2",
        "DescribeTargetGroups",
      ) as Promise<State<DescribeTargetGroupsCommandOutput>[]>,
      connector.getGlobalStateForServiceFunction(
        "AutoScaling",
        "DescribeLifecycleHooks",
      ) as Promise<
        State<
          DescribeLifecycleHooksAnswer,
          DescribeLifecycleHooksCommandInput
        >[]
      >,
    ]);

  return dedupeEdges([
    ...getLaunchTemplateEdges(groups, launchTemplateIdsByName),
    ...getLoadBalancerEdges(groups, targetGroupsState),
    ...getLifecycleHookEdges(groups, lifecycleHooksState),
  ]);
}
