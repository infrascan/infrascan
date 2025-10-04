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
  DescribeSecurityGroupsCommand,
  DescribeLaunchTemplatesCommand,
  DescribeLaunchTemplateVersionsCommand,
  EC2ServiceException,
} from "@aws-sdk/client-ec2";
import buildFsConnector from "@infrascan/fs-connector";
import EC2Scanner from ".";
import {
  DescribeVpcs,
  DescribeSubnets,
  DescribeSecurityGroups,
  DescribeLaunchTemplates,
  DescribeLaunchTemplateVersions,
} from "./generated/getters";

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

// Test: Security groups are always scanned independently
t.test("Security groups are scanned independently", async ({ equal }) => {
  const testContext = {
    region: "us-east-1",
    account: "0".repeat(8),
  };
  const ec2Client = EC2Scanner.getClient(fromProcess(), testContext);
  const mockedEc2Client = mockClient(ec2Client);

  mockedEc2Client.on(DescribeSecurityGroupsCommand).resolves({
    SecurityGroups: [],
  });

  await DescribeSecurityGroups(ec2Client, connector, testContext);

  equal(mockedEc2Client.commandCalls(DescribeSecurityGroupsCommand).length, 1);
  const calls = mockedEc2Client.commandCalls(DescribeSecurityGroupsCommand);
  equal(Object.keys(calls[0].args[0].input).length, 1); // Only NextToken parameter
  equal(calls[0].args[0].input.NextToken, undefined); // NextToken is undefined for first call
});

// Test: Launch templates are scanned independently
t.test("Launch templates are scanned independently", async ({ equal }) => {
  const testContext = {
    region: "us-east-1",
    account: "0".repeat(8),
  };
  const ec2Client = EC2Scanner.getClient(fromProcess(), testContext);
  const mockedEc2Client = mockClient(ec2Client);

  mockedEc2Client.on(DescribeLaunchTemplatesCommand).resolves({
    LaunchTemplates: [],
  });

  await DescribeLaunchTemplates(ec2Client, connector, testContext);

  equal(mockedEc2Client.commandCalls(DescribeLaunchTemplatesCommand).length, 1);
  const calls = mockedEc2Client.commandCalls(DescribeLaunchTemplatesCommand);
  equal(Object.keys(calls[0].args[0].input).length, 1); // Only NextToken parameter
  equal(calls[0].args[0].input.NextToken, undefined); // NextToken is undefined for first call
});

// Test: Subnets use VPC IDs for filtering
t.test("Subnets are filtered by VPC IDs", async ({ equal }) => {
  const testContext = {
    region: "us-east-1",
    account: "0".repeat(8),
  };
  const ec2Client = EC2Scanner.getClient(fromProcess(), testContext);
  const mockedEc2Client = mockClient(ec2Client);

  const vpcId1 = "vpc-12345";
  const vpcId2 = "vpc-67890";

  mockedEc2Client.on(DescribeVpcsCommand).resolves({
    Vpcs: [{ VpcId: vpcId1 }, { VpcId: vpcId2 }],
  });

  mockedEc2Client.on(DescribeSubnetsCommand).resolves({
    Subnets: [],
  });

  // Execute VPCs first to populate state
  await DescribeVpcs(ec2Client, connector, testContext);
  // Then execute Subnets which depends on VPC state
  await DescribeSubnets(ec2Client, connector, testContext);

  // Verify subnets called with VPC ID filters
  equal(mockedEc2Client.commandCalls(DescribeSubnetsCommand).length, 2);
  const subnetCalls = mockedEc2Client.commandCalls(DescribeSubnetsCommand);
  equal(subnetCalls[0].args[0].input.Filters, vpcId1);
  equal(subnetCalls[1].args[0].input.Filters, vpcId2);
});

