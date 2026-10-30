import { mkdtempSync } from "fs";
import t from "tap";
import { env } from "process";
import { join } from "path";
import { tmpdir } from "os";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  DescribeAutoScalingGroupsCommand,
  DescribeLifecycleHooksCommand,
  DescribePoliciesCommand,
} from "@aws-sdk/client-auto-scaling";
import { generateNodesFromEntity } from "@infrascan/core";
import buildFsConnector from "@infrascan/fs-connector";
import type { AwsContext, Connector } from "@infrascan/shared-types";
import AutoscalingScanner from "./index";
import { AutoScalingGroupEntity, type AutoScalingGroupState } from "./graph";

const stateDirectoryPrefix = "infrascan-test-state-";
const baseDirectory =
  env.DEBUG_STATE != null
    ? stateDirectoryPrefix
    : join(tmpdir(), stateDirectoryPrefix);

function buildConnector(): Connector {
  return buildFsConnector(mkdtempSync(baseDirectory));
}

const testContext: AwsContext = {
  region: "us-east-1",
  account: "0".repeat(12),
};

const asgArn = (name: string) =>
  `arn:aws:autoscaling:${testContext.region}:${testContext.account}:autoScalingGroup:11111111-2222-3333-4444-555555555555:autoScalingGroupName/${name}`;
const targetGroupArn = (name: string) =>
  `arn:aws:elasticloadbalancing:${testContext.region}:${testContext.account}:targetgroup/${name}/0123456789abcdef`;
const loadBalancerArn = `arn:aws:elasticloadbalancing:${testContext.region}:${testContext.account}:loadbalancer/app/web/0123456789abcdef`;
const queueArn = `arn:aws:sqs:${testContext.region}:${testContext.account}:asg-hooks`;
const topicArn = `arn:aws:sns:${testContext.region}:${testContext.account}:asg-hooks`;

async function seedState(
  connector: Connector,
  service: string,
  fn: string,
  result: unknown,
  context: AwsContext = testContext,
) {
  await connector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    service,
    fn,
    [
      {
        _metadata: {
          account: context.account,
          region: context.region,
          timestamp: Date.now(),
        },
        _parameters: {},
        _result: result,
      },
    ],
  );
}

async function collectNodes(connector: Connector) {
  const nodes: AutoScalingGroupState[] = [];
  for await (const node of generateNodesFromEntity(
    connector,
    testContext,
    AutoScalingGroupEntity,
  )) {
    nodes.push(node as unknown as AutoScalingGroupState);
  }
  return nodes;
}

