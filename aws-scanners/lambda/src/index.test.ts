import { mkdtempSync } from "fs";
import { env } from "process";
import { join } from "path";
import { tmpdir } from "os";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  ListFunctionsCommand,
  GetFunctionCommand,
} from "@aws-sdk/client-lambda";
import { generateNodesFromEntity } from "@infrascan/core";
import buildFsConnector from "@infrascan/fs-connector";
import LambdaScanner from ".";
import { LambdaFunction } from "./graph";

const stateDirectoryPrefix = "infrascan-test-state-";
const baseDirectory =
  env.DEBUG_STATE != null
    ? stateDirectoryPrefix
    : join(tmpdir(), stateDirectoryPrefix);
const tmpDir = mkdtempSync(baseDirectory);
const connector = buildFsConnector(tmpDir);

t.test(
  "State is pulled correctly from Lambda, and formatted as expected",
  async ({ equal, ok }) => {
    const testContext = {
      region: "us-east-1",
      account: "0".repeat(8),
    };
    const lambdaClient = LambdaScanner.getClient(fromProcess(), testContext);

    const mockedLambdaClient = mockClient(lambdaClient);

    // Mock each of the functions used to pull state
    const lambdaName = "test-func";
    const lambdaArn = `arn:aws:lambda:${testContext.region}:${testContext.account}:function:${lambdaName}`;
    mockedLambdaClient.on(ListFunctionsCommand).resolves({
      Functions: [
        {
          FunctionArn: lambdaArn,
          FunctionName: lambdaName,
        },
      ],
    });

    const lambdaRole = `arn:aws:iam::${testContext.account}:role:lambda-role`;
    mockedLambdaClient.on(GetFunctionCommand).resolves({
      Configuration: {
        Role: lambdaRole,
        FunctionArn: lambdaArn,
        FunctionName: lambdaName,
      },
      Code: {
        ImageUri: "hub.docker.com",
      },
    });

    for (const scannerFn of LambdaScanner.getters) {
      await scannerFn(lambdaClient, connector, testContext);
    }

    equal(mockedLambdaClient.commandCalls(ListFunctionsCommand).length, 1);
    equal(mockedLambdaClient.commandCalls(GetFunctionCommand).length, 1);

    const getFunctionArgs = mockedLambdaClient
      .commandCalls(GetFunctionCommand)
      .at(0)?.args;
    equal(getFunctionArgs?.[0].input.FunctionName, lambdaArn);

    if (LambdaScanner.getIamRoles != null) {
      const roles = await LambdaScanner.getIamRoles(connector);
      equal(roles.length, 1);
      equal(roles[0].roleArn, lambdaRole);
      equal(roles[0].executor, lambdaArn);
    }

    for (const entity of LambdaScanner.entities ?? []) {
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
        equal(node.iam?.roles[0].arn, lambdaRole);
        ok((node as unknown as LambdaFunction).lambda);
      }
    }
  },
);

t.test("No functions returned from ListFunctionsCommand", async ({ equal }) => {
  const testContext = {
    region: "us-east-1",
    account: "0".repeat(8),
  };
  const lambdaClient = LambdaScanner.getClient(fromProcess(), testContext);

  const mockedLambdaClient = mockClient(lambdaClient);

  // Mock each of the functions used to pull state
  mockedLambdaClient.on(ListFunctionsCommand).resolves({
    Functions: [],
  });

  for (const scannerFn of LambdaScanner.getters) {
    await scannerFn(lambdaClient, connector, testContext);
  }

  equal(mockedLambdaClient.commandCalls(ListFunctionsCommand).length, 1);
  equal(mockedLambdaClient.commandCalls(GetFunctionCommand).length, 0);
});
