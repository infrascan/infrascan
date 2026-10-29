import { mkdtempSync } from "fs";
import { env } from "process";
import { join } from "path";
import { tmpdir } from "os";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  ListStateMachinesCommand,
  DescribeStateMachineCommand,
} from "@aws-sdk/client-sfn";
import buildFsConnector from "@infrascan/fs-connector";
import type { Connector } from "@infrascan/shared-types";
import SFNScanner from ".";
import { getEdges } from "./edges";

const stateDirectoryPrefix = "infrascan-test-state-";
const baseDirectory =
  env.DEBUG_STATE != null
    ? stateDirectoryPrefix
    : join(tmpdir(), stateDirectoryPrefix);

const testContext = {
  region: "us-east-1",
  account: "0".repeat(12),
};
const { region, account } = testContext;
const stateMachineArn = `arn:aws:states:${region}:${account}:stateMachine:test-machine`;
const lambdaArn = `arn:aws:lambda:${region}:${account}:function:test-fn`;
const topicArn = `arn:aws:sns:${region}:${account}:test-topic`;
const queueArn = `arn:aws:sqs:${region}:${account}:test-queue`;
const queueUrl = `https://sqs.${region}.amazonaws.com/${account}/test-queue`;
const tableArn = `arn:aws:dynamodb:${region}:${account}:table/test-table`;
const clusterArn = `arn:aws:ecs:${region}:${account}:cluster/test-cluster`;
const childStateMachineArn = `arn:aws:states:${region}:${account}:stateMachine:child-machine`;
const defaultBusArn = `arn:aws:events:${region}:${account}:event-bus/default`;

// Each test gets its own state directory so seeded state doesn't leak between tests
function buildConnector(): Connector {
  return buildFsConnector(mkdtempSync(baseDirectory));
}

async function seedDefinitions(
  connector: Connector,
  machines: { arn: string; definition: unknown }[],
) {
  await connector.onServiceScanCompleteCallback(
    account,
    region,
    "SFN",
    "DescribeStateMachine",
    machines.map(({ arn, definition }) => ({
      _metadata: { account, region, timestamp: Date.now() },
      _parameters: { stateMachineArn: arn },
      _result: {
        stateMachineArn: arn,
        name: arn.split(":").pop(),
        definition:
          typeof definition === "string"
            ? definition
            : JSON.stringify(definition),
      },
    })),
  );
}

function task(resource: string, parameters?: Record<string, unknown>) {
  return {
    Type: "Task",
    Resource: resource,
    ...(parameters != null ? { Parameters: parameters } : {}),
    End: true,
  };
}

async function edgesForStates(states: Record<string, unknown>) {
  const connector = buildConnector();
  await seedDefinitions(connector, [
    {
      arn: stateMachineArn,
      definition: { StartAt: Object.keys(states)[0], States: states },
    },
  ]);
  return getEdges(connector);
}

function targets(edges: { target: string }[]): string[] {
  return edges.map(({ target }) => target).sort();
}

t.test("Getter state is used to generate edges", async ({ equal, same }) => {
  const connector = buildConnector();
  const sfnClient = SFNScanner.getClient(fromProcess(), testContext);
  const mockedSFNClient = mockClient(sfnClient);
  mockedSFNClient.on(ListStateMachinesCommand).resolves({
    stateMachines: [
      {
        stateMachineArn,
        name: "test-machine",
        type: "STANDARD",
        creationDate: new Date(),
      },
    ],
  });
  mockedSFNClient.on(DescribeStateMachineCommand).resolves({
    stateMachineArn,
    name: "test-machine",
    type: "STANDARD",
    creationDate: new Date(),
    roleArn: "test-role",
    definition: JSON.stringify({
      StartAt: "Invoke",
      States: {
        Invoke: task("arn:aws:states:::lambda:invoke", {
          FunctionName: lambdaArn,
          "Payload.$": "$",
        }),
      },
    }),
  });

  for (const scanner of SFNScanner.getters) {
    await scanner(sfnClient, connector, testContext);
  }

  const edges = await SFNScanner.getEdges!(connector);
  equal(edges.length, 1);
  same(edges[0], {
    source: stateMachineArn,
    target: lambdaArn,
    metadata: { label: "Invoke Invocation" },
  });
});