// Test: Launch template versions depend on template IDs
t.test(
  "Launch template versions use template IDs from previous scan",
  async ({ equal, same }) => {
    const testContext = {
      region: "us-east-1",
      account: "0".repeat(8),
    };
    const ec2Client = EC2Scanner.getClient(fromProcess(), testContext);
    const mockedEc2Client = mockClient(ec2Client);

    const templateId1 = "lt-12345";
    const templateId2 = "lt-67890";

    mockedEc2Client.on(DescribeLaunchTemplatesCommand).resolves({
      LaunchTemplates: [
        { LaunchTemplateId: templateId1 },
        { LaunchTemplateId: templateId2 },
      ],
    });

    mockedEc2Client.on(DescribeLaunchTemplateVersionsCommand).resolves({
      LaunchTemplateVersions: [],
    });

    // Execute templates first to populate state
    await DescribeLaunchTemplates(ec2Client, connector, testContext);
    // Then execute versions which depends on template state
    await DescribeLaunchTemplateVersions(ec2Client, connector, testContext);

    // Verify versions called with template IDs and hardcoded versions
    equal(
      mockedEc2Client.commandCalls(DescribeLaunchTemplateVersionsCommand)
        .length,
      2,
    );
    const versionCalls = mockedEc2Client.commandCalls(
      DescribeLaunchTemplateVersionsCommand,
    );
    equal(versionCalls[0].args[0].input.LaunchTemplateId, templateId1);
    same(versionCalls[0].args[0].input.Versions, ["$Latest", "$Default"]);
    equal(versionCalls[1].args[0].input.LaunchTemplateId, templateId2);
    same(versionCalls[1].args[0].input.Versions, ["$Latest", "$Default"]);
  },
);

// Test: No template versions scanned when no templates exist
t.test(
  "Launch template versions not scanned when no templates",
  async ({ equal }) => {
    const testContext = {
      region: "us-east-1",
      account: "0".repeat(8),
    };
    const ec2Client = EC2Scanner.getClient(fromProcess(), testContext);
    const mockedEc2Client = mockClient(ec2Client);

    mockedEc2Client.on(DescribeLaunchTemplatesCommand).resolves({
      LaunchTemplates: [],
    });

    await DescribeLaunchTemplates(ec2Client, connector, testContext);
    await DescribeLaunchTemplateVersions(ec2Client, connector, testContext);

    equal(
      mockedEc2Client.commandCalls(DescribeLaunchTemplateVersionsCommand)
        .length,
      0,
    );
  },
);

// Test: Security groups pagination handling
t.test("Security groups pagination works correctly", async ({ equal }) => {
  const testContext = {
    region: "us-east-1",
    account: "0".repeat(8),
  };
  const ec2Client = EC2Scanner.getClient(fromProcess(), testContext);
  const mockedEc2Client = mockClient(ec2Client);

  mockedEc2Client
    .on(DescribeSecurityGroupsCommand, { NextToken: undefined })
    .resolvesOnce({ SecurityGroups: [], NextToken: "token123" })
    .on(DescribeSecurityGroupsCommand, { NextToken: "token123" })
    .resolvesOnce({ SecurityGroups: [] }); // No NextToken = end

  await DescribeSecurityGroups(ec2Client, connector, testContext);

  equal(mockedEc2Client.commandCalls(DescribeSecurityGroupsCommand).length, 2);

  const calls = mockedEc2Client.commandCalls(DescribeSecurityGroupsCommand);
  equal(calls[0].args[0].input.NextToken, undefined);
  equal(calls[1].args[0].input.NextToken, "token123");
});

// Test: Launch templates pagination handling
t.test("Launch templates pagination works correctly", async ({ equal }) => {
  const testContext = {
    region: "us-east-1",
    account: "0".repeat(8),
  };
  const ec2Client = EC2Scanner.getClient(fromProcess(), testContext);
  const mockedEc2Client = mockClient(ec2Client);

  mockedEc2Client
    .on(DescribeLaunchTemplatesCommand, { NextToken: undefined })
    .resolvesOnce({ LaunchTemplates: [], NextToken: "token456" })
    .on(DescribeLaunchTemplatesCommand, { NextToken: "token456" })
    .resolvesOnce({ LaunchTemplates: [] }); // No NextToken = end

  await DescribeLaunchTemplates(ec2Client, connector, testContext);

  equal(mockedEc2Client.commandCalls(DescribeLaunchTemplatesCommand).length, 2);

  const calls = mockedEc2Client.commandCalls(DescribeLaunchTemplatesCommand);
  equal(calls[0].args[0].input.NextToken, undefined);
  equal(calls[1].args[0].input.NextToken, "token456");
});

