import { mkdtempSync } from "fs";
import t from "tap";
import { env } from "process";
import { join } from "path";
import { tmpdir } from "os";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  GetApisCommand,
  GetDomainNamesCommand,
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
        Tags: { team: "payments" },
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

t.test("API nodes are keyed by their ARN", async (t) => {
  const { nodes } = await scan();

  for (const node of nodes as BaseState[]) {
    t.equal(node.tenant.tenantId, account);
    t.equal(node.tenant.provider, "aws");
    t.equal(node.location?.code, region);
    t.equal(node.resource.category, "api-gateway");
    t.equal(node.resource.subcategory, "apis");
    t.equal(node.$graph.id, node.resource.id);
    t.equal(node.$graph.nodeClass, "visual");
    t.equal(node.$source?.command, "GetApis");
    t.ok(node.$metadata.version);
  }

  t.equal(nodes.length, 2);
  const httpApi = nodes.find((api) => api.$graph.id === httpApiArn);
  t.ok(httpApi);
  t.equal(httpApi?.$graph.label, "http-api");
  t.equal(httpApi?.apiGateway.protocol, "HTTP");
  t.equal(httpApi?.apiGateway.apiId, httpApiId);
  t.equal(
    httpApi?.apiGateway.endpoint,
    `https://${httpApiId}.execute-api.${region}.amazonaws.com`,
  );
  t.same(httpApi?.dns?.domains, [httpApi?.apiGateway.endpoint]);
  t.equal(httpApi?.audit?.createdAt, Date.parse("2024-01-01T00:00:00Z"));
  t.same(httpApi?.tags, [{ key: "team", value: "payments" }]);

  const wsApi = nodes.find((api) => api.$graph.id === wsApiArn);
  t.equal(wsApi?.apiGateway.protocol, "WEBSOCKET");
  t.same(wsApi?.dns?.domains, []);
});