t.test(
  "State is pulled correctly from Autoscaling, and formatted as expected",
  async ({ equal, same, ok, notOk }) => {
    const connector = buildConnector();
    const autoscalingClient = AutoscalingScanner.getClient(
      fromProcess(),
      testContext,
    );
    const mockedAutoscalingClient = mockClient(autoscalingClient);

    const createdTime = new Date("2024-01-01T00:00:00.000Z");
    mockedAutoscalingClient.on(DescribeAutoScalingGroupsCommand).resolves({
      AutoScalingGroups: [
        {
          AutoScalingGroupName: "web",
          AutoScalingGroupARN: asgArn("web"),
          LaunchTemplate: {
            LaunchTemplateId: "lt-web",
            LaunchTemplateName: "web-template",
            Version: "$Latest",
          },
          MinSize: 2,
          MaxSize: 10,
          DesiredCapacity: 3,
          DefaultCooldown: 300,
          AvailabilityZones: ["us-east-1a", "us-east-1b"],
          TargetGroupARNs: [targetGroupArn("web"), targetGroupArn("unknown")],
          HealthCheckType: "ELB",
          HealthCheckGracePeriod: 60,
          Instances: [
            {
              InstanceId: "i-1",
              AvailabilityZone: "us-east-1a",
              LifecycleState: "InService",
              HealthStatus: "Healthy",
              ProtectedFromScaleIn: false,
            },
            {
              InstanceId: "i-2",
              AvailabilityZone: "us-east-1b",
              LifecycleState: "InService",
              HealthStatus: "Healthy",
              ProtectedFromScaleIn: false,
            },
          ],
          CreatedTime: createdTime,
          VPCZoneIdentifier: "subnet-a, subnet-b",
          TerminationPolicies: ["OldestInstance", "Default"],
          ServiceLinkedRoleARN: `arn:aws:iam::${testContext.account}:role/aws-service-role/autoscaling.amazonaws.com/AWSServiceRoleForAutoScaling`,
          Tags: [
            {
              Key: "team",
              Value: "platform",
              ResourceId: "web",
              ResourceType: "auto-scaling-group",
              PropagateAtLaunch: true,
            },
          ],
          SuspendedProcesses: [{ ProcessName: "AZRebalance" }],
          EnabledMetrics: [{ Metric: "GroupInServiceInstances" }],
        },
        {
          AutoScalingGroupName: "workers",
          AutoScalingGroupARN: asgArn("workers"),
          MixedInstancesPolicy: {
            LaunchTemplate: {
              LaunchTemplateSpecification: {
                LaunchTemplateName: "workers-template",
                Version: "$Default",
              },
              Overrides: [
                { InstanceType: "m5.large", WeightedCapacity: "1" },
                {
                  InstanceType: "m6g.large",
                  LaunchTemplateSpecification: { LaunchTemplateId: "lt-arm" },
                },
              ],
            },
            InstancesDistribution: {
              OnDemandBaseCapacity: 1,
              OnDemandPercentageAboveBaseCapacity: 20,
              SpotAllocationStrategy: "price-capacity-optimized",
            },
          },
          MinSize: 0,
          MaxSize: 4,
          DesiredCapacity: 0,
          DefaultCooldown: 300,
          AvailabilityZones: ["us-east-1a"],
          HealthCheckType: "EC2",
          CreatedTime: createdTime,
        },
      ],
    });
    mockedAutoscalingClient
      .on(DescribePoliciesCommand, { AutoScalingGroupName: "web" })
      .resolves({
        ScalingPolicies: [
          {
            AutoScalingGroupName: "web",
            PolicyName: "cpu-target",
            PolicyARN: "arn:aws:autoscaling:policy/cpu-target",
            PolicyType: "TargetTrackingScaling",
            Enabled: true,
            Alarms: [{ AlarmName: "high", AlarmARN: "arn:aws:alarm:high" }],
          },
        ],
      });
    mockedAutoscalingClient
      .on(DescribePoliciesCommand, { AutoScalingGroupName: "workers" })
      .resolves({ ScalingPolicies: [] });
    mockedAutoscalingClient
      .on(DescribeLifecycleHooksCommand, { AutoScalingGroupName: "web" })
      .resolves({
        LifecycleHooks: [
          {
            AutoScalingGroupName: "web",
            LifecycleHookName: "drain",
            LifecycleTransition: "autoscaling:EC2_INSTANCE_TERMINATING",
            NotificationTargetARN: queueArn,
            HeartbeatTimeout: 300,
            DefaultResult: "CONTINUE",
          },
          {
            AutoScalingGroupName: "web",
            LifecycleHookName: "eventbridge-only",
            LifecycleTransition: "autoscaling:EC2_INSTANCE_LAUNCHING",
          },
        ],
      });
    mockedAutoscalingClient
      .on(DescribeLifecycleHooksCommand, { AutoScalingGroupName: "workers" })
      .resolves({
        LifecycleHooks: [
          {
            AutoScalingGroupName: "workers",
            LifecycleHookName: "notify",
            LifecycleTransition: "autoscaling:EC2_INSTANCE_LAUNCHING",
            NotificationTargetARN: topicArn,
          },
        ],
      });

    // Getters depend on each other's state, so run them in order
    for (const getter of AutoscalingScanner.getters) {
      await getter(autoscalingClient, connector, testContext);
    }

    equal(
      mockedAutoscalingClient.commandCalls(DescribeAutoScalingGroupsCommand)
        .length,
      1,
    );
    same(
      mockedAutoscalingClient
        .commandCalls(DescribePoliciesCommand)
        .map((call) => call.args[0].input.AutoScalingGroupName)
        .sort(),
      ["web", "workers"],
    );
    same(
      mockedAutoscalingClient
        .commandCalls(DescribeLifecycleHooksCommand)
        .map((call) => call.args[0].input.AutoScalingGroupName)
        .sort(),
      ["web", "workers"],
    );

    // Related state from other scanners
    await seedState(connector, "EC2", "DescribeLaunchTemplates", {
      LaunchTemplates: [
        { LaunchTemplateId: "lt-web", LaunchTemplateName: "web-template" },
        {
          LaunchTemplateId: "lt-workers",
          LaunchTemplateName: "workers-template",
        },
      ],
    });
    await seedState(
      connector,
      "ElasticLoadBalancingV2",
      "DescribeTargetGroups",
      {
        TargetGroups: [
          {
            TargetGroupArn: targetGroupArn("web"),
            TargetGroupName: "web",
            LoadBalancerArns: [loadBalancerArn],
          },
        ],
      },
    );

    const nodes = await collectNodes(connector);
    equal(nodes.length, 2);

    const web = nodes.find((node) => node.resource.name === "web");
    ok(web);
    if (web) {
      equal(web.$graph.id, asgArn("web"));
      equal(web.$graph.label, "web");
      equal(web.$graph.nodeType, "auto-scaling-group");
      equal(web.$graph.parent, `${testContext.account}-${testContext.region}`);
      equal(web.resource.id, asgArn("web"));
      equal(web.resource.category, "auto-scaling");
      equal(web.resource.subcategory, "auto-scaling-group");
      equal(web.tenant.tenantId, testContext.account);
      equal(web.tenant.provider, "aws");
      equal(web.$source?.command, "DescribeAutoScalingGroups");
      same(web.location, {
        code: testContext.region,
        zone: ["us-east-1a", "us-east-1b"],
      });
      equal(web.audit?.createdAt, createdTime.getTime());
      same(web.tags, [{ key: "team", value: "platform" }]);
      equal(web.iam?.roles.length, 1);
      same(web.healthcheck?.gracePeriod, { value: 60, unit: "s" });
      same(web.network?.targetSubnets, ["subnet-a", "subnet-b"]);
      same(web.loadBalancers, [
        { targetGroupArn: targetGroupArn("web") },
        { targetGroupArn: targetGroupArn("unknown") },
      ]);

      const details = web.autoScalingGroup;
      same(details.capacity, {
        min: 2,
        max: 10,
        desired: 3,
        desiredCapacityType: undefined,
        predicted: undefined,
      });
      equal(details.healthCheckType, "ELB");
      equal(details.instanceCount, 2);
      same(details.launchTemplate, {
        id: "lt-web",
        name: "web-template",
        version: "$Latest",
      });
      equal(details.mixedInstancesPolicy, undefined);
      same(details.targetGroupArns, [
        targetGroupArn("web"),
        targetGroupArn("unknown"),
      ]);
      same(details.terminationPolicies, ["OldestInstance", "Default"]);
      same(details.defaultCooldown, { value: 300, unit: "s" });
      same(details.suspendedProcesses, ["AZRebalance"]);
      same(details.enabledMetrics, ["GroupInServiceInstances"]);
      equal(details.policies.length, 1);
      equal(details.policies[0].name, "cpu-target");
      equal(details.policies[0].type, "TargetTrackingScaling");
      same(details.policies[0].alarms, ["arn:aws:alarm:high"]);
      equal(details.lifecycleHooks.length, 2);
      equal(details.lifecycleHooks[0].notificationTargetArn, queueArn);
      same(details.lifecycleHooks[0].heartbeatTimeout, {
        value: 300,
        unit: "s",
      });
    }

    const workers = nodes.find((node) => node.resource.name === "workers");
    ok(workers);
    if (workers) {
      const details = workers.autoScalingGroup;
      equal(details.instanceCount, 0);
      equal(details.launchTemplate, undefined);
      same(details.mixedInstancesPolicy?.launchTemplate, {
        id: undefined,
        name: "workers-template",
        version: "$Default",
      });
      equal(details.mixedInstancesPolicy?.overrides?.length, 2);
      equal(
        details.mixedInstancesPolicy?.overrides?.[1].launchTemplate?.id,
        "lt-arm",
      );
      equal(
        details.mixedInstancesPolicy?.instancesDistribution
          ?.spotAllocationStrategy,
        "price-capacity-optimized",
      );
      equal(details.policies.length, 0);
      equal(details.lifecycleHooks.length, 1);
      notOk(workers.network?.targetSubnets);
      same(workers.tags, []);
      same(workers.iam?.roles, []);
      same(workers.loadBalancers, []);
    }

    const edges = await AutoscalingScanner.getEdges!(connector);
    const hasEdge = (source: string, target: string) =>
      edges.some((edge) => edge.source === source && edge.target === target);

    // ASG -> launch template (by id)
    ok(hasEdge(asgArn("web"), "lt-web"));
    // ASG -> launch template (mixed instances policy, resolved by name)
    ok(hasEdge(asgArn("workers"), "lt-workers"));
    // ASG -> launch template (mixed instances policy override)
    ok(hasEdge(asgArn("workers"), "lt-arm"));
    // Load balancer -> ASG via target group
    ok(hasEdge(loadBalancerArn, asgArn("web")));
    // ASG -> lifecycle hook notification targets
    ok(hasEdge(asgArn("web"), queueArn));
    ok(hasEdge(asgArn("workers"), topicArn));
    equal(edges.length, 6);

    const lbEdge = edges.find((edge) => edge.source === loadBalancerArn);
    equal(lbEdge?.metadata?.label, "web-LoadBalancing");
    const hookEdge = edges.find((edge) => edge.target === queueArn);
    equal(hookEdge?.metadata?.label, "drain");
  },
);

