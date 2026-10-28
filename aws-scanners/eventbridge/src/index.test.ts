import { mkdtempSync } from "fs";
import { env } from "process";
import { join } from "path";
import { tmpdir } from "os";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  ListEventBusesCommand,
  DescribeEventBusCommand,
  ListRulesCommand,
  ListTargetsByRuleCommand,
  ListApiDestinationsCommand,
  ListConnectionsCommand,
} from "@aws-sdk/client-eventbridge";
import { generateNodesFromEntity } from "@infrascan/core";
import buildFsConnector from "@infrascan/fs-connector";
import EventBridgeScanner from ".";
import { EventBridgeEntity } from "./graph";
import { normalizeTargetArn } from "./edges";

const stateDirectoryPrefix = "infrascan-test-state-";
const baseDirectory =
  env.DEBUG_STATE != null
    ? stateDirectoryPrefix
    : join(tmpdir(), stateDirectoryPrefix);

t.test(
  "State is pulled correctly from EventBridge, and formatted as expected",
  async ({ equal, ok, same }) => {
    const connector = buildFsConnector(mkdtempSync(baseDirectory));
    const testContext = {
      region: "us-east-1",
      account: "0".repeat(12),
    };
    const arnPrefix = `arn:aws:events:${testContext.region}:${testContext.account}`;
    const defaultBusArn = `${arnPrefix}:event-bus/default`;
    const customBusArn = `${arnPrefix}:event-bus/orders`;
    const scheduleRuleArn = `${arnPrefix}:rule/nightly`;
    const s3RuleArn = `${arnPrefix}:rule/s3-uploads`;
    const ordersRuleArn = `${arnPrefix}:rule/orders/order-created`;
    const functionArn = `arn:aws:lambda:${testContext.region}:${testContext.account}:function:nightly-job`;
    const queueArn = `arn:aws:sqs:${testContext.region}:${testContext.account}:uploads`;
    const dlqArn = `arn:aws:sqs:${testContext.region}:${testContext.account}:uploads-dlq`;
    const busDlqArn = `arn:aws:sqs:${testContext.region}:${testContext.account}:orders-dlq`;
    const apiDestinationArn = `${arnPrefix}:api-destination/webhook/abc`;
    const connectionArn = `${arnPrefix}:connection/webhook-auth/def`;

    const client = EventBridgeScanner.getClient(fromProcess(), testContext);
    const mockedClient = mockClient(client);

    mockedClient.on(ListEventBusesCommand).resolves({
      EventBuses: [
        { Name: "default", Arn: defaultBusArn },
        { Name: "orders", Arn: customBusArn },
      ],
    });

    mockedClient
      .on(DescribeEventBusCommand, { Name: "default" })
      .resolves({ Name: "default", Arn: defaultBusArn });
    mockedClient.on(DescribeEventBusCommand, { Name: "orders" }).resolves({
      Name: "orders",
      Arn: customBusArn,
      Policy: "{}",
      KmsKeyIdentifier: "alias/orders",
      DeadLetterConfig: { Arn: busDlqArn },
      CreationTime: new Date("2026-01-01T00:00:00.000Z"),
    });

    // Rules on the default bus come back over two pages
    mockedClient
      .on(ListRulesCommand, { EventBusName: "default", NextToken: undefined })
      .resolves({
        Rules: [
          {
            Name: "nightly",
            Arn: scheduleRuleArn,
            EventBusName: "default",
            ScheduleExpression: "cron(0 2 * * ? *)",
            State: "ENABLED",
          },
        ],
        NextToken: "page-2",
      });
    mockedClient
      .on(ListRulesCommand, { EventBusName: "default", NextToken: "page-2" })
      .resolves({
        Rules: [
          {
            Name: "s3-uploads",
            Arn: s3RuleArn,
            EventBusName: "default",
            EventPattern: JSON.stringify({
              source: ["aws.s3", { prefix: "custom." }],
            }),
            State: "ENABLED",
          },
        ],
      });
    mockedClient
      .on(ListRulesCommand, { EventBusName: "orders", NextToken: undefined })
      .resolves({
        Rules: [
          {
            // EventBusName omitted: falls back to the bus the rule was listed on
            Name: "order-created",
            Arn: ordersRuleArn,
            EventPattern: JSON.stringify({ source: "orders.service" }),
            RoleArn: `arn:aws:iam::${testContext.account}:role/eb-role`,
          },
        ],
      });

    mockedClient
      .on(ListTargetsByRuleCommand, {
        Rule: "nightly",
        EventBusName: "default",
      })
      .resolves({
        Targets: [{ Id: "job", Arn: `${functionArn}:live` }],
      });
    mockedClient
      .on(ListTargetsByRuleCommand, {
        Rule: "s3-uploads",
        EventBusName: "default",
      })
      .resolves({
        Targets: [
          {
            Id: "queue",
            Arn: queueArn,
            DeadLetterConfig: { Arn: dlqArn },
            RetryPolicy: { MaximumRetryAttempts: 3 },
            Input: '{"secret":"do-not-store-on-node"}',
          },
        ],
      });
    mockedClient
      .on(ListTargetsByRuleCommand, {
        Rule: "order-created",
        EventBusName: "orders",
      })
      .resolves({
        Targets: [{ Id: "webhook", Arn: apiDestinationArn }],
      });

    mockedClient.on(ListApiDestinationsCommand).resolves({
      ApiDestinations: [
        {
          Name: "webhook",
          ApiDestinationArn: apiDestinationArn,
          ConnectionArn: connectionArn,
          InvocationEndpoint: "https://example.com/hook",
          HttpMethod: "POST",
          ApiDestinationState: "ACTIVE",
        },
      ],
    });
    mockedClient.on(ListConnectionsCommand).resolves({
      Connections: [
        {
          Name: "webhook-auth",
          ConnectionArn: connectionArn,
          ConnectionState: "AUTHORIZED",
          AuthorizationType: "API_KEY",
        },
      ],
    });

    for (const scannerFn of EventBridgeScanner.getters) {
      await scannerFn(client, connector, testContext);
    }

    equal(mockedClient.commandCalls(ListEventBusesCommand).length, 1);
    equal(mockedClient.commandCalls(DescribeEventBusCommand).length, 2);
    equal(mockedClient.commandCalls(ListRulesCommand).length, 3);
    equal(mockedClient.commandCalls(ListTargetsByRuleCommand).length, 3);
    equal(mockedClient.commandCalls(ListApiDestinationsCommand).length, 1);
    equal(mockedClient.commandCalls(ListConnectionsCommand).length, 1);

    const targetCallInputs = mockedClient
      .commandCalls(ListTargetsByRuleCommand)
      .map((call) => call.args[0].input);
    ok(
      targetCallInputs.find(
        (input) =>
          input.Rule === "order-created" && input.EventBusName === "orders",
      ),
    );

    const edges = await EventBridgeScanner.getEdges!(connector);
    const hasEdge = (source: string, target: string) =>
      edges.some((edge) => edge.source === source && edge.target === target);
    equal(edges.length, 8);
    ok(hasEdge(defaultBusArn, scheduleRuleArn));
    ok(hasEdge(defaultBusArn, s3RuleArn));
    ok(hasEdge(customBusArn, ordersRuleArn));
    ok(hasEdge(scheduleRuleArn, functionArn), "lambda alias is unqualified");
    ok(hasEdge(s3RuleArn, queueArn));
    ok(hasEdge(s3RuleArn, dlqArn));
    ok(hasEdge(ordersRuleArn, apiDestinationArn));
    ok(hasEdge(customBusArn, busDlqArn));

    const roles = await EventBridgeScanner.getIamRoles!(connector);
    same(roles, [
      {
        roleArn: `arn:aws:iam::${testContext.account}:role/eb-role`,
        executor: ordersRuleArn,
      },
    ]);

    const nodes: EventBridgeEntity[] = [];
    for (const entity of EventBridgeScanner.entities ?? []) {
      for await (const node of generateNodesFromEntity(
        connector,
        testContext,
        entity,
      )) {
        ok(node.$graph.id);
        ok(node.$graph.label);
        ok(node.$metadata.version);
        equal(node.tenant.tenantId, testContext.account);
        equal(node.tenant.provider, "aws");
        equal(node.location?.code, testContext.region);
        equal(node.$source?.command, entity.command);
        equal(node.resource.category, entity.category);
        equal(node.resource.subcategory, entity.subcategory);
        nodes.push(node as unknown as EventBridgeEntity);
      }
    }
    equal(nodes.length, 6);

    const ordersBus = nodes.find((node) => node.$graph.id === customBusArn)!;
    equal(ordersBus.$graph.nodeClass, "visual");
    equal(ordersBus.resource.policy, "{}");
    equal(ordersBus.encryption?.keyId, "alias/orders");
    equal(ordersBus.deadLetter?.targetId, busDlqArn);
    equal(
      ordersBus.audit?.createdAt,
      new Date("2026-01-01T00:00:00.000Z").getTime(),
    );

    const s3Rule = nodes.find((node) => node.$graph.id === s3RuleArn)!;
    same(s3Rule.eventbridge.rule?.eventPatternSources, ["aws.s3"]);
    equal(s3Rule.eventbridge.rule?.targets.length, 1);
    equal(s3Rule.eventbridge.rule?.targets[0].deadLetterTargetArn, dlqArn);
    equal(
      s3Rule.eventbridge.rule?.targets[0].retryPolicy?.maximumRetryAttempts,
      3,
    );
    ok(!JSON.stringify(s3Rule).includes("do-not-store-on-node"));

    const ordersRule = nodes.find((node) => node.$graph.id === ordersRuleArn)!;
    equal(ordersRule.eventbridge.rule?.eventBusName, "orders");
    same(ordersRule.eventbridge.rule?.eventPatternSources, ["orders.service"]);
    equal(ordersRule.iam?.roles.length, 1);

    const scheduleRule = nodes.find(
      (node) => node.$graph.id === scheduleRuleArn,
    )!;
    equal(scheduleRule.eventbridge.rule?.scheduleExpression, "cron(0 2 * * ? *)");
    equal(scheduleRule.eventbridge.rule?.eventPatternSources, undefined);

    const apiDestination = nodes.find(
      (node) => node.$graph.id === apiDestinationArn,
    )!;
    equal(apiDestination.eventbridge.apiDestination?.httpMethod, "POST");
    equal(
      apiDestination.eventbridge.apiDestination?.connection?.authorizationType,
      "API_KEY",
    );
  },
);

