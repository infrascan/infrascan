import { mkdtempSync } from "fs";
import t from "tap";
import { env } from "process";
import { join } from "path";
import { tmpdir } from "os";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  GetApisCommand,
  GetAuthorizersCommand,
  GetDomainNamesCommand,
  GetIntegrationsCommand,
  GetRoutesCommand,
  GetStagesCommand,
} from "@aws-sdk/client-apigatewayv2";
import { generateNodesFromEntity } from "@infrascan/core";
import buildFsConnector from "@infrascan/fs-connector";
import type { BaseState } from "@infrascan/shared-types";
import ApiGatewayScanner, { type GraphState } from "./index";

const stateDirectoryPrefix = "infrascan-test-state-";
const baseDirectory =
  env.DEBUG_STATE != null
    ? stateDirectoryPrefix
    : join(tmpdir(), stateDirectoryPrefix);

const testContext = {
  region: "us-east-1",
  account: "0".repeat(12),
};
const { account, region } = testContext;

const httpApiId = "httpapi";
const wsApiId = "wsapi";
const httpApiArn = `arn:aws:apigateway:${region}::/apis/${httpApiId}`;
const wsApiArn = `arn:aws:apigateway:${region}::/apis/${wsApiId}`;

const usersFunctionArn = `arn:aws:lambda:${region}:${account}:function:users`;
const authFunctionArn = `arn:aws:lambda:${region}:${account}:function:auth`;
const wsFunctionArn = `arn:aws:lambda:${region}:${account}:function:socket`;
const orphanFunctionArn = `arn:aws:lambda:${region}:${account}:function:orphan`;
const queueArn = `arn:aws:sqs:${region}:${account}:orders`;
const loadBalancerArn = `arn:aws:elasticloadbalancing:${region}:${account}:loadbalancer/app/internal/50dc6c495c0c9188`;
const logGroupArn = `arn:aws:logs:${region}:${account}:log-group:api-access-logs`;
const integrationRoleArn = `arn:aws:iam::${account}:role/api-sqs`;
const authorizerRoleArn = `arn:aws:iam::${account}:role/api-authorizer`;

