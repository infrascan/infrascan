import t from "tap";
import {
  formatApiArn,
  getIntegrationIdFromRouteTarget,
  resolveAuthorizerTarget,
  resolveIntegrationTarget,
  resolveLambdaArn,
} from "./targets";

const location = { account: "123456789012", region: "eu-west-1" };
const functionArn = "arn:aws:lambda:eu-west-1:123456789012:function:handler";

t.test("formatApiArn", async (t) => {
  t.equal(
    formatApiArn("eu-west-1", "abc123"),
    "arn:aws:apigateway:eu-west-1::/apis/abc123",
  );
  t.equal(
    formatApiArn("cn-north-1", "abc123", "aws-cn"),
    "arn:aws-cn:apigateway:cn-north-1::/apis/abc123",
  );
});

t.test("getIntegrationIdFromRouteTarget", async (t) => {
  t.equal(getIntegrationIdFromRouteTarget("integrations/abc"), "abc");
  t.equal(getIntegrationIdFromRouteTarget(undefined), undefined);
  t.equal(getIntegrationIdFromRouteTarget("something/abc"), undefined);
});

t.test("resolveLambdaArn", async (t) => {
  t.equal(resolveLambdaArn(functionArn), functionArn);
  t.equal(resolveLambdaArn(`${functionArn}:prod`), functionArn);
  t.equal(
    resolveLambdaArn(
      `arn:aws:apigateway:eu-west-1:lambda:path/2015-03-31/functions/${functionArn}:7/invocations`,
    ),
    functionArn,
  );
  t.equal(resolveLambdaArn("https://example.com"), undefined);
  t.equal(resolveLambdaArn(undefined), undefined);
});

t.test("resolveIntegrationTarget: integration URIs", async (t) => {
  t.equal(
    resolveIntegrationTarget({ IntegrationUri: functionArn }, location),
    functionArn,
  );
  t.equal(
    resolveIntegrationTarget(
      {
        IntegrationUri:
          "arn:aws:apigateway:eu-west-1:sqs:path/123456789012/my-queue",
      },
      location,
    ),
    "arn:aws:sqs:eu-west-1:123456789012:my-queue",
  );
  t.equal(
    resolveIntegrationTarget(
      {
        IntegrationUri:
          "arn:aws:elasticloadbalancing:eu-west-1:123456789012:listener/net/my-nlb/abc/def",
      },
      location,
    ),
    "arn:aws:elasticloadbalancing:eu-west-1:123456789012:loadbalancer/net/my-nlb/abc",
  );
  t.equal(
    resolveIntegrationTarget(
      {
        IntegrationUri:
          "arn:aws:servicediscovery:eu-west-1:123456789012:service/srv-abc",
      },
      location,
    ),
    "arn:aws:servicediscovery:eu-west-1:123456789012:service/srv-abc",
  );
  t.equal(
    resolveIntegrationTarget(
      {
        IntegrationUri:
          "arn:aws:apigateway:eu-west-1:states:action/StartExecution",
      },
      location,
    ),
    undefined,
  );
  t.equal(
    resolveIntegrationTarget(
      { IntegrationUri: "https://example.com/path" },
      location,
    ),
    undefined,
  );
  t.equal(
    resolveIntegrationTarget({ IntegrationType: "MOCK" }, location),
    undefined,
  );
});

t.test("resolveIntegrationTarget: AWS service integrations", async (t) => {
  t.equal(
    resolveIntegrationTarget(
      {
        IntegrationSubtype: "SQS-SendMessage",
        RequestParameters: {
          QueueUrl: "https://sqs.us-east-2.amazonaws.com/210987654321/queue",
        },
      },
      location,
    ),
    "arn:aws:sqs:us-east-2:210987654321:queue",
  );
  t.equal(
    resolveIntegrationTarget(
      {
        IntegrationSubtype: "SQS-SendMessage",
        RequestParameters: { QueueUrl: "$request.header.queue" },
      },
      location,
    ),
    undefined,
  );
  t.equal(
    resolveIntegrationTarget(
      {
        IntegrationSubtype: "StepFunctions-StartExecution",
        RequestParameters: {
          StateMachineArn:
            "arn:aws:states:eu-west-1:123456789012:stateMachine:flow",
        },
      },
      location,
    ),
    "arn:aws:states:eu-west-1:123456789012:stateMachine:flow",
  );
  t.equal(
    resolveIntegrationTarget(
      {
        IntegrationSubtype: "StepFunctions-StopExecution",
        RequestParameters: {
          ExecutionArn:
            "arn:aws:states:eu-west-1:123456789012:execution:flow:run-1",
        },
      },
      location,
    ),
    "arn:aws:states:eu-west-1:123456789012:stateMachine:flow",
  );
  t.equal(
    resolveIntegrationTarget(
      { IntegrationSubtype: "EventBridge-PutEvents", RequestParameters: {} },
      location,
    ),
    "arn:aws:events:eu-west-1:123456789012:event-bus/default",
  );
  t.equal(
    resolveIntegrationTarget(
      {
        IntegrationSubtype: "EventBridge-PutEvents",
        RequestParameters: { EventBusName: "orders" },
      },
      location,
    ),
    "arn:aws:events:eu-west-1:123456789012:event-bus/orders",
  );
  t.equal(
    resolveIntegrationTarget(
      {
        IntegrationSubtype: "EventBridge-PutEvents",
        RequestParameters: {
          EventBusName:
            "arn:aws:events:eu-west-1:210987654321:event-bus/shared",
        },
      },
      location,
    ),
    "arn:aws:events:eu-west-1:210987654321:event-bus/shared",
  );
  t.equal(
    resolveIntegrationTarget(
      {
        IntegrationSubtype: "Kinesis-PutRecord",
        RequestParameters: { StreamName: "clicks" },
      },
      { ...location, partition: "aws-us-gov" },
    ),
    "arn:aws-us-gov:kinesis:eu-west-1:123456789012:stream/clicks",
  );
  t.equal(
    resolveIntegrationTarget(
      { IntegrationSubtype: "AppConfig-GetConfiguration" },
      location,
    ),
    undefined,
  );
});

t.test("resolveAuthorizerTarget", async (t) => {
  t.equal(
    resolveAuthorizerTarget({
      Name: "lambda",
      AuthorizerType: "REQUEST",
      AuthorizerUri: `arn:aws:apigateway:eu-west-1:lambda:path/2015-03-31/functions/${functionArn}/invocations`,
    }),
    functionArn,
  );
  t.equal(
    resolveAuthorizerTarget({ Name: "jwt", AuthorizerType: "JWT" }),
    undefined,
  );
});
