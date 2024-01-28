import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { env } from "process";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
    DescribeVpcsCommand,
    DescribeSubnetsCommand
} from "@aws-sdk/client-ec2";
import buildFsConnector from "@infrascan/fs-connector";
import EC2Scanner from "../src";

const stateDirectoryPrefix = "infrascan-test-state-";
const baseDirectory =
    env.DEBUG_STATE != null
        ? stateDirectoryPrefix
        : join(tmpdir(), stateDirectoryPrefix);
const tmpDir = mkdtempSync(baseDirectory);
const connector = buildFsConnector(tmpDir);

t.test(
    "When no VPCs are returned, subnets aren't scanned",
    async () => {
        const testContext = {
            region: "us-east-1",
            account: "0".repeat(8),
        };
        const ec2Client = EC2Scanner.getClient(fromProcess(), testContext);

        const mockedEc2Client = mockClient(ec2Client);

        mockedEc2Client.on(DescribeVpcsCommand).resolves({
            Vpcs: []
        });

        for (const scannerFn of EC2Scanner.getters) {
            await scannerFn(ec2Client, connector, testContext);
        }

        t.equal(mockedEc2Client.commandCalls(DescribeVpcsCommand).length, 1);
        t.equal(mockedEc2Client.commandCalls(DescribeSubnetsCommand).length, 0);
    });

t.test(
    "When VPCs are returned, scans subnets and builds the expected hierarchy",
    async () => {
        const testContext = {
            region: "us-east-1",
            account: "0".repeat(8),
        };
        const ec2Client = EC2Scanner.getClient(fromProcess(), testContext);

        const mockedEc2Client = mockClient(ec2Client);

        const testVpcId = 'test-vpc-000000000';
        const testVpcCidr = '10.0.0.0/22';
        mockedEc2Client.on(DescribeVpcsCommand).resolves({
            Vpcs: [{
                VpcId: testVpcId,
                CidrBlock: testVpcCidr
            }]
        });

        const testSubnetId1 = 'subnet-000000000001';
        const testSubnetId2 = 'subnet-000000000002';
        const testSubnetArn1 = `arn:aws:ec2:eu-west-1:00000000000:subnet/${testSubnetId1}`;
        const testSubnetArn2 = `arn:aws:ec2:eu-west-1:00000000000:subnet/${testSubnetId2}`;
        const testAZ1 = 'eu-west-1a';
        const testAZ2 = 'eu-west-1b';
        const testAZID1 = 'euw1-az1';
        const testAZID2 = 'euw1-az2';
        const testCidrBlock1 = '10.0.1.0/24';
        const testCidrBlock2 = '10.0.2.0/24';
        mockedEc2Client.on(DescribeSubnetsCommand).resolves({
            Subnets: [{
                SubnetArn: testSubnetArn1,
                SubnetId: testSubnetId1,
                AvailabilityZone: testAZ1,
                AvailabilityZoneId: testAZID1,
                CidrBlock: testCidrBlock1,
                VpcId: testVpcId,
            }, {
                SubnetArn: testSubnetArn2,
                SubnetId: testSubnetId2,
                AvailabilityZone: testAZ2,
                AvailabilityZoneId: testAZID2,
                CidrBlock: testCidrBlock2,
                VpcId: testVpcId,
            }]
        });

        for (const scannerFn of EC2Scanner.getters) {
            await scannerFn(ec2Client, connector, testContext);
        }

        t.equal(mockedEc2Client.commandCalls(DescribeVpcsCommand).length, 1);
        t.equal(mockedEc2Client.commandCalls(DescribeSubnetsCommand).length, 1);

        const nodes = await EC2Scanner.getNodes!(connector, testContext);
        t.equal(nodes.length, 5);

        // Node for VPC found
        t.ok(nodes.find((node) => node.data.id === testVpcId));
        // Node for Subnet's AZ found with VPC as parent
        t.ok(nodes.find((node) => node.data.id === `${testVpcId}-${testAZ1}` && node.data.parent === testVpcId));
        t.ok(nodes.find((node) => node.data.id === `${testVpcId}-${testAZ2}` && node.data.parent === testVpcId));
        // Node for Subnets found with AZ as parent
        t.ok(nodes.find((node) => node.data.id === testSubnetId1 && node.data.parent === `${testVpcId}-${testAZ1}`));
        t.ok(nodes.find((node) => node.data.id === testSubnetId2 && node.data.parent === `${testVpcId}-${testAZ2}`));
    });  