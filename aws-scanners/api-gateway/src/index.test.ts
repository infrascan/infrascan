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
import ApiGatewayScanner from "./index";
import { ApiGateway } from "./graph";

const stateDirectoryPrefix = "infrascan-test-state-";
const baseDirectory =
  env.DEBUG_STATE != null
    ? stateDirectoryPrefix
    : join(tmpdir(), stateDirectoryPrefix);
const tmpDir = mkdtempSync(baseDirectory);
const connector = buildFsConnector(tmpDir);

t.test(
  "State is pulled correctly from API-Gateway, and formatted as expected",
  async ({ equal, ok }) => {
    const testContext = {
      region: "us-east-1",
      account: "0".repeat(8),
    };
    const apiGatewayClient = ApiGatewayScanner.getClient(
      fromProcess(),
      testContext,
    );

    const mockedApiGatewayClient = mockClient(apiGatewayClient);

    const FirstApiEndpoint = "my-api-1.aws.com";
    const SecondApiEndpoint = "my-api-2.aws.com";

    // Mock each of the functions used to pull state
    mockedApiGatewayClient.on(GetApisCommand).resolves({
      Items: [
        {
          ApiEndpoint: FirstApiEndpoint,
          Name: "first-api",
          ProtocolType: "HTTP",
          RouteSelectionExpression: "default",
          DisableExecuteApiEndpoint: true,
        },
        {
          ApiEndpoint: SecondApiEndpoint,
          Name: "second-api",
          ProtocolType: "HTTP",
          RouteSelectionExpression: "default",
          DisableExecuteApiEndpoint: false,
        },
      ],
    });

    mockedApiGatewayClient.on(GetDomainNamesCommand).resolves({
      Items: [
        {
          DomainName: "first-api.mysite.com",
        },
        {
          DomainName: "second-api.mysite.com",
        },
      ],
    });

    await Promise.all(
      ApiGatewayScanner.getters.map((getter) =>
        getter(apiGatewayClient, connector, testContext),
      ),
    );

    equal(ApiGatewayScanner.entities?.length, 1);
    for (const entity of ApiGatewayScanner.entities ?? []) {
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
        equal((node as unknown as ApiGateway).apiGateway.protocol, "HTTP");
        if (
          (node as unknown as ApiGateway).apiGateway.disableExecuteApiEndpoint
        ) {
          equal(node.dns?.domains.length, 0);
        } else {
          equal(node.dns?.domains.length, 1);
        }
      }
    }
  },
);
