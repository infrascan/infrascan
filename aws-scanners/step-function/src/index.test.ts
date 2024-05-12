import { mkdtempSync } from "fs";
import { env } from "process";
import { join } from "path";
import { tmpdir } from "os";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
    ListStateMachinesCommand,
    DescribeStateMachineCommand
} from "@aws-sdk/client-sfn";
import buildFsConnector from "@infrascan/fs-connector";
import SFNScanner from "../src";

const stateDirectoryPrefix = "infrascan-test-state-";
const baseDirectory =
    env.DEBUG_STATE != null
        ? stateDirectoryPrefix
        : join(tmpdir(), stateDirectoryPrefix);
const tmpDir = mkdtempSync(baseDirectory);
const connector = buildFsConnector(tmpDir);

t.test("When no step functions are returned from the list command, no describe calls are made.", async () => {
    const testContext = {
        region: "us-east-1",
        account: "0".repeat(8),
    };
    const sfnClient = SFNScanner.getClient(fromProcess(), testContext);

    const mockedSFNClient = mockClient(sfnClient);

    mockedSFNClient.on(ListStateMachinesCommand).resolves({
        stateMachines: []
    });

    for (const scanner of SFNScanner.getters) {
        await scanner(sfnClient, connector, testContext);
    }

    t.equal(mockedSFNClient.commandCalls(ListStateMachinesCommand).length, 1);
    t.equal(mockedSFNClient.commandCalls(DescribeStateMachineCommand).length, 0);

    const nodes = await SFNScanner.getNodes!(connector, testContext);
    t.equal(nodes.length, 0);
});

t.test("Pulls the state as expected for step functions", async () => {
    const testContext = {
        region: "us-east-1",
        account: "0".repeat(8),
    };
    const sfnClient = SFNScanner.getClient(fromProcess(), testContext);

    const mockedSFNClient = mockClient(sfnClient);

    const testStateMachineName = 'testStateMachine';
    const testStateMachineArn = `arn:aws:states:${testContext.region}:${testContext.account}:stateMachine:${testStateMachineName}`;
    mockedSFNClient.on(ListStateMachinesCommand).resolves({
        stateMachines: [{
            stateMachineArn: testStateMachineArn,
            name: testStateMachineName,
            type: 'STANDARD',
            creationDate: new Date()
        }]
    });

    mockedSFNClient.on(DescribeStateMachineCommand).resolves({
        stateMachineArn: testStateMachineArn,
        name: testStateMachineName,
        type: 'STANDARD',
        creationDate: new Date(),
        roleArn: 'test-role'
    });

    for (const scanner of SFNScanner.getters) {
        await scanner(sfnClient, connector, testContext);
    }

    t.equal(mockedSFNClient.commandCalls(ListStateMachinesCommand).length, 1);
    t.equal(mockedSFNClient.commandCalls(DescribeStateMachineCommand).length, 1);

    const nodes = await SFNScanner.getNodes!(connector, testContext);
    t.equal(nodes.length, 1);
    t.ok(nodes.find((statefunc) => statefunc.id === testStateMachineArn && statefunc.name === testStateMachineName));

    const roles = await SFNScanner.getIamRoles!(connector);
    t.equal(roles.length, 1);
    t.ok(roles.find((role) => role.roleArn === 'test-role' && role.executor === testStateMachineArn));
});