async function scan() {
  const connector = buildFsConnector(mkdtempSync(baseDirectory));
  const client = ApiGatewayScanner.getClient(fromProcess(), testContext);
  const mockedClient = mockClient(client);

  mockedClient.on(GetApisCommand).resolves({
    Items: [
      {
        ApiId: httpApiId,
        ApiEndpoint: `https://${httpApiId}.execute-api.${region}.amazonaws.com`,
        Name: "http-api",
        ProtocolType: "HTTP",
        RouteSelectionExpression: "$request.method $request.path",
        DisableExecuteApiEndpoint: false,
        CreatedDate: new Date("2024-01-01T00:00:00Z"),
      },
      {
        ApiId: wsApiId,
        ApiEndpoint: `wss://${wsApiId}.execute-api.${region}.amazonaws.com`,
        Name: "ws-api",
        ProtocolType: "WEBSOCKET",
        RouteSelectionExpression: "$request.body.action",
        DisableExecuteApiEndpoint: true,
      },
    ],
  });
  mockedClient.on(GetDomainNamesCommand).resolves({ Items: [] });

  mockedClient.on(GetRoutesCommand, { ApiId: httpApiId }).resolves({
    Items: [
      {
        RouteId: "r-get-users",
        RouteKey: "GET /users",
        Target: "integrations/i-users",
        AuthorizerId: "a-lambda",
        AuthorizationType: "CUSTOM",
      },
      {
        RouteId: "r-post-users",
        RouteKey: "POST /users",
        // Targets an alias of the same function through a separate integration
        Target: "integrations/i-users-alias",
      },
      {
        RouteId: "r-orders",
        RouteKey: "POST /orders",
        Target: "integrations/i-sqs",
      },
      {
        RouteId: "r-private",
        RouteKey: "ANY /internal/{proxy+}",
        Target: "integrations/i-alb",
      },
      {
        RouteId: "r-external",
        RouteKey: "GET /external",
        Target: "integrations/i-http",
      },
      { RouteId: "r-no-target", RouteKey: "GET /unused" },
    ],
  });
  mockedClient.on(GetIntegrationsCommand, { ApiId: httpApiId }).resolves({
    Items: [
      {
        IntegrationId: "i-users",
        IntegrationType: "AWS_PROXY",
        IntegrationUri: usersFunctionArn,
        PayloadFormatVersion: "2.0",
      },
      {
        IntegrationId: "i-users-alias",
        IntegrationType: "AWS_PROXY",
        IntegrationUri: `${usersFunctionArn}:live`,
        PayloadFormatVersion: "2.0",
      },
      {
        IntegrationId: "i-sqs",
        IntegrationType: "AWS_PROXY",
        IntegrationSubtype: "SQS-SendMessage",
        CredentialsArn: integrationRoleArn,
        RequestParameters: {
          QueueUrl: `https://sqs.${region}.amazonaws.com/${account}/orders`,
          MessageBody: "$request.body",
        },
      },
      {
        IntegrationId: "i-alb",
        IntegrationType: "HTTP_PROXY",
        ConnectionType: "VPC_LINK",
        ConnectionId: "vpclink",
        IntegrationUri: `arn:aws:elasticloadbalancing:${region}:${account}:listener/app/internal/50dc6c495c0c9188/0467ef3c8400ae65`,
      },
      {
        IntegrationId: "i-http",
        IntegrationType: "HTTP_PROXY",
        IntegrationUri: "https://example.com/external",
      },
      {
        // Not referenced by any route, so shouldn't produce an edge
        IntegrationId: "i-orphan",
        IntegrationType: "AWS_PROXY",
        IntegrationUri: orphanFunctionArn,
        CredentialsArn: `arn:aws:iam::${account}:role/unused`,
      },
    ],
  });
  mockedClient.on(GetAuthorizersCommand, { ApiId: httpApiId }).resolves({
    Items: [
      {
        AuthorizerId: "a-lambda",
        Name: "lambda-auth",
        AuthorizerType: "REQUEST",
        AuthorizerUri: `arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions/${authFunctionArn}/invocations`,
        AuthorizerCredentialsArn: authorizerRoleArn,
        IdentitySource: ["$request.header.Authorization"],
      },
      {
        AuthorizerId: "a-jwt",
        Name: "jwt-auth",
        AuthorizerType: "JWT",
        JwtConfiguration: {
          Audience: ["my-app"],
          Issuer: "https://issuer.example.com",
        },
      },
    ],
  });
  mockedClient.on(GetStagesCommand, { ApiId: httpApiId }).resolves({
    Items: [
      {
        StageName: "$default",
        AutoDeploy: true,
        AccessLogSettings: {
          DestinationArn: logGroupArn,
          Format: "$context.requestId",
        },
        CreatedDate: new Date("2024-01-02T00:00:00Z"),
      },
    ],
  });

  mockedClient.on(GetRoutesCommand, { ApiId: wsApiId }).resolves({
    Items: [
      {
        RouteId: "r-connect",
        RouteKey: "$connect",
        Target: "integrations/i-socket",
      },
      {
        RouteId: "r-default",
        RouteKey: "$default",
        Target: "integrations/i-socket",
      },
    ],
  });
  mockedClient.on(GetIntegrationsCommand, { ApiId: wsApiId }).resolves({
    Items: [
      {
        IntegrationId: "i-socket",
        IntegrationType: "AWS_PROXY",
        IntegrationUri: `arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions/${wsFunctionArn}/invocations`,
      },
    ],
  });
  mockedClient.on(GetAuthorizersCommand, { ApiId: wsApiId }).resolves({
    Items: [],
  });
  mockedClient
    .on(GetStagesCommand, { ApiId: wsApiId })
    .resolves({ Items: [{ StageName: "production" }] });

  // Getters run in order, as later getters depend on the APIs scanned by GetApis
  for (const getter of ApiGatewayScanner.getters) {
    await getter(client, connector, testContext);
  }

  const nodes: GraphState[] = [];
  for (const entity of ApiGatewayScanner.entities ?? []) {
    for await (const node of generateNodesFromEntity(
      connector,
      testContext,
      entity,
    )) {
      nodes.push(node as GraphState);
    }
  }

  return { connector, nodes };
}

