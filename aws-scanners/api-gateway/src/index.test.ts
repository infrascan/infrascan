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
import buildFsConnector from "@infrascan/fs-connector";
import ApiGatewayScanner from "./index";

const stateDirectoryPrefix = "infrascan-test-state-";
const baseDirectory =
  env.DEBUG_STATE != null
    ? stateDirectoryPrefix
    : join(tmpdir(), stateDirectoryPrefix);
const tmpDir = mkdtempSync(baseDirectory);
const connector = buildFsConnector(tmpDir);

t.test(
  "State is pulled correctly from API-Gateway, and formatted as expected",
  async () => {
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
        },
        {
          ApiEndpoint: SecondApiEndpoint,
          Name: "second-api",
          ProtocolType: "HTTP",
          RouteSelectionExpression: "default",
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
  },
);