t.test("No event buses returned from ListEventBuses", async ({ equal }) => {
  const connector = buildFsConnector(mkdtempSync(baseDirectory));
  const testContext = {
    region: "us-east-1",
    account: "0".repeat(12),
  };
  const client = EventBridgeScanner.getClient(fromProcess(), testContext);
  const mockedClient = mockClient(client);

  mockedClient.on(ListEventBusesCommand).resolves({ EventBuses: [] });
  mockedClient.on(ListApiDestinationsCommand).resolves({ ApiDestinations: [] });
  mockedClient.on(ListConnectionsCommand).resolves({ Connections: [] });

  for (const scannerFn of EventBridgeScanner.getters) {
    await scannerFn(client, connector, testContext);
  }

  equal(mockedClient.commandCalls(ListEventBusesCommand).length, 1);
  equal(mockedClient.commandCalls(DescribeEventBusCommand).length, 0);
  equal(mockedClient.commandCalls(ListRulesCommand).length, 0);
  equal(mockedClient.commandCalls(ListTargetsByRuleCommand).length, 0);

  const edges = await EventBridgeScanner.getEdges!(connector);
  equal(edges.length, 0);
});

t.test("Lambda target ARNs are normalized to the function", async ({ equal }) => {
  const fn = "arn:aws:lambda:us-east-1:000000000000:function:my-fn";
  equal(normalizeTargetArn(`${fn}:prod`), fn);
  equal(normalizeTargetArn(fn), fn);
  const queue = "arn:aws:sqs:us-east-1:000000000000:my-queue";
  equal(normalizeTargetArn(queue), queue);
});
