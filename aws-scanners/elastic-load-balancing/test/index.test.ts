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
import buildFsConnector from "@infrascan/fs-connector";
import ElasticLoadBalancingScanner from "../src";

const stateDirectoryPrefix = "infrascan-test-state-";
const baseDirectory =
  env.DEBUG_STATE != null
    ? stateDirectoryPrefix
    : join(tmpdir(), stateDirectoryPrefix);
const tmpDir = mkdtempSync(baseDirectory);
const connector = buildFsConnector(tmpDir);

t.test(
  "State is pulled correctly from Elastic Load Balancing, and formatted as expected",
  async () => {
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

    t.equal(
      mockedElbClient.commandCalls(DescribeLoadBalancersCommand).length,
      1,
    );
    t.equal(
      mockedElbClient.commandCalls(DescribeTargetGroupsCommand).length,
      1,
    );
    t.equal(mockedElbClient.commandCalls(DescribeListenersCommand).length, 1);
    t.equal(mockedElbClient.commandCalls(DescribeRulesCommand).length, 1);

    const describeTargetGroupsArgs = mockedElbClient
      .commandCalls(DescribeTargetGroupsCommand)
      .at(0)?.args;
    t.equal(describeTargetGroupsArgs?.[0].input.LoadBalancerArn, elbArn);

    const describeListenersArgs = mockedElbClient
      .commandCalls(DescribeListenersCommand)
      .at(0)?.args;
    t.equal(describeListenersArgs?.[0].input.LoadBalancerArn, elbArn);

    const describeRulesArgs = mockedElbClient
      .commandCalls(DescribeRulesCommand)
      .at(0)?.args;
    t.equal(describeRulesArgs?.[0].input.ListenerArn, listenerArn);

    if (ElasticLoadBalancingScanner.getNodes != null) {
      const nodes = await ElasticLoadBalancingScanner.getNodes(
        connector,
        testContext,
      );
      t.equal(nodes.length, 1);
      t.equal(nodes[0].id, elbArn);
      t.equal(nodes[0].name, elbName);
    }
  },
);

t.test(
  "No Load Balancers returned from DescribeLoadBalancersCommand",
  async () => {
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

    t.equal(
      mockedElbClient.commandCalls(DescribeLoadBalancersCommand).length,
      1,
    );
    t.equal(
      mockedElbClient.commandCalls(DescribeTargetGroupsCommand).length,
      0,
    );
    t.equal(mockedElbClient.commandCalls(DescribeListenersCommand).length, 0);
    t.equal(mockedElbClient.commandCalls(DescribeRulesCommand).length, 0);

    if (ElasticLoadBalancingScanner.getNodes != null) {
      const nodes = await ElasticLoadBalancingScanner.getNodes(
        connector,
        testContext,
      );
      t.equal(nodes.length, 0);
    }
  },
);

t.test("No Listeners returned from DescribeListenersCommand", async () => {
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

  t.equal(mockedElbClient.commandCalls(DescribeLoadBalancersCommand).length, 1);
  t.equal(mockedElbClient.commandCalls(DescribeTargetGroupsCommand).length, 1);
  t.equal(mockedElbClient.commandCalls(DescribeListenersCommand).length, 1);
  t.equal(mockedElbClient.commandCalls(DescribeRulesCommand).length, 0);

  if (ElasticLoadBalancingScanner.getNodes != null) {
    const nodes = await ElasticLoadBalancingScanner.getNodes(
      connector,
      testContext,
    );
    t.equal(nodes.length, 1);
  }
});
