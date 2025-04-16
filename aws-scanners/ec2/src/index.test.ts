import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { env } from "process";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
} from "@aws-sdk/client-ec2";
import buildFsConnector from "@infrascan/fs-connector";
import EC2Scanner from ".";

const stateDirectoryPrefix = "infrascan-test-state-";
const baseDirectory =
  env.DEBUG_STATE != null
    ? stateDirectoryPrefix
    : join(tmpdir(), stateDirectoryPrefix);
const tmpDir = mkdtempSync(baseDirectory);
const connector = buildFsConnector(tmpDir);

t.test(
  "When no VPCs are returned, subnets aren't scanned",
  async ({ equal }) => {
    const testContext = {
      region: "us-east-1",
      account: "0".repeat(8),
    };
    const ec2Client = EC2Scanner.getClient(fromProcess(), testContext);

    const mockedEc2Client = mockClient(ec2Client);

    mockedEc2Client.on(DescribeVpcsCommand).resolves({
      Vpcs: [],
    });

    for (const scannerFn of EC2Scanner.getters) {
      await scannerFn(ec2Client, connector, testContext);
    }

    equal(mockedEc2Client.commandCalls(DescribeVpcsCommand).length, 1);
    equal(mockedEc2Client.commandCalls(DescribeSubnetsCommand).length, 0);
  },
);
