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
import buildFsConnector from "@infrascan/fs-connector";
import LambdaScanner from "../src";

const stateDirectoryPrefix = "infrascan-test-state-";
const baseDirectory =
  env.DEBUG_STATE != null
    ? stateDirectoryPrefix
    : join(tmpdir(), stateDirectoryPrefix);
const tmpDir = mkdtempSync(baseDirectory);
const connector = buildFsConnector(tmpDir);

t.test(
  "State is pulled correctly from Lambda, and formatted as expected",
  async () => {
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

    t.equal(mockedLambdaClient.commandCalls(ListFunctionsCommand).length, 1);
    t.equal(mockedLambdaClient.commandCalls(GetFunctionCommand).length, 1);

    const getFunctionArgs = mockedLambdaClient
      .commandCalls(GetFunctionCommand)
      .at(0)?.args;
    t.equal(getFunctionArgs?.[0].input.FunctionName, lambdaArn);

    if (LambdaScanner.getNodes != null) {
      const nodes = await LambdaScanner.getNodes(connector, testContext);
      t.equal(nodes.length, 1);
      t.equal(nodes[0].id, lambdaArn);
      t.equal(nodes[0].data.name, lambdaName);
    }

    if (LambdaScanner.getIamRoles != null) {
      const roles = await LambdaScanner.getIamRoles(connector);
      t.equal(roles.length, 1);
      t.equal(roles[0].roleArn, lambdaRole);
      t.equal(roles[0].executor, lambdaArn);
    }
  },
);