// Test: Retryable error handling
t.test("Handles retryable EC2 errors correctly", async ({ equal, pass }) => {
  const testContext = {
    region: "us-east-1",
    account: "0".repeat(8),
  };
  const ec2Client = EC2Scanner.getClient(fromProcess(), testContext);
  const mockedEc2Client = mockClient(ec2Client);

  const retryableError = new EC2ServiceException({
    name: "ThrottlingException",
    $fault: "client",
    $retryable: { throttling: true },
    $metadata: {},
    message: "Rate exceeded",
  });

  mockedEc2Client.on(DescribeSecurityGroupsCommand).rejects(retryableError);

  // Should not throw, should log and continue
  try {
    await DescribeSecurityGroups(ec2Client, connector, testContext);
    pass("Function completed without throwing");
  } catch (err) {
    throw new Error("Function should not throw on retryable errors");
  }

  equal(mockedEc2Client.commandCalls(DescribeSecurityGroupsCommand).length, 1);
});

// Test: Non-retryable error handling
t.test(
  "Handles non-retryable EC2 errors correctly",
  async ({ equal, pass }) => {
    const testContext = {
      region: "us-east-1",
      account: "0".repeat(8),
    };
    const ec2Client = EC2Scanner.getClient(fromProcess(), testContext);
    const mockedEc2Client = mockClient(ec2Client);

    const nonRetryableError = new EC2ServiceException({
      name: "AccessDenied",
      $fault: "client",
      $metadata: {},
      message: "Access denied",
    });

    mockedEc2Client
      .on(DescribeSecurityGroupsCommand)
      .rejects(nonRetryableError);

    try {
      await DescribeSecurityGroups(ec2Client, connector, testContext);
      pass("Function completed without throwing");
    } catch (err) {
      throw new Error("Function should not throw on non-retryable errors");
    }

    equal(
      mockedEc2Client.commandCalls(DescribeSecurityGroupsCommand).length,
      1,
    );
  },
);

// Test: Complete EC2 scanner execution flow
t.test("Complete EC2 scanner execution flow", async ({ equal }) => {
  const testContext = {
    region: "us-east-1",
    account: "0".repeat(8),
  };
  const ec2Client = EC2Scanner.getClient(fromProcess(), testContext);
  const mockedEc2Client = mockClient(ec2Client);

  // Mock all commands with realistic responses
  mockedEc2Client.on(DescribeVpcsCommand).resolves({
    Vpcs: [{ VpcId: "vpc-1" }, { VpcId: "vpc-2" }],
  });

  mockedEc2Client.on(DescribeSubnetsCommand).resolves({
    Subnets: [],
  });

  mockedEc2Client.on(DescribeSecurityGroupsCommand).resolves({
    SecurityGroups: [{ GroupId: "sg-123" }],
  });

  mockedEc2Client.on(DescribeLaunchTemplatesCommand).resolves({
    LaunchTemplates: [
      { LaunchTemplateId: "lt-1" },
      { LaunchTemplateId: "lt-2" },
      { LaunchTemplateId: "lt-3" },
    ],
  });

  mockedEc2Client.on(DescribeLaunchTemplateVersionsCommand).resolves({
    LaunchTemplateVersions: [],
  });

  // Execute all getters in sequence (as done in production)
  for (const scannerFn of EC2Scanner.getters) {
    await scannerFn(ec2Client, connector, testContext);
  }

  // Verify execution counts and sequence
  equal(mockedEc2Client.commandCalls(DescribeVpcsCommand).length, 1);
  equal(mockedEc2Client.commandCalls(DescribeSubnetsCommand).length, 2); // 2 VPCs
  equal(mockedEc2Client.commandCalls(DescribeSecurityGroupsCommand).length, 1);
  equal(mockedEc2Client.commandCalls(DescribeLaunchTemplatesCommand).length, 1);
  equal(
    mockedEc2Client.commandCalls(DescribeLaunchTemplateVersionsCommand).length,
    3,
  ); // 3 templates
});