t.test("Lambda integrations", async ({ same }) => {
  const edges = await edgesForStates({
    ByName: task("arn:aws:states:::lambda:invoke", { FunctionName: "fn-a" }),
    ByQualifiedArn: task("arn:aws:states:::lambda:invoke.waitForTaskToken", {
      FunctionName: `arn:aws:lambda:eu-west-1:111111111111:function:fn-b:prod`,
    }),
    ByPartialArn: task("arn:aws:states:::lambda:invoke", {
      FunctionName: "222222222222:function:fn-c:1",
    }),
    ByNameAndAlias: task("arn:aws:states:::lambda:invoke", {
      FunctionName: "fn-d:live",
    }),
    Legacy: task(`${lambdaArn}:$LATEST`),
  });
  same(
    targets(edges),
    [
      `arn:aws:lambda:${region}:${account}:function:fn-a`,
      `arn:aws:lambda:${region}:${account}:function:fn-d`,
      `arn:aws:lambda:${region}:222222222222:function:fn-c`,
      lambdaArn,
      "arn:aws:lambda:eu-west-1:111111111111:function:fn-b",
    ].sort(),
  );
});

t.test("Optimized service integrations", async ({ same }) => {
  const edges = await edgesForStates({
    Publish: task("arn:aws:states:::sns:publish", {
      TopicArn: topicArn,
      "Message.$": "$",
    }),
    Send: task("arn:aws:states:::sqs:sendMessage", {
      QueueUrl: queueUrl,
      "MessageBody.$": "$",
    }),
    LegacyQueue: task("arn:aws:states:::sqs:sendMessage", {
      QueueUrl: `https://eu-west-1.queue.amazonaws.com/${account}/legacy-queue`,
    }),
    Get: task("arn:aws:states:::dynamodb:getItem", { TableName: "test-table" }),
    Put: task("arn:aws:states:::dynamodb:putItem", { TableName: tableArn }),
    Update: task("arn:aws:states:::dynamodb:updateItem", {
      TableName: "other-table",
    }),
    Delete: task("arn:aws:states:::dynamodb:deleteItem", {
      TableName: "deleted-table",
    }),
    RunTask: task("arn:aws:states:::ecs:runTask.sync", {
      Cluster: "test-cluster",
      TaskDefinition: "test-task:1",
    }),
    RunDefault: task("arn:aws:states:::ecs:runTask", {
      TaskDefinition: "test-task:1",
    }),
    Child: task("arn:aws:states:::states:startExecution.sync:2", {
      StateMachineArn: `${childStateMachineArn}:live`,
    }),
    Events: task("arn:aws:states:::events:putEvents", {
      Entries: [
        { Detail: {}, DetailType: "a", Source: "test" },
        { EventBusName: "custom-bus", DetailType: "b", Source: "test" },
        { "EventBusName.$": "$.bus", DetailType: "c", Source: "test" },
      ],
    }),
  });
  same(
    targets(edges),
    [
      `arn:aws:dynamodb:${region}:${account}:table/deleted-table`,
      `arn:aws:dynamodb:${region}:${account}:table/other-table`,
      tableArn,
      `arn:aws:ecs:${region}:${account}:cluster/default`,
      clusterArn,
      `arn:aws:events:${region}:${account}:event-bus/custom-bus`,
      defaultBusArn,
      topicArn,
      `arn:aws:sqs:eu-west-1:${account}:legacy-queue`,
      queueArn,
      childStateMachineArn,
    ].sort(),
  );
});

t.test("AWS SDK integrations", async ({ same }) => {
  const edges = await edgesForStates({
    Scan: task("arn:aws:states:::aws-sdk:dynamodb:scan", {
      TableName: "test-table",
    }),
    GetObject: task("arn:aws:states:::aws-sdk:s3:getObject", {
      Bucket: "test-bucket",
      Key: "key",
    }),
    PutRecord: task("arn:aws:states:::aws-sdk:kinesis:putRecord", {
      StreamName: "test-stream",
    }),
    Invoke: task("arn:aws:states:::aws-sdk:lambda:invoke.waitForTaskToken", {
      FunctionName: "test-fn",
    }),
    // Unscanned service
    Glue: task("arn:aws:states:::aws-sdk:glue:startJobRun", {
      JobName: "test-job",
    }),
    // Scanned service without a recognisable parameter
    ListTopics: task("arn:aws:states:::aws-sdk:sns:listTopics", {}),
  });
  same(
    targets(edges),
    [
      "arn:aws:s3:::test-bucket",
      `arn:aws:dynamodb:${region}:${account}:table/test-table`,
      `arn:aws:kinesis:${region}:${account}:stream/test-stream`,
      lambdaArn,
    ].sort(),
  );
});