t.test(
  "Partial Auto Scaling group state is handled without producing dangling edges",
  async ({ equal, same, notOk }) => {
    const connector = buildConnector();
    await seedState(connector, "AutoScaling", "DescribeAutoScalingGroups", {
      AutoScalingGroups: [
        {
          AutoScalingGroupName: "legacy",
          AutoScalingGroupARN: asgArn("legacy"),
          LaunchConfigurationName: "legacy-config",
          MinSize: 1,
          MaxSize: 1,
          DesiredCapacity: 1,
          // References that cannot be resolved to scanned nodes
          TargetGroupARNs: [targetGroupArn("unscanned")],
          VPCZoneIdentifier: "",
        },
        {
          AutoScalingGroupName: "unresolved",
          AutoScalingGroupARN: asgArn("unresolved"),
          LaunchTemplate: { LaunchTemplateName: "not-scanned" },
          MinSize: 0,
          MaxSize: 1,
          DesiredCapacity: 0,
        },
        {
          // No ARN, so no edges can be sourced from it
          AutoScalingGroupName: "no-arn",
          LaunchTemplate: { LaunchTemplateId: "lt-orphan" },
        },
      ],
    });
    await seedState(connector, "AutoScaling", "DescribeLifecycleHooks", {
      LifecycleHooks: [
        {
          AutoScalingGroupName: "legacy",
          LifecycleHookName: "lambda",
          NotificationTargetARN: `arn:aws:lambda:${testContext.region}:${testContext.account}:function:hook`,
        },
        {
          AutoScalingGroupName: "missing-group",
          LifecycleHookName: "orphan",
          NotificationTargetARN: queueArn,
        },
      ],
    });

    const nodes = await collectNodes(connector);
    equal(nodes.length, 3);
    const legacy = nodes.find((node) => node.resource.name === "legacy");
    equal(legacy?.autoScalingGroup.launchConfigurationName, "legacy-config");
    equal(legacy?.autoScalingGroup.launchTemplate, undefined);
    equal(legacy?.autoScalingGroup.instanceCount, 0);
    same(legacy?.autoScalingGroup.policies, []);
    same(legacy?.autoScalingGroup.lifecycleHooks.length, 1);
    notOk(legacy?.network?.targetSubnets);
    equal(legacy?.audit?.createdAt, null);
    notOk(legacy?.location?.zone);

    const edges = await AutoscalingScanner.getEdges!(connector);
    same(edges, []);
  },
);

t.test(
  "No Auto Scaling groups returned from DescribeAutoScalingGroups",
  async ({ equal }) => {
    const connector = buildConnector();
    const autoscalingClient = AutoscalingScanner.getClient(
      fromProcess(),
      testContext,
    );
    const mockedAutoscalingClient = mockClient(autoscalingClient);
    mockedAutoscalingClient
      .on(DescribeAutoScalingGroupsCommand)
      .resolves({ AutoScalingGroups: [] });

    for (const getter of AutoscalingScanner.getters) {
      await getter(autoscalingClient, connector, testContext);
    }

    equal(
      mockedAutoscalingClient.commandCalls(DescribeAutoScalingGroupsCommand)
        .length,
      1,
    );
    equal(
      mockedAutoscalingClient.commandCalls(DescribePoliciesCommand).length,
      0,
    );
    equal(
      mockedAutoscalingClient.commandCalls(DescribeLifecycleHooksCommand)
        .length,
      0,
    );

    const nodes = await collectNodes(connector);
    equal(nodes.length, 0);
    const edges = await AutoscalingScanner.getEdges!(connector);
    equal(edges.length, 0);
  },
);
