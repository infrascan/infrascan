import { mkdtempSync } from "fs";
import t from "tap";
import { env } from "process";
import { join } from "path";
import { tmpdir } from "os";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import { DescribeAutoScalingGroupsCommand } from "@aws-sdk/client-auto-scaling";
import buildFsConnector from "@infrascan/fs-connector";
import AutoscalingScanner from "../src";

const stateDirectoryPrefix = "infrascan-test-state-";
const baseDirectory =
  env["DEBUG_STATE"] != null
    ? stateDirectoryPrefix
    : join(tmpdir(), stateDirectoryPrefix);
const tmpDir = mkdtempSync(baseDirectory);
const connector = buildFsConnector(tmpDir);

t.test(
  "State is pulled correctly from Autoscaling, and formatted as expected",
  async () => {
    const testContext = {
      region: "us-east-1",
      account: "0".repeat(8),
    };
    const autoscalingClient = AutoscalingScanner.getClient(
      fromProcess(),
      testContext,
    );

    const mockedAutoscalingClient = mockClient(autoscalingClient);

    // Mock each of the functions used to pull state
    mockedAutoscalingClient.on(DescribeAutoScalingGroupsCommand).resolves({
      AutoScalingGroups: [
        {
          AutoScalingGroupName: "test-group",
          MinSize: 5,
          MaxSize: 10,
          DesiredCapacity: 5,
          DefaultCooldown: 30,
          AvailabilityZones: ["us-east-1"],
          HealthCheckType: "script",
          CreatedTime: new Date(),
        },
      ],
    });

    await Promise.all(
      AutoscalingScanner.getters.map((getter) =>
        getter(autoscalingClient, connector, testContext),
      ),
    );

    const callCount = mockedAutoscalingClient.commandCalls(
      DescribeAutoScalingGroupsCommand,
    ).length;
    t.equal(callCount, 1);
  },
);
