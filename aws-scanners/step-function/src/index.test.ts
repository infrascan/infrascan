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
import { generateNodesFromEntity } from "@infrascan/core";
import buildFsConnector from "@infrascan/fs-connector";
import SFNScanner from ".";
import { StepFunctionState } from "./graph";

const stateDirectoryPrefix = "infrascan-test-state-";
const baseDirectory =
  env.DEBUG_STATE != null
    ? stateDirectoryPrefix
    : join(tmpdir(), stateDirectoryPrefix);
const tmpDir = mkdtempSync(baseDirectory);
const connector = buildFsConnector(tmpDir);

t.test(
  "When no step functions are returned from the list command, no describe calls are made.",
  async ({ equal }) => {
    const testContext = {
      region: "us-east-1",
      account: "0".repeat(8),
    };
    const sfnClient = SFNScanner.getClient(fromProcess(), testContext);

    const mockedSFNClient = mockClient(sfnClient);

    mockedSFNClient.on(ListStateMachinesCommand).resolves({
      stateMachines: [],
    });

    for (const scanner of SFNScanner.getters) {
      await scanner(sfnClient, connector, testContext);
    }

    equal(mockedSFNClient.commandCalls(ListStateMachinesCommand).length, 1);
    equal(mockedSFNClient.commandCalls(DescribeStateMachineCommand).length, 0);
  },
);

t.test(
  "Pulls the state as expected for step functions",
  async ({ equal, ok }) => {
    const testContext = {
      region: "us-east-1",
      account: "0".repeat(8),
    };
    const sfnClient = SFNScanner.getClient(fromProcess(), testContext);

    const mockedSFNClient = mockClient(sfnClient);

    const testStateMachineName = "testStateMachine";
    const testStateMachineArn = `arn:aws:states:${testContext.region}:${testContext.account}:stateMachine:${testStateMachineName}`;
    mockedSFNClient.on(ListStateMachinesCommand).resolves({
      stateMachines: [
        {
          stateMachineArn: testStateMachineArn,
          name: testStateMachineName,
          type: "STANDARD",
          creationDate: new Date(),
        },
      ],
    });

    mockedSFNClient.on(DescribeStateMachineCommand).resolves({
      stateMachineArn: testStateMachineArn,
      name: testStateMachineName,
      type: "STANDARD",
      creationDate: new Date(),
      roleArn: "test-role",
    });

    for (const scanner of SFNScanner.getters) {
      await scanner(sfnClient, connector, testContext);
    }

    equal(mockedSFNClient.commandCalls(ListStateMachinesCommand).length, 1);
    equal(mockedSFNClient.commandCalls(DescribeStateMachineCommand).length, 1);

    const roles = await SFNScanner.getIamRoles!(connector);
    equal(roles.length, 1);
    ok(
      roles.find(
        (role) =>
          role.roleArn === "test-role" && role.executor === testStateMachineArn,
      ),
    );

    for (const entity of SFNScanner.entities ?? []) {
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
        ok(node.audit?.createdAt);
        equal(node.iam?.roles.length, 1);
        ok((node as unknown as StepFunctionState).stepFunction);
      }
    }
  },
);