t.test("Nested Parallel and Map states are walked", async ({ same }) => {
  const edges = await edgesForStates({
    Fanout: {
      Type: "Parallel",
      Branches: [
        {
          StartAt: "Publish",
          States: {
            Publish: task("arn:aws:states:::sns:publish", {
              TopicArn: topicArn,
            }),
          },
        },
        {
          StartAt: "Inline",
          States: {
            Inline: {
              Type: "Map",
              ItemProcessor: {
                StartAt: "Invoke",
                States: {
                  Invoke: task("arn:aws:states:::lambda:invoke", {
                    FunctionName: lambdaArn,
                  }),
                },
              },
              End: true,
            },
          },
        },
      ],
      Next: "LegacyMap",
    },
    LegacyMap: {
      Type: "Map",
      Iterator: {
        StartAt: "Put",
        States: {
          Put: task("arn:aws:states:::dynamodb:putItem", {
            TableName: "test-table",
          }),
        },
      },
      End: true,
    },
  });
  same(targets(edges), [tableArn, lambdaArn, topicArn].sort());
});

t.test("Dynamic values are skipped", async ({ equal }) => {
  const edges = await edgesForStates({
    JsonPath: task("arn:aws:states:::lambda:invoke", {
      "FunctionName.$": "$.fn",
    }),
    JsonPathCluster: task("arn:aws:states:::ecs:runTask", {
      "Cluster.$": "$.cluster",
    }),
    DynamicEntries: task("arn:aws:states:::events:putEvents", {
      "Entries.$": "$.entries",
    }),
    Jsonata: {
      Type: "Task",
      QueryLanguage: "JSONata",
      Resource: "arn:aws:states:::sns:publish",
      Arguments: { TopicArn: "{% $states.input.topic %}" },
      End: true,
    },
    JsonataArguments: {
      Type: "Task",
      QueryLanguage: "JSONata",
      Resource: "arn:aws:states:::sqs:sendMessage",
      Arguments: "{% $states.input %}",
      End: true,
    },
    Activity: task(`arn:aws:states:${region}:${account}:activity:test`),
  });
  equal(edges.length, 0);
});

t.test("JSONata static arguments are used", async ({ same }) => {
  const edges = await edgesForStates({
    Jsonata: {
      Type: "Task",
      QueryLanguage: "JSONata",
      Resource: "arn:aws:states:::sns:publish",
      Arguments: { TopicArn: topicArn, Message: "{% $states.input %}" },
      End: true,
    },
  });
  same(targets(edges), [topicArn]);
});

t.test("Duplicate edges are removed", async ({ equal }) => {
  const edges = await edgesForStates({
    First: task("arn:aws:states:::lambda:invoke", { FunctionName: "test-fn" }),
    Second: task("arn:aws:states:::lambda:invoke.waitForTaskToken", {
      FunctionName: lambdaArn,
    }),
    Third: task(lambdaArn),
  });
  equal(edges.length, 1);
  equal(edges[0].target, lambdaArn);
});

t.test(
  "Malformed definitions are skipped without throwing",
  async ({ equal, same }) => {
    const connector = buildConnector();
    await seedDefinitions(connector, [
      { arn: childStateMachineArn, definition: "{ not json" },
      { arn: `${childStateMachineArn}-2`, definition: "null" },
      {
        arn: `${childStateMachineArn}-3`,
        definition: { States: { Bad: null, Worse: { Type: "Parallel" } } },
      },
      {
        arn: stateMachineArn,
        definition: {
          StartAt: "Invoke",
          States: {
            Invoke: task("arn:aws:states:::lambda:invoke", {
              FunctionName: lambdaArn,
            }),
          },
        },
      },
    ]);
    const edges = await getEdges(connector);
    equal(edges.length, 1);
    same(edges[0].source, stateMachineArn);
  },
);