t.test("Nodes are generated for APIs and their resources", async (t) => {
  const { nodes } = await scan();

  const bySubcategory = (subcategory: string) =>
    nodes.filter((node) => node.resource.subcategory === subcategory);

  for (const node of nodes as BaseState[]) {
    t.equal(node.tenant.tenantId, account);
    t.equal(node.tenant.provider, "aws");
    t.equal(node.location?.code, region);
    t.equal(node.resource.category, "api-gateway");
    t.equal(node.$graph.id, node.resource.id);
    t.ok(node.$metadata.version);
    t.ok(node.$source?.command);
  }

  const apis = bySubcategory("apis");
  t.equal(apis.length, 2);
  const httpApi = apis.find((api) => api.$graph.id === httpApiArn);
  t.ok(httpApi);
  t.equal(httpApi?.$graph.nodeClass, "visual");
  t.equal(httpApi?.$graph.label, "http-api");
  t.equal(httpApi?.apiGateway.protocol, "HTTP");
  t.equal(httpApi?.apiGateway.apiId, httpApiId);
  t.same(httpApi?.dns?.domains, [httpApi?.apiGateway.endpoint]);
  t.equal(httpApi?.audit?.createdAt, Date.parse("2024-01-01T00:00:00Z"));
  const wsApi = apis.find((api) => api.$graph.id === wsApiArn);
  t.equal(wsApi?.apiGateway.protocol, "WEBSOCKET");
  t.same(wsApi?.dns?.domains, []);

  const routes = bySubcategory("route");
  t.equal(routes.length, 8);
  const getUsers = routes.find(
    (route) => route.apiGateway.route?.routeKey === "GET /users",
  );
  t.equal(getUsers?.$graph.id, `${httpApiArn}/routes/r-get-users`);
  t.equal(getUsers?.$graph.parent, httpApiArn);
  t.equal(getUsers?.$graph.nodeClass, "informational");
  t.equal(getUsers?.apiGateway.route?.integrationId, "i-users");
  t.equal(getUsers?.apiGateway.route?.authorizerId, "a-lambda");

  const integrations = bySubcategory("integration");
  t.equal(integrations.length, 7);
  const sqsIntegration = integrations.find(
    (integration) =>
      integration.apiGateway.integration?.integrationId === "i-sqs",
  );
  t.equal(sqsIntegration?.$graph.id, `${httpApiArn}/integrations/i-sqs`);
  t.equal(sqsIntegration?.apiGateway.integration?.resolvedTarget, queueArn);
  t.same(sqsIntegration?.iam?.roles, [
    { arn: integrationRoleArn, label: "integration-credentials" },
  ]);
  const httpIntegration = integrations.find(
    (integration) =>
      integration.apiGateway.integration?.integrationId === "i-http",
  );
  t.equal(httpIntegration?.apiGateway.integration?.resolvedTarget, undefined);

  const authorizers = bySubcategory("authorizer");
  t.equal(authorizers.length, 2);
  const lambdaAuthorizer = authorizers.find(
    (authorizer) => authorizer.apiGateway.authorizer?.type === "REQUEST",
  );
  t.equal(
    lambdaAuthorizer?.apiGateway.authorizer?.resolvedTarget,
    authFunctionArn,
  );
  const jwtAuthorizer = authorizers.find(
    (authorizer) => authorizer.apiGateway.authorizer?.type === "JWT",
  );
  t.equal(
    jwtAuthorizer?.apiGateway.authorizer?.jwt?.issuer,
    "https://issuer.example.com",
  );
  t.equal(jwtAuthorizer?.apiGateway.authorizer?.resolvedTarget, undefined);

  const stages = bySubcategory("stage");
  t.equal(stages.length, 2);
  const defaultStage = stages.find(
    (stage) => stage.$graph.parent === httpApiArn,
  );
  t.equal(defaultStage?.$graph.id, `${httpApiArn}/stages/$default`);
  t.equal(
    defaultStage?.apiGateway.stage?.accessLogs?.destinationArn,
    logGroupArn,
  );
  t.equal(defaultStage?.audit?.createdAt, Date.parse("2024-01-02T00:00:00Z"));
});

t.test("Edges are derived from routes and their integrations", async (t) => {
  const { connector } = await scan();
  const edges = await ApiGatewayScanner.getEdges!(connector);

  const edgeMap = Object.fromEntries(
    edges.map((edge) => [
      `${edge.source}->${edge.target}`,
      edge.metadata?.label,
    ]),
  );

  t.same(edgeMap, {
    // Routes using the same function, including through an alias, are merged into one edge
    [`${httpApiArn}->${usersFunctionArn}`]: "GET /users, POST /users",
    [`${httpApiArn}->${authFunctionArn}`]: "Authorizer: lambda-auth",
    [`${httpApiArn}->${queueArn}`]: "POST /orders",
    [`${httpApiArn}->${loadBalancerArn}`]: "ANY /internal/{proxy+}",
    [`${httpApiArn}->${logGroupArn}`]: "Access logs ($default)",
    [`${wsApiArn}->${wsFunctionArn}`]: "$connect, $default",
  });
});

t.test(
  "IAM roles are attributed to the API for routed integrations and authorizers",
  async (t) => {
    const { connector } = await scan();
    const roles = await ApiGatewayScanner.getIamRoles!(connector);
    t.same(
      roles.sort((a, b) => a.roleArn.localeCompare(b.roleArn)),
      [
        { roleArn: authorizerRoleArn, executor: httpApiArn },
        { roleArn: integrationRoleArn, executor: httpApiArn },
      ],
    );
  },
);
