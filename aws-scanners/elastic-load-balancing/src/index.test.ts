import { mkdtempSync } from "fs";
import { env } from "process";
import { join } from "path";
import { tmpdir } from "os";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  DescribeLoadBalancersCommand,
  DescribeTargetGroupsCommand,
  DescribeListenersCommand,
  DescribeRulesCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import { generateNodesFromEntity } from "@infrascan/core";
import buildFsConnector from "@infrascan/fs-connector";
import ElasticLoadBalancingScanner from ".";

const stateDirectoryPrefix = "infrascan-test-state-";
const baseDirectory =
  env.DEBUG_STATE != null
    ? stateDirectoryPrefix
    : join(tmpdir(), stateDirectoryPrefix);
const tmpDir = mkdtempSync(baseDirectory);
const connector = buildFsConnector(tmpDir);

t.test(
  "State is pulled correctly from Elastic Load Balancing, and formatted as expected",
  async ({ ok, equal }) => {
    const testContext = {
      region: "us-east-1",
      account: "0".repeat(8),
    };
    const elbClient = ElasticLoadBalancingScanner.getClient(
      fromProcess(),
      testContext,
    );

    const mockedElbClient = mockClient(elbClient);

    // Mock each of the functions used to pull state
    const elbName = "test-lb";
    const elbArn = `arn:aws:elasticloadbalancing:${testContext.region}:${testContext.account}:loadbalancer/app/${elbName}/00000000000`;
    mockedElbClient.on(DescribeLoadBalancersCommand).resolves({
      LoadBalancers: [
        {
          LoadBalancerArn: elbArn,
          DNSName: `${elbName}-0000000000.${testContext.region}.elb.amazonaws.com`,
          LoadBalancerName: elbName,
        },
      ],
    });

    const targetGroupName = "test-target-group";
    const targetGroupArn = `arn:aws:elasticloadbalancing:${testContext.region}:${testContext.account}:targetgroup/${targetGroupName}/000000000000`;
    mockedElbClient.on(DescribeTargetGroupsCommand).resolves({
      TargetGroups: [
        {
          TargetGroupArn: targetGroupArn,
          TargetGroupName: targetGroupName,
        },
      ],
    });

    const listenerArn = `arn:aws:elasticloadbalancing:${testContext.region}:${testContext.account}:listener/app/${elbName}/00000000000/11111111111`;
    mockedElbClient.on(DescribeListenersCommand).resolves({
      Listeners: [
        {
          ListenerArn: listenerArn,
        },
      ],
    });

    const listenerRuleArn = `arn:aws:elasticloadbalancing:${testContext.region}:${testContext.account}:listener-rule/app/${elbName}/00000000000/11111111111/2222222222`;
    mockedElbClient.on(DescribeRulesCommand).resolves({
      Rules: [
        {
          RuleArn: listenerRuleArn,
        },
      ],
    });

    for (const scannerFn of ElasticLoadBalancingScanner.getters) {
      await scannerFn(elbClient, connector, testContext);
    }

    equal(mockedElbClient.commandCalls(DescribeLoadBalancersCommand).length, 1);
    equal(mockedElbClient.commandCalls(DescribeTargetGroupsCommand).length, 1);
    equal(mockedElbClient.commandCalls(DescribeListenersCommand).length, 1);
    equal(mockedElbClient.commandCalls(DescribeRulesCommand).length, 1);

    const describeTargetGroupsArgs = mockedElbClient
      .commandCalls(DescribeTargetGroupsCommand)
      .at(0)?.args;
    equal(describeTargetGroupsArgs?.[0].input.LoadBalancerArn, elbArn);

    const describeListenersArgs = mockedElbClient
      .commandCalls(DescribeListenersCommand)
      .at(0)?.args;
    equal(describeListenersArgs?.[0].input.LoadBalancerArn, elbArn);

    const describeRulesArgs = mockedElbClient
      .commandCalls(DescribeRulesCommand)
      .at(0)?.args;
    equal(describeRulesArgs?.[0].input.ListenerArn, listenerArn);

    for (const entity of ElasticLoadBalancingScanner.entities ?? []) {
      const nodeProducer = generateNodesFromEntity(
        connector,
        testContext,
        entity,
      );
      for await (const node of nodeProducer) {
        ok(node.$graph.id);
        ok(node.$graph.label);
        ok(node.$metadata.version);
        equal(node.tenant.tenantId, testContext.account);
        equal(node.tenant.provider, "aws");
        ok(node.location?.code);
        equal(node.$source?.command, entity.command);
        equal(node.resource.category, entity.category);
        equal(node.resource.subcategory, entity.subcategory);
        equal(node.dns?.domains.length, 1);
      }
    }
  },
);

t.test(
  "No Load Balancers returned from DescribeLoadBalancersCommand",
  async ({ equal }) => {
    const testContext = {
      region: "us-east-1",
      account: "0".repeat(8),
    };
    const elbClient = ElasticLoadBalancingScanner.getClient(
      fromProcess(),
      testContext,
    );

    const mockedElbClient = mockClient(elbClient);

    // Mock each of the functions used to pull state
    mockedElbClient.on(DescribeLoadBalancersCommand).resolves({
      LoadBalancers: [],
    });

    for (const scannerFn of ElasticLoadBalancingScanner.getters) {
      await scannerFn(elbClient, connector, testContext);
    }

    equal(mockedElbClient.commandCalls(DescribeLoadBalancersCommand).length, 1);
    equal(mockedElbClient.commandCalls(DescribeTargetGroupsCommand).length, 0);
    equal(mockedElbClient.commandCalls(DescribeListenersCommand).length, 0);
    equal(mockedElbClient.commandCalls(DescribeRulesCommand).length, 0);
  },
);

t.test(
  "No Listeners returned from DescribeListenersCommand",
  async ({ equal }) => {
    const testContext = {
      region: "us-east-1",
      account: "0".repeat(8),
    };
    const elbClient = ElasticLoadBalancingScanner.getClient(
      fromProcess(),
      testContext,
    );

    const mockedElbClient = mockClient(elbClient);

    // Mock each of the functions used to pull state
    const elbName = "test-lb";
    const elbArn = `arn:aws:elasticloadbalancing:${testContext.region}:${testContext.account}:loadbalancer/app/${elbName}/00000000000`;
    mockedElbClient.on(DescribeLoadBalancersCommand).resolves({
      LoadBalancers: [
        {
          LoadBalancerArn: elbArn,
          DNSName: `${elbName}-0000000000.${testContext.region}.elb.amazonaws.com`,
          LoadBalancerName: elbName,
        },
      ],
    });

    const targetGroupName = "test-target-group";
    const targetGroupArn = `arn:aws:elasticloadbalancing:${testContext.region}:${testContext.account}:targetgroup/${targetGroupName}/000000000000`;
    mockedElbClient.on(DescribeTargetGroupsCommand).resolves({
      TargetGroups: [
        {
          TargetGroupArn: targetGroupArn,
          TargetGroupName: targetGroupName,
        },
      ],
    });

    mockedElbClient.on(DescribeListenersCommand).resolves({
      Listeners: [],
    });

    for (const scannerFn of ElasticLoadBalancingScanner.getters) {
      await scannerFn(elbClient, connector, testContext);
    }

    equal(mockedElbClient.commandCalls(DescribeLoadBalancersCommand).length, 1);
    equal(mockedElbClient.commandCalls(DescribeTargetGroupsCommand).length, 1);
    equal(mockedElbClient.commandCalls(DescribeListenersCommand).length, 1);
    equal(mockedElbClient.commandCalls(DescribeRulesCommand).length, 0);
  },
);